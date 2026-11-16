package no.kristo.finanshub

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale
import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import no.kristo.felles.nett.openSikker
import no.kristo.finanshub.ui.Fig35
import org.json.JSONArray
import org.json.JSONObject

/* ---------- AI-søk som jobb ---------- */

/** En AI-jobb som pågår: motor, sekunder brukt og grensen, og teksten som vises («✦ Ollama tenker … 34 s av 60 s»). */
data class AiJob25(val id: String?, val engine: String?, val elapsedS: Int, val limitS: Int?, val text: String)

/** Avbrutt av brukeren (Avbryt under AI-søket). */
class AiCancelled25 : Exception(AI_CANCELLED25)

const val AI_CANCELLED25 = "Avbrutt"

class P25State {
    /** Klientens tidsgrense i sekunder (clientTimeoutS fra /finans/api/ai/limits). Standard 180. */
    var clientTimeoutS by mutableStateOf(180)
    var limitsAt = 0L
    var job by mutableStateOf<AiJob25?>(null)
    @Volatile var cancelled = false

    /** «Ta meg dit →» og søketreff i Innstillinger: raden som fremheves, og en teller som starter scroll og animasjon på nytt. */
    var hl by mutableStateOf<String?>(null)
    var hlSeq by mutableStateOf(0)
    /** Omtrentlig plass i listen på hovedsiden (gruppekortet), så raden blir komponert før den scrolles fram. */
    var hlIndex by mutableStateOf<Int?>(null)
}

/** Leser klientgrensen fra serveren (hvert 5. minutt). 404 eller feil: beholder 180 s. */
suspend fun AppViewModel.aiClientTimeout25(): Int {
    val now = System.currentTimeMillis()
    if (p25.limitsAt > 0 && now - p25.limitsAt < 5 * 60_000) return p25.clientTimeoutS
    p25.limitsAt = now
    val s = runCatching { JSONObject(api25 { get("/ai/limits") }).optInt("clientTimeoutS", 0) }.getOrNull()
    if (s != null && s > 0) p25.clientTimeoutS = s.coerceIn(30, 900)
    return p25.clientTimeoutS
}

private fun jobText25(engine: String?, el: Int, lim: Int?): String =
    "✦ ${engine?.replaceFirstChar { it.uppercase() } ?: "AI"} tenker … $el s" + (lim?.let { " av $it s" } ?: "")

/**
 * POST /finans/api/search/ai i jobbmodus (?async=1 og Prefer: respond-async på serveren). Raske svar kommer direkte;
 * ellers 202 {jobId}, og jobben følges hvert sekund via GET /finans/api/jobs/:id. Uten jobb-API (404) brukes det
 * synkrone kallet, med lesegrense fra clientTimeoutS i stedet for fast 30 s. Returnerer rå JSON i samme form som før.
 */
suspend fun AppViewModel.aiSearchRaw25(body: JSONObject): String {
    val limit = aiClientTimeout25()
    val readMs = limit * 1000 + 5_000
    p25.cancelled = false
    p25.job = AiJob25(null, null, 0, null, "✦ Søker …")
    try {
        val first = api25 { request("POST", "/search/ai?async=1", body, timeout = 15_000, read = readMs) }
        if (p25.cancelled) throw AiCancelled25()
        val o = runCatching { JSONObject(first) }.getOrNull()
        val id = o?.optStr("jobId") ?: o?.optStr("job_id")
        if (o == null || id == null || o.has("answer") || o.has("hits")) return first
        return pollAiJob25(id, limit) ?: api25 { request("POST", "/search/ai", body, timeout = 15_000, read = readMs) }
    } finally {
        p25.job = null
    }
}

/** Følger jobben til den er ferdig. null = serveren har ikke jobb-API (404), og kallet gjøres synkront. */
private suspend fun AppViewModel.pollAiJob25(id: String, limit: Int): String? {
    val start = System.currentTimeMillis()
    while (true) {
        delay(1000)
        if (p25.cancelled) throw AiCancelled25()
        val raw = try { api25 { get("/jobs/$id") } } catch (e: ApiException) {
            if (e.status == 404) return null
            throw e
        }
        if (p25.cancelled) throw AiCancelled25()
        val j = JSONObject(raw)
        val engine = j.optStr("engine")
        val el = j.optInt("elapsedS", ((System.currentTimeMillis() - start) / 1000).toInt())
        val lim = j.optInt("limitS", 0).takeIf { it > 0 }
        p25.job = AiJob25(id, engine, el, lim, j.optStr("text") ?: jobText25(engine, el, lim))
        when (j.optStr("status")) {
            "done" -> return j.optJSONObject("result")?.toString() ?: raw
            "error" -> throw ApiException(j.optStr("error") ?: "AI-søket feilet")
            "cancelled" -> throw AiCancelled25()
        }
        // Jobben kan gå videre til neste motor (Gemini → Groq …), så appen venter lenger enn én motorgrense før den gir opp.
        if (System.currentTimeMillis() - start > (limit * 2 + 15) * 1000L) {
            runCatching { api25 { delete("/jobs/$id") } }
            throw ApiException("${engine?.replaceFirstChar { it.uppercase() } ?: "AI"} svarte ikke innen $limit s")
        }
    }
}

/** Avbryt: stopper jobben på serveren (DELETE /finans/api/jobs/:id) og i appen. */
fun AppViewModel.cancelAiJob25() {
    p25.cancelled = true
    val id = p25.job?.id
    p25.job = null
    if (id != null) launch25 { runCatching { api25 { delete("/jobs/$id") } } }
}

/* ---------------- Datamodeller ---------------- */

/** Ett steg i en AI-jobb: done | active | pending. */
data class AiStep31(val label: String, val state: String)

/** En AI-jobb som vises i toasten og glassboblen (rask time, assist, kvittering …). */
data class AiJob31(
    val id: String, val kind: String, val title: String, val model: String, val input: String,
    val steps: List<AiStep31>, val fields: List<Pair<String, String>>, val progress: Int?, val state: String, val t0: Long,
)

/** Svaret fra Glimt (søkefelt eller Chat). */
data class Assist31(
    val text: String, val source: String, val intent: String, val card: JSONObject?, val tool: String?, val ms: Long?,
    val chatId: String?, val jobId: String?,
    /** Prompt 33 (memory.add): {memoryId, count, title} for «Endre tittel på N avtaler?». */
    val apply: JSONObject? = null,
    /** Prompt 35: open:{route:'vaer', name, lat, lon} («været i New York»). */
    val open: JSONObject? = null,
    /** Prompt 36: 'question' (kortet under søket) eller 'action' (Glimt-pillen). */
    val kind: String? = null,
    /** Prompt 76: results (verktøykort, f.eks. skjold.find: {kind:'part', id, open:{deepLink}}). */
    val results: org.json.JSONArray? = null,
)

/** Svarboblen under søkefeltet på Hjem. */
data class HomeAns31(val q: String, val busy: Boolean, val text: String = "", val source: String = "", val jobId: String? = null,
    /** Prompt 33: «Endre N avtaler ›» i boblen (POST /api/glimt/memory/:id/apply). */
    val applyId: Int = 0, val applyCount: Int = 0, val applyTitle: String = "",
    /** Prompt 34: Glimt fikk ikke svar (boblen viser Prøv igjen og Åpne AI-kontroll). */
    val err: Boolean = false,
    /** Prompt 35: «geo:lat,lon,navn» – trykk åpner Vær for stedet. */
    val wxGeo: String? = null,
    /** Prompt 37: «hvor er Ingrid» → «Vis på kart ›» åpner Familie med personen valgt. */
    val famPerson37: String? = null)

class P31State {
    /* Glimt-jobbene (toast + boble) */
    var jobs by mutableStateOf<List<AiJob31>>(emptyList())
    var bubble by mutableStateOf(false)
    /** Kort melding i toasten etter en jobb («Avbrutt · ingenting ble lagt til»). */
    var toastMsg by mutableStateOf<String?>(null)
    var toastSeq by mutableStateOf(0)
    /* Søkefeltet på Hjem */
    var ans by mutableStateOf<HomeAns31?>(null)
    internal var ansSeq = 0
    internal var assistMissing = false
    /* banneret ved retur (fjernet i prompt 45) */
    var banner by mutableStateOf<Pair<String, String>?>(null)
    var bannerSeq by mutableStateOf(0)
    internal var away: String? = null
    /** «AI-svar i bakgrunnen» (ai_bg_notify, på som standard). */
    var aiBg by mutableStateOf(true)
    internal var aiBgFor: String? = null
    /* Nordlys OS */
    var nordOpen by mutableStateOf(false)
    var reqPw by mutableStateOf(false)
    var reqPwLoaded by mutableStateOf(false)
    var checking by mutableStateOf(false)
    var osName by mutableStateOf("Nordlys OS")
    var tagline by mutableStateOf("Lys i mørket, kjørt hjemme.")
    var sizeBytes by mutableStateOf<Long?>(null)
    var sha by mutableStateOf("")
    var relDate by mutableStateOf("")
    var bioOn by mutableStateOf(false)
    var bioAsk by mutableStateOf(false)
    var bioBusy by mutableStateOf(false)
    var bioErr by mutableStateOf("")
    var startBusy by mutableStateOf(false)
    /* Prøveperioder */
    var trials by mutableStateOf<List<Trial31>>(emptyList())
    var trialsMissing by mutableStateOf(false)
    var trialBusy by mutableStateOf(false)
    var tn by mutableStateOf("")
    var te by mutableStateOf<LocalDate?>(null)
    var tp by mutableStateOf("")
    var tai by mutableStateOf("")
    var trem by mutableStateOf(setOf(1))
    var trialErr by mutableStateOf("")
    internal var trialsAt = 0L
}

/* ---------------- Hjelpere ---------------- */

internal fun JSONObject.s31(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

/** Lange steder fra timeplan-import («Pilestredet park 35 U2005 https://link.mazemap.com/…»): URL-en fjernes i korte visninger. */
fun noUrl31(t: String?): String = (t ?: "").replace(Regex("\\s*https?://\\S+"), "").trim()

/** Første lenke i teksten (vises som «Åpne kart ↗» i detaljene). */
fun firstUrl31(t: String?): String? = Regex("https?://\\S+").find(t ?: "")?.value

/** «Det er **8° og lettskyet** i Oslo» → [(tekst, fet)]. */
fun boldParts31(t: String): List<Pair<String, Boolean>> {
    val out = ArrayList<Pair<String, Boolean>>()
    var bold = false
    for (part in t.split("**")) { if (part.isNotEmpty()) out += part to bold; bold = !bold }
    return out
}

fun plain31(t: String): String = t.replace("**", "").trim()

private val WD31 = listOf("man", "tir", "ons", "tor", "fre", "lør", "søn")

private val MN31 = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")

/** «lør 1. nov» */
fun dShort31(d: LocalDate): String = "${WD31[d.dayOfWeek.value - 1]} ${d.dayOfMonth}. ${MN31[d.monthValue - 1]}"

internal val OSLO31: ZoneId = ZoneId.of("Europe/Oslo")

/** Steg fra serveren: ["Leser teksten", …] eller [{label|t|title, state}] (state done | active | running | pending). */
internal fun parseSteps31(a: JSONArray?, progress: Int?, state: String): List<AiStep31> {
    if (a == null) return emptyList()
    val raw = ArrayList<Pair<String, String?>>()
    for (i in 0 until a.length()) {
        val v = a.opt(i)
        when (v) {
            is String -> raw += v to null
            is JSONObject -> raw += (v.s31("label") ?: v.s31("t") ?: v.s31("title") ?: v.s31("name") ?: "") to v.s31("state")
        }
    }
    if (raw.isEmpty()) return emptyList()
    if (raw.any { it.second != null }) return raw.map { (l, s) ->
        AiStep31(l, when (s) { "done", "ok", "ferdig" -> "done"; "active", "running", "pågår" -> "active"; else -> if (state == "done") "done" else "pending" })
    }
    // Bare tekster: det aktive steget følger fremdriften.
    val cur = if (state == "done") raw.size else ((progress ?: 0) * raw.size / 100).coerceIn(0, raw.size - 1)
    return raw.mapIndexed { i, (l, _) -> AiStep31(l, if (i < cur) "done" else if (i == cur) "active" else "pending") }
}

/** Felt: [["Hva","Nina frisør"], …], [{k,v}] eller {"Hva":"Nina frisør"}. */
internal fun parseFields31(v: Any?): List<Pair<String, String>> {
    val out = ArrayList<Pair<String, String>>()
    when (v) {
        is JSONArray -> for (i in 0 until v.length()) {
            val x = v.opt(i)
            if (x is JSONArray && x.length() >= 2) out += x.optString(0) to x.optString(1)
            else if (x is JSONObject) out += (x.s31("k") ?: x.s31("label") ?: x.s31("key") ?: "") to (x.s31("v") ?: x.s31("value") ?: "")
        }
        is JSONObject -> v.keys().forEach { k -> out += k to v.optString(k) }
    }
    return out.filter { it.first.isNotBlank() && it.second.isNotBlank() }
}

/** Standardstegene for rask time (fasiten), når serveren ikke sender egne. */
internal val QUICK_STEPS31 = listOf("Leser teksten", "Finner dato og klokkeslett", "Sjekker kalenderen for kollisjoner", "Lagrer avtalen")

/** Rask time uten live-steg: steg og fremdrift anslås ut fra tiden (2,6 s som i fasiten, stopper på siste steg). */
internal fun quickJob31(j: Quick29Job, t0: Long, now: Long): AiJob31 {
    val pr = ((now - t0) / 2600.0).coerceIn(0.0, .95)
    val cur = (pr * QUICK_STEPS31.size).toInt().coerceIn(0, QUICK_STEPS31.size - 1)
    val f = j.found
    val fields = if (f?.date != null) listOf(
        "Hva" to f.title, "Når" to quickLabel29(f.date, f.start) + (f.end?.let { "–$it" } ?: ""), "Kalender" to "Privat",
        "Varsel" to if (f.start.isNullOrBlank()) "Ingen" else "1 time før",
    ) else emptyList()
    return AiJob31(j.id, "quick", "Legger til i kalenderen", "Glimt · lokal", j.text,
        QUICK_STEPS31.mapIndexed { i, l -> AiStep31(l, if (i < cur) "done" else if (i == cur) "active" else "pending") }, fields, (pr * 100).toInt(), "running", t0)
}

/* ---------------- Glimt-ruteren ---------------- */

private fun parseAssist31(o0: JSONObject): Assist31? {
    val o = o0.optJSONObject("result") ?: o0.optJSONObject("answer") ?: o0
    val text = o.s31("text") ?: o.s31("answer") ?: return null
    val ctx = o.optJSONObject("chatContext") ?: o0.optJSONObject("chatContext")
    return Assist31(
        text, o.s31("source") ?: "Glimt", o.s31("intent") ?: "llm", o.optJSONObject("card"), o.s31("tool"),
        if (o.has("ms")) o.optLong("ms") else null, ctx?.s31("chatId") ?: o.s31("chatId"), o0.s31("jobId") ?: o0.s31("id"),
        o.optJSONObject("apply"), o.optJSONObject("open") ?: o0.optJSONObject("open"), o.s31("kind") ?: o0.s31("kind"),
        o.optJSONArray("results") ?: o0.optJSONArray("results"),
    )
}

/** POST /api/assist. Null = serveren mangler ruteren (404/405) eller svarte ikke innen tiden. Venter på jobben (202) i opptil 60 s. */
internal suspend fun AppViewModel.assist31(q: String, source: String, chatId: String? = null, onJob: (String) -> Unit = {}): Assist31? {
    val s = p31
    // Prompt 45 (claude-code-glimt-intelligent-agent.md): Hjem-feltet går til den felles Glimt-agenten (POST /api/glimt/agent);
    // eldre server (404) → /api/assist som før. Chat beholder /api/assist (strømming og verktøykort).
    if (source == "search") agent45(q, source)?.let { return it }
    if (s.assistMissing) return null
    noteAiErr34(null, null)
    val body = JSONObject().put("q", q).put("source", source)
    chatId?.let { body.put("chatId", it) }
    // Prompt 34: feilen huskes (p34.lastErr/lastModel), så svaret kan si «Glimt fikk ikke svar fra {modell}: {feil}». 25 s: serveren bytter til reserven etter 20 s.
    val raw = try { api31 { request("POST", "/assist", body, prefix = Api.HOMELAB, timeout = 6000, read = 25_000) } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 404 || e.status == 405) s.assistMissing = true
        noteAiErr34(null, e.message)
        return null
    } catch (e: Exception) { noteAiErr34(null, uiErr73(e, "fikk ikke kontakt med serveren")); return null }
    val o = runCatching { JSONObject(raw) }.getOrNull() ?: run { noteAiErr34(null, "uventet svar fra serveren"); return null }
    // {ok:false, error, model} fra ai.run: tydelig feil i stedet for tomt svar.
    if (o.optBoolean("ok", true) == false || (o.s31("text") == null && o.s31("error") != null && o.s31("jobId") == null)) {
        noteAiErr34(o.s31("model"), o.s31("error"))
        return null
    }
    parseAssist31(o)?.let { return it }
    val id = o.s31("jobId") ?: o.s31("id") ?: return null
    onJob(id)
    return waitAssist31(id)
}

internal suspend fun AppViewModel.waitAssist31(id: String, maxMs: Long = 60_000): Assist31? {
    val t0 = System.currentTimeMillis()
    while (System.currentTimeMillis() - t0 < maxMs) {
        delay(1000)
        val raw = try { api31 { hlGet("/assist/" + URLEncoder.encode(id, "UTF-8"), timeout = 5000) } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404) return null
            continue
        } catch (e: Exception) { continue }
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: continue
        val st = o.s31("state") ?: o.s31("status")
        if (st == "failed" || st == "error" || st == "cancelled") { noteAiErr34(o.s31("model"), o.s31("error") ?: if (st == "cancelled") "avbrutt" else null); return null }
        parseAssist31(o)?.let { return it.copy(jobId = id) }
    }
    noteAiErr34(null, "tidsavbrudd etter ${maxMs / 1000} s")
    return null
}

/** ↵ i søkefeltet med Glimt valgt: svaret vises i boblen under feltet. Mangler serveren ruteren: Chat som før. */
fun AppViewModel.askHome31(q: String) {
    val s = p31
    val t = q.trim()
    if (t.isEmpty()) return
    // Prompt 35: «været i New York» / «weather in Paris» → været for stedet (ikke Oslo).
    if (askWeather35(t)) return
    if (askWhere37(t)) return // prompt 37: «hvor er Ingrid»
    if (s.assistMissing) { openChat(t); return }
    val seq = ++s.ansSeq
    s.ans = HomeAns31(t, busy = true)
    Haptics.tap()
    launch31 {
        val r = assist31(t, "search") { id -> if (s.ansSeq == seq) s.ans = s.ans?.copy(jobId = id); rememberJob31(id, t, "hjem") }
        if (s.ansSeq != seq) return@launch31
        if (r == null) {
            if (s.assistMissing) { s.ans = null; openChat(t); return@launch31 }
            // Prompt 34: tydelig feil med Prøv igjen og Åpne AI-kontroll (ikke evig «tenker»).
            s.ans = HomeAns31(t, false, aiErrText34(p34.lastModel, p34.lastErr), "", err = true)
            return@launch31
        }
        s.ans = HomeAns31(t, false, r.text, r.source, r.jobId, r.apply?.optInt("memoryId", 0) ?: 0, r.apply?.optInt("count", 0) ?: 0, r.apply?.s31("title") ?: "",
            wxGeo = geoOfOpen35(r.open))
        if (r.intent.startsWith("trial")) loadTrials31()
        if (r.intent.startsWith("appointment") || r.intent.startsWith("calendar.create")) reloadKal27()
        answered31(r, t, "hjem", null)
    }
}

fun AppViewModel.closeAns31() { p31.ans = null; p31.ansSeq++; Glimt67.homeChoices = null; Glimt67.homeTrace = null }

/**
 * Chat: verktøysvar (vær, kalender, avganger …) før LLM. Returnerer true når Glimt tar spørsmålet.
 * Prompt 67 (ANDCHAT67): Glimt-motoren strømmer (POST /api/glimt/agent/stream, module chat, conversationId for samtalen):
 * statuslinje mens verktøyene jobber, ordene mens de skrives, Stopp beholder det som er skrevet («Stoppet»). Verktøysvaret lagres
 * i samtalen med POST /api/glimt/agent/stream/save. Prat går videre til modellen. Eldre server (404/405) → /api/assist som før.
 * [pick] = valgknappen som ble trykket (choice {setId, id}).
 */
fun AppViewModel.chatTool31(text: String, pick: Pick67? = null): Boolean {
    val c = chat27
    val s = p31
    if ((s.assistMissing && !Glimt67.streamOn()) || c.att.isNotEmpty() || c.busy) return false
    val t = text.trim()
    if (t.isEmpty()) return false
    val before = c.msgs
    c.msgs = c.msgs + ChatMsg27("user", t)
    c.input = ""
    c.busy = true; c.stream = ""; c.streamTools = emptyList(); c.stopped = false
    val t0 = System.currentTimeMillis()
    c.job = launchJob31 {
        if (chatGlimt67(t, pick, before, t0)) return@launchJob31
        if (s.assistMissing) { c.msgs = before; c.busy = false; sendChat27(t, tool31 = false); return@launchJob31 }
        val r = try { assist31(t, "chat", c.curId) { id -> rememberJob31(id, t, "chat") } } catch (e: CancellationException) { c.busy = false; return@launchJob31 }
        val tool = r?.tool ?: r?.card?.let { cardTool31(it) }
        if (r == null || (r.intent == "llm" && tool == null) || r.intent == "chat") {
            // Ikke et verktøy: vanlig samtale med modellen (meldingen legges inn på nytt av sendChat27).
            c.msgs = c.msgs.dropLast(1)
            c.busy = false
            sendChat27(t, tool31 = false)
            return@launchJob31
        }
        r.chatId?.let { if (c.curId == null) c.curId = it }
        val sec = (r.ms ?: (System.currentTimeMillis() - t0)) / 1000.0
        val st = "Verktøy · " + String.format(java.util.Locale("nb", "NO"), "%.1f s", sec)
        c.msgs = c.msgs + ChatMsg27("assistant", r.text, model = "Glimt", stats = st, card = r.card?.toString(), tool = tool)
        c.busy = false
        if (r.intent.startsWith("trial")) loadTrials31()
        answered31(r, t, "chat", c.curId)
        loadChats27()
    }
    return true
}

/**
 * Prompt 67: Glimt i Chat med strømming. true = ferdig håndtert (svaret vist, stoppet, feil vist eller sendt videre til modellen);
 * false = serveren har ikke strømmingen (bruk /api/assist).
 */
private suspend fun AppViewModel.chatGlimt67(t: String, pick: Pick67?, before: List<ChatMsg27>, t0: Long): Boolean {
    val c = chat27
    val g = Glimt67
    if (!g.streamOn()) return false
    val conv = g.chatConv(c.curId)
    val rid = g.rid()
    g.chatRid = rid; g.chatStatus = null; g.chatLive = true
    val done = try {
        stream67(agentBody67(t, "chat", rid, conv, "chat", pick), { c.stopped }, { c.conn = it }, { g.chatStatus = it }, { c.stream = it })
    } catch (e: CancellationException) {
        g.chatLive = false; g.chatRid = null; g.chatStatus = null; c.busy = false
        throw e
    } catch (e: Stopped67) {
        g.chatLive = false; g.chatRid = null; g.chatStatus = null
        if (e.partial.isBlank()) { c.msgs = before; c.input = t }
        else c.msgs = c.msgs + ChatMsg27("assistant", e.partial + " …", model = "Glimt", stats = "Stoppet", tool = "Glimt", conv67 = conv)
        c.busy = false; c.stream = ""
        return true
    } catch (e: ApiException) {
        g.chatLive = false; g.chatRid = null; g.chatStatus = null; c.stream = ""
        if (e.status == 429) { c.msgs = before; c.input = t; c.busy = false; chatToast27(e.message ?: "Glimt jobber med mye nå. Prøv igjen om litt."); return true }
        // Feil i Glimt-motoren: til språkmodellen som før (ingen ny kjøring som kan gjenta en handling).
        c.msgs = before; c.busy = false
        sendChat27(t, tool31 = false)
        return true
    } catch (e: Exception) {
        g.chatLive = false; g.chatRid = null; g.chatStatus = null; c.stream = ""
        c.msgs = before; c.busy = false
        sendChat27(t, tool31 = false)
        return true
    }
    g.chatLive = false; g.chatRid = null; g.chatStatus = null
    if (done == null) { c.stream = ""; return false }
    val a = agentView67(done)
    if (a.isChat() || a.text.isBlank()) {
        // Prat: vanlig samtale med modellen (meldingen legges inn på nytt av sendChat27).
        c.msgs = before; c.busy = false; c.stream = ""
        sendChat27(t, tool31 = false)
        return true
    }
    val chatId = saveStream67(t, a, c.curId)
    if (chatId != null && c.curId == null) c.curId = chatId
    g.bindConv(c.curId, conv)
    val st = stats67(a.ms ?: (System.currentTimeMillis() - t0), a.cacheNote())
    c.msgs = c.msgs + ChatMsg27("assistant", a.text, model = "Glimt", stats = st, card = a.card?.toString(), tool = a.tool,
        trace67 = a.traceId, choices67 = a.choices, confirm67 = a.confirm, conv67 = conv)
    c.busy = false; c.stream = ""
    if (a.toolName?.startsWith("calendar.") == true || a.intent.startsWith("calendar") || a.module == "calendar") reloadKal27()
    if (a.module == "subscriptions" || a.intent.startsWith("trial")) loadTrials31()
    loadChats27()
    return true
}

/** Prompt 67: valgknapp under et Glimt-svar i Chat → item.text + choice {setId, id} i samme samtale. */
fun AppViewModel.pickChat67(ch: Choices67, item: ChoiceItem67) {
    val c = chat27
    if (c.busy) return
    Haptics.select()
    // Knappene forsvinner fra svaret når et valg er gjort.
    c.msgs = c.msgs.map { if (it.choices67 === ch) it.copy(choices67 = null) else it }
    if (!chatTool31(item.text, pick67(ch, item))) sendChat27(item.text, tool31 = false)
}

/** Prompt 67: «Ja, gjør det» / «Avbryt» på en endrende handling i Chat (POST /api/glimt/agent/confirm {token}). */
fun AppViewModel.confirmChat67(i: Int, yes: Boolean) {
    val c = chat27
    val m = c.msgs.getOrNull(i) ?: return
    val cf = m.confirm67 ?: return
    if (c.busy) return
    c.msgs = c.msgs.toMutableList().also { it[i] = m.copy(confirm67 = null) }
    if (!yes) { Haptics.select(); c.msgs = c.msgs + ChatMsg27("assistant", "Greit, jeg lot det være.", model = "Glimt", tool = "Glimt"); return }
    Haptics.tap()
    c.busy = true; c.stream = ""; c.streamTools = emptyList(); c.stopped = false
    Glimt67.chatLive = true; Glimt67.chatStatus = "Utfører …"
    c.job = launchJob31 {
        val msg = try {
            val o = JSONObject(api31 { hlPost("/glimt/agent/confirm", JSONObject().put("token", cf.token)) })
            val a = agentView67(o)
            ChatMsg27("assistant", a.text.ifBlank { "Ferdig." }, model = "Glimt", tool = a.tool, card = a.card?.toString(), trace67 = a.traceId, choices67 = a.choices, confirm67 = a.confirm, conv67 = m.conv67)
        } catch (e: CancellationException) { Glimt67.chatLive = false; c.busy = false; throw e } catch (e: Exception) {
            Haptics.error()
            ChatMsg27("assistant", uiErr73(e, "Fikk ikke utført handlingen."), model = "Glimt", tool = "Glimt")
        }
        Glimt67.chatLive = false; Glimt67.chatStatus = null
        c.msgs = c.msgs + msg
        c.busy = false
        reloadKal27()
    }
}

/** Verktøynavnet ut fra kortet. */
internal fun cardTool31(card: JSONObject): String? = when (card.s31("k")) {
    "weather", "wx" -> "Vær"; "calendar", "cal" -> "Kalender"; "departures", "dep" -> "Avganger"; "packages", "pk" -> "Pakker"
    "finance", "fin" -> "Økonomi"; "tasks" -> "Gjøremål"; "trial", "trials" -> "Abonnementer"; else -> null
}

/** Svaret er klart: varsel hvis appen er i bakgrunnen, og banneret når brukeren kommer tilbake. */
internal fun AppViewModel.answered31(r: Assist31, q: String, from: String, chatId: String?) {
    r.jobId?.let { id -> forgetJob31(id); p31.jobs = p31.jobs.filter { it.id != id } }
    Haptics.success()
    if (!inBackground29 || !p31.aiBg) return
    val body = plain31(r.text)
    p31.away = body
    Notify31.post(appCtx29, "Glimt", body, "assist-" + (r.jobId ?: q.hashCode().toString()),
        if (from == "chat" && chatId != null) "finanshub://chat/$chatId" else "finanshub://glimt", "ai")
}

/* Jobber som kan bli ferdige når prosessen er borte: WorkManager følger dem opp (Notify31Worker). */
internal fun AppViewModel.rememberJob31(id: String, q: String, from: String) = Notify31.remember(appCtx29, id, q, from)

private fun AppViewModel.forgetJob31(id: String) = Notify31.forget(appCtx29, id)

/* ---------------- Realtime: assist og calendar-quick ---------------- */

private fun jobFrom31(msg: JSONObject, kind: String, prev: AiJob31?): AiJob31? {
    val o = msg.optJSONObject("job") ?: msg.optJSONObject("data") ?: msg
    val id = o.s31("jobId") ?: o.s31("id") ?: return null
    val state = when (o.s31("state") ?: o.s31("status")) { "done", "ok" -> "done"; "failed", "error" -> "failed"; "cancelled" -> "cancelled"; else -> "running" }
    val pr = if (o.has("progress")) o.optDouble("progress", -1.0).let { if (it in 0.0..1.0 && o.opt("progress") is Double) (it * 100).toInt() else it.toInt() }.takeIf { it >= 0 } else null
    val steps = parseSteps31(o.optJSONArray("steps"), pr, state).ifEmpty { prev?.steps ?: emptyList() }
    val fields = parseFields31(o.opt("fields")).ifEmpty { prev?.fields ?: emptyList() }
    return AiJob31(
        id, kind, o.s31("title") ?: prev?.title ?: if (kind == "quick") "Legger til i kalenderen" else "Glimt tenker",
        o.s31("model") ?: prev?.model ?: "Glimt · lokal", o.s31("input") ?: o.s31("q") ?: o.s31("text") ?: prev?.input ?: "",
        steps, fields, pr ?: prev?.progress, state, prev?.t0 ?: System.currentTimeMillis(),
    )
}

/** «assist» over /api/ws: live steg i boblen, og svaret når jobben er ferdig (søkefelt eller Chat). */
fun AppViewModel.onAssistEvent31(msg: JSONObject) {
    val s = p31
    val prev = s.jobs.firstOrNull { it.id == (msg.s31("jobId") ?: msg.s31("id")) }
    val j = jobFrom31(msg, "assist", prev) ?: return
    if (j.state == "running") s.jobs = s.jobs.filter { it.id != j.id } + j
    else s.jobs = s.jobs.filter { it.id != j.id }
    if (j.state == "done") {
        val a = s.ans
        val res = (msg.optJSONObject("result") ?: msg.optJSONObject("answer"))?.let { parseAssist31(it) }
        if (a != null && a.busy && a.jobId == j.id && res != null) { s.ans = HomeAns31(a.q, false, res.text, res.source, j.id); s.ansSeq++ ; answered31(res, a.q, "hjem", null) }
    }
}

/** «calendar-quick» med steg/felt/fremdrift (SERVER31): samme toast og boble som assist. */
fun AppViewModel.onQuickEvent31(msg: JSONObject) {
    val s = p31
    val id = msg.s31("jobId") ?: msg.s31("id") ?: msg.optJSONObject("job")?.s31("id") ?: return
    if (!msg.has("steps") && !msg.has("progress") && msg.optJSONObject("job")?.has("steps") != true) return
    val prev = s.jobs.firstOrNull { it.id == id }
    val j = jobFrom31(msg, "quick", prev) ?: return
    s.jobs = if (j.state == "running") s.jobs.filter { it.id != j.id } + j else s.jobs.filter { it.id != j.id }
}

/** «Avbryt» i boblen: rask time stoppes på serveren, assist-jobben skjules (og stoppes hvis serveren kan). */
fun AppViewModel.cancelAiJob31(j: AiJob31) {
    val s = p31
    s.jobs = s.jobs.filter { it.id != j.id }
    s.bubble = false
    Haptics.dismiss()
    if (j.kind == "quick") q29.jobs = q29.jobs.filter { it.id != j.id }
    if (j.kind == "assist" && s.ans?.jobId == j.id) closeAns31()
    s.toastMsg = "Avbrutt · ingenting ble lagt til"; s.toastSeq++
    launch31 {
        val enc = URLEncoder.encode(j.id, "UTF-8")
        runCatching { api31 { hlPost(if (j.kind == "quick") "/kalender/quick/$enc/cancel" else "/assist/$enc/cancel") } }
        forgetJob31(j.id)
    }
}

/* ---------------- Glimt i søkefeltet ---------------- */

val HS_TIMEOUTS32B = listOf(5, 8, 15, 30)

fun AppViewModel.loadHsTimeout32b() {
    prefs.str("hs_timeout32b_" + (account?.id ?: ""), "").toIntOrNull()?.takeIf { it in HS_TIMEOUTS32B }?.let { p32b.hsTimeout = it }
}

/** «Send til Chat etter»: 5 → 8 → 15 → 30 → 5 s. */
fun AppViewModel.nextHsTimeout32b() {
    val cur = p32b.hsTimeout
    val nx = HS_TIMEOUTS32B[(HS_TIMEOUTS32B.indexOf(cur).coerceAtLeast(0) + 1) % HS_TIMEOUTS32B.size]
    p32b.hsTimeout = nx
    prefs.set("hs_timeout32b_" + (account?.id ?: ""), "$nx")
    Haptics.select()
    launch32b { runCatching { api32b { hlPut("/me/layout", JSONObject().put("hs_timeout_s", nx)) } } }
}

fun AppViewModel.setSearchHist32b(on: Boolean) {
    p32b.searchHist = on
    Haptics.select()
    launch32b { runCatching { api32b { hlPut("/me/layout", JSONObject().put("search_history", on)) } } }
}

private val SENSITIVE32B = listOf(
    Regex("\\b(?:\\d[ -]?){13,19}\\b"),            // kortnummer
    Regex("\\b\\d{6}\\s?\\d{5}\\b"),                // personnummer
    Regex("(passord|password|pinkode|pin-kode|\\bpin\\b|engangskode|bankid)", RegexOption.IGNORE_CASE),
)

/** Logger et søk fra mobilen (alle motorer). Vises bare i «Nylige søk» på web. */
fun AppViewModel.logSearch32b(q: String, engine: String) {
    val t = q.trim().take(300)
    if (t.isEmpty() || !p32b.searchHist) return
    if (SENSITIVE32B.any { it.containsMatchIn(t) }) return
    launch32b { runCatching { api32b { hlPost("/search/history", JSONObject().put("q", t).put("engine", engine).put("device", "mobil")) } } }
}

/** Snarveiene i fasiten (NAV i hsAsk): mønster, side og navn i boblen. */
private val NAV32B: List<Triple<Regex, String, String>> = listOf(
    Triple(Regex("oppdater|nordlys|ny versjon|versjon"), "nordlys", "Nordlys OS · oppdatering"),
    Triple(Regex("kalender|timeplan"), "kalender", "Kalender"),
    Triple(Regex("v(æ|ae)ret? (side|app)|værside|åpne vær"), "vaer", "Vær"),
    Triple(Regex("innstilling"), "innst", "Innstillinger"),
    Triple(Regex("pakke|sporing|sending"), "sporing", "Sporing"),
    Triple(Regex("budsjett"), "budsjett", "Budsjett"),
    Triple(Regex("kvittering"), "kvitt", "Kvitteringer"),
    Triple(Regex("finans|økonomi|saldo|konto"), "finans", "Økonomi"),
    Triple(Regex("abonnement|prøveperiode"), "abo", "Abonnement"),
    Triple(Regex("domene"), "domener", "Domener"),
    Triple(Regex("skjold|sorteringsskap|skuffeskap"), "skjold", "Skjold Lab"), // prompt 76
    Triple(Regex("familie|posisjon|hvor er"), "kart", "Familie"),
    Triple(Regex("middag|matplan|oppskrift|\\bmat\\b"), "mat", "Mat"),
    Triple(Regex("gjøremål|to-do|todo|huskeliste|handleliste"), "huske", "Gjøremål"),
    Triple(Regex("bursdag"), "bursdag", "Bursdager"),
    Triple(Regex("\\bchat\\b"), "chat", "Chat"),
)

private val NAV_LEAD32B = Regex("^(vis( meg)?|åpne|gå til|ta meg til|hvor (er|finner jeg)|finn)\\b")

/** Treff på en side-snarvei: (navn, side). Bare for «vis meg / åpne / gå til …» eller 1–2 ord. */
fun navShortcut32b(q: String): Pair<String, String>? {
    val n = q.trim().lowercase()
    if (!NAV_LEAD32B.containsMatchIn(n) && n.split(Regex("\\s+")).size > 2) return null
    // «finn neste frisørtime» og «hvor er neste prøve» er spørsmål til Glimt, ikke snarveier.
    if (Regex("\\bneste\\b|\\bnår\\b").containsMatchIn(n)) return null
    val hit = NAV32B.firstOrNull { it.first.containsMatchIn(n) } ?: return null
    return hit.third to hit.second
}

/** Åpner siden for en snarvei. */
fun AppViewModel.openShortcut32b(page: String) {
    when (page) {
        "nordlys" -> openNordlys31()
        "kalender" -> if (!openKalApp33(list = true)) openKal26(native = false) // prompt 33: «Åpne kalender» → kalender://liste
        "vaer" -> openWeather()
        "innst" -> openPaperPage("set")
        "sporing" -> deepLink(Uri.parse("finanshub://tracking"))
        "budsjett" -> deepLink(Uri.parse("finanshub://budget"))
        "kvitt" -> deepLink(Uri.parse("finanshub://review"))
        "finans" -> deepLink(Uri.parse("finanshub://finance"))
        "abo" -> openFromMer(Screen.Sub)
        "domener" -> deepLink(Uri.parse("finanshub://domains"))
        "kart" -> openFamily()
        "tkart" -> openKart46() // prompt 46: Kart (holdeplasser, sanntid og soner)
        "skjold" -> openSkjold76() // prompt 76: Skjold Lab
        "mat" -> deepLink(Uri.parse("finanshub://mat"))
        "huske" -> openTasks()
        "bursdag" -> deepLink(Uri.parse("finanshub://bursdager"))
        "chat" -> openChat()
    }
}

/**
 * ↵ i søkefeltet med Glimt (erstatter askHome31): snarvei → side etter 0,45 s; ellers Glimt i boblen.
 * Tar svaret lengre tid enn hs_timeout_s (eller Glimt svarer ikke), flyttes jobben til Chat (handoff) etter 0,7 s.
 */
fun AppViewModel.askHome32b(q: String) {
    val s = p31
    val t = q.trim()
    if (t.isEmpty()) return
    logSearch32b(t, "glimt")
    // Prompt 37: «hvor er Ingrid» svarer med posisjonen (før snarveien «hvor er → Familie»).
    if (askWhere37(t)) return
    // Prompt 76: «hvor er M3-skruene?» er en del i Skjold Lab → Glimt (skjold.find), ikke Familie.
    navShortcut32b(t)?.takeIf { it.second != "kart" || !skjoldKnows76(t) }?.let { (label, page) ->
        val seq = ++s.ansSeq
        s.ans = HomeAns31(t, busy = false, text = "Åpner **$label**.", source = "Snarvei")
        Haptics.tap()
        launch32b {
            delay(450)
            if (s.ansSeq == seq) { closeAns31(); openShortcut32b(page) }
        }
        return
    }
    // Prompt 36: dagslys/sol for en dato beregnes lokalt; «været i New York» (prompt 35) før ruteren.
    if (askSun36(t) || askWeather35(t)) return
    if (s.assistMissing) { openChat(t); return }
    val seq = ++s.ansSeq
    s.ans = HomeAns31(t, busy = true)
    Haptics.tap()
    var jobId: String? = null
    var main: Job? = null
    val timer = launchJob31 {
        delay(p32b.hsTimeout * 1000L)
        if (s.ansSeq == seq && s.ans?.busy == true) { main?.cancel(); handoff32b(t, jobId, "Dette tar litt tid.") }
    }
    main = launchJob31 {
        val r = try {
            assist31(t, "search") { id -> jobId = id; if (s.ansSeq == seq) s.ans = s.ans?.copy(jobId = id); rememberJob31(id, t, "hjem") }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
        if (s.ansSeq != seq) return@launchJob31
        timer.cancel()
        if (r == null) {
            if (s.assistMissing) { s.ans = null; openChat(t); return@launchJob31 }
            handoff32b(t, jobId, "Fikk ikke svar her.")
            return@launchJob31
        }
        // Prompt 36: handling (kind:'action' – lagt i kalenderen, påminnelse …) vises i pillen øverst, ikke som kort under søket.
        if (r.kind == "action") {
            s.ans = null
            p31.toastMsg = "✓ " + plain31(r.text).lineSequence().firstOrNull().orEmpty().take(80); p31.toastSeq++
        } else s.ans = HomeAns31(t, false, r.text, r.source, r.jobId, r.apply?.optInt("memoryId", 0) ?: 0, r.apply?.optInt("count", 0) ?: 0, r.apply?.optStr("title") ?: "",
            wxGeo = geoOfOpen35(r.open) ?: r.open?.takeIf { it.optString("route") == "vaer" }?.let { mobileHome?.weather?.let { w -> if (w.lat != null && w.lon != null) "geo:${w.lat},${w.lon},${w.place}" else null } })
        glimtAnswered76(t, r.open, r.card, r.tool, r.intent, r.results) // prompt 76: «Åpne i Skjold Lab ›»
        if (r.intent.startsWith("trial")) loadTrials31()
        if (r.intent.startsWith("appointment") || r.intent.startsWith("calendar.create")) reloadKal27()
        answered31(r, t, "hjem", null)
    }
}

/** «Dette tar litt tid. **Fortsetter i Chat** …» og Chat etter 0,7 s. Jobben fortsetter i samme Chat-tråd på serveren. */
private fun AppViewModel.handoff32b(q: String, jobId: String?, why: String) {
    val s = p31
    val seq = ++s.ansSeq
    s.ans = HomeAns31(q, false, "$why **Fortsetter i Chat** …", "Glimt", jobId)
    launch32b {
        val t0 = System.currentTimeMillis()
        val chatId = jobId?.let { id ->
            runCatching { JSONObject(api32b { hlPost("/assist/" + URLEncoder.encode(id, "UTF-8") + "/handoff", JSONObject()) }).optStr("chatId") }.getOrNull()
        }
        val left = 700L - (System.currentTimeMillis() - t0)
        if (left > 0) delay(left)
        if (s.ansSeq == seq) closeAns31()
        if (chatId != null) { openChat(); openChatId27(chatId) } else openChat(q)
    }
}

/* ---------------- Strømming (SSE eller NDJSON) ---------------- */

/** Leser et SSE-/NDJSON-svar linje for linje. onEvent returnerer false for å stoppe. */
internal suspend fun AppViewModel.stream34(method: String, path: String, body: JSONObject?, read: Int = 120_000, accept: String = "text/event-stream, application/x-ndjson, application/json",
    onEvent: (String, JSONObject) -> Boolean): Unit =
    withContext(Dispatchers.IO) {
        val c = URL(base.trimEnd('/') + path).openSikker()
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

/* ---------------- AI-søk: været for et sted ---------------- */

private val WX_WORDS35 = Regex("(?i)\\b(vær|været|værmelding|weather|forecast|temperatur|temperaturen|regn|regner|snø|snør|sol|grader|varmt|kaldt|vind|yr)\\b")

private val TIME_WORDS35 = setOf("morgen", "dag", "kveld", "natt", "helgen", "overmorgen", "går", "morges", "ettermiddag", "uka", "uken")

/** «været i new york» → New York · «hvordan er været i Strømstad i morgen» → Strømstad · «regn i Bergen?» → Bergen · «weather in Paris» → Paris. */
fun weatherPlaceOf35(q: String): String? {
    if (!WX_WORDS35.containsMatchIn(q)) return null
    val rx = Regex("(?i)(?:^|\\s)(?:i|på|in|for|at|ved|rundt)\\s+(.+?)(?=\\s+(?:i\\s+morgen|i\\s+dag|i\\s+kveld|i\\s+natt|i\\s+helgen|i\\s+overmorgen|nå|tomorrow|today|tonight|this\\s+weekend|neste)\\b|[?.!,]|$)")
    for (m in rx.findAll(q.trim())) {
        val p = m.groupValues[1].trim().trim('?', '.', '!', ',')
        if (p.isEmpty()) continue
        val first = p.lowercase().split(Regex("\\s+")).first()
        if (first in TIME_WORDS35 || WX_WORDS35.matches(p)) continue
        return p.split(Regex("\\s+")).joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } }
    }
    return null
}

data class WxPlaceAns35(val text: String, val geo: String?, val label: String?)

private fun wmo35(c: Int?): String = when (wxKind34(c)) { "sol" -> "klart"; "delvis" -> "lettskyet"; "regn" -> "regn"; "sno" -> "snø"; else -> "skyet" }

/** GET /api/weather/place?q= (serveren), ellers Open-Meteo direkte. */
suspend fun AppViewModel.weatherPlace35(q: String, place: String): WxPlaceAns35 {
    val tomorrow = Regex("(?i)i\\s*morgen|imorgen|tomorrow").containsMatchIn(q)
    val raw = try { api35 { hlGet("/weather/place?q=" + URLEncoder.encode(place, "UTF-8") + (if (tomorrow) "&day=tomorrow" else ""), timeout = 12_000) } } catch (e: ApiException) {
        if (e.message?.startsWith("Fant ikke stedet") == true) return WxPlaceAns35(e.message ?: "Fant ikke stedet «$place». Prøv en annen stavemåte.", null, null)
        null
    } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
    if (raw != null) runCatching {
        val o = JSONObject(raw)
        val p = o.optJSONObject("place")
        val label = s35(p, "label") ?: s35(p, "name") ?: place
        val lat = n34(p, "lat"); val lon = n34(p, "lon")
        val now = o.optJSONObject("now"); val td = o.optJSONObject("today"); val tm = o.optJSONObject("tomorrow")
        val text = s35(o, "text") ?: if (tomorrow && tm != null) "I morgen i $label: ${s35(tm, "cond") ?: ""} ${n34(tm, "lo")?.toInt()}–${n34(tm, "hi")?.toInt()}°."
            else "${cap35(s35(now, "cond") ?: "")} og **${n34(now, "temp")?.let { Math.round(it) }}°** i $label nå, vind ${n34(now, "wind")?.let { Math.round(it) }} m/s. I dag ${n34(td, "lo")?.toInt()}–${n34(td, "hi")?.toInt()}°."
        return WxPlaceAns35(text, if (lat != null && lon != null) "geo:$lat,$lon,${s35(p, "name") ?: place}" else null, label)
    }
    return openMeteo35(place, tomorrow)
}

private suspend fun openMeteo35(place: String, tomorrow: Boolean): WxPlaceAns35 = withContext(Dispatchers.IO) {
    fun get(u: String): String = (URL(u).openSikker()).run {
        connectTimeout = 8000; readTimeout = 12000
        try { inputStream.bufferedReader().use { it.readText() } } finally { disconnect() }
    }
    val g = runCatching { JSONObject(get("https://geocoding-api.open-meteo.com/v1/search?count=1&language=nb&name=" + URLEncoder.encode(place, "UTF-8"))).optJSONArray("results")?.optJSONObject(0) }.getOrNull()
        ?: return@withContext WxPlaceAns35("Fant ikke stedet «$place». Prøv en annen stavemåte.", null, null)
    val name = g.optString("name", place)
    val norway = g.optString("country_code") == "NO"
    val label = if (norway) name else name + (g.optString("country").takeIf { it.isNotBlank() }?.let { ", " + (if (it == "USA" || g.optString("country_code") == "US") "USA" else it) } ?: "")
    val lat = g.optDouble("latitude"); val lon = g.optDouble("longitude")
    val f = runCatching {
        JSONObject(get("https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=2&wind_speed_unit=ms"))
    }.getOrNull() ?: return@withContext WxPlaceAns35("Fikk ikke hentet været for $label akkurat nå.", "geo:$lat,$lon,$name", label)
    val cur = f.optJSONObject("current"); val d = f.optJSONObject("daily")
    fun di(k: String, i: Int) = d?.optJSONArray(k)?.optDouble(i)?.let { Math.round(it).toInt() }
    val text = if (tomorrow) "I morgen i $label: ${wmo35(d?.optJSONArray("weather_code")?.optInt(1))}, **${di("temperature_2m_min", 1)}–${di("temperature_2m_max", 1)}°**."
        else "${cap35(wmo35(cur?.optInt("weather_code")))} og **${cur?.optDouble("temperature_2m")?.let { Math.round(it) }}°** i $label nå, vind ${cur?.optDouble("wind_speed_10m")?.let { Math.round(it) }} m/s. I dag ${di("temperature_2m_min", 0)}–${di("temperature_2m_max", 0)}°."
    WxPlaceAns35(text, "geo:$lat,$lon,$name", label)
}

/** Hjem-søket: svarer på «været i X» selv (før ruteren). true = tatt. */
fun AppViewModel.askWeather35(q: String): Boolean {
    val place = weatherPlaceOf35(q) ?: return false
    val s = p31
    val seq = ++s.ansSeq
    s.ans = HomeAns31(q, busy = true)
    Haptics.tap()
    launch35 {
        val r = weatherPlace35(q, place)
        if (s.ansSeq != seq) return@launch35
        s.ans = HomeAns31(q, false, r.text, if (r.geo != null) "Open-Meteo · MET Norway" else "Glimt", wxGeo = r.geo)
        Haptics.success()
    }
    return true
}

/** Trykk på svaret: Vær for stedet (midlertidig, legges ikke i bylista). */
fun AppViewModel.openWeatherGeo35(geo: String) {
    Haptics.tap()
    closeAns31()
    go(Screen.Homelab)
    loadWeather(geo)
    weatherOpen = true
}

/** open:{route:'vaer', name, lat, lon} fra /api/assist. */
fun geoOfOpen35(o: JSONObject?): String? {
    if (o == null) return null
    if ((s35(o, "route") ?: "vaer") !in setOf("vaer", "weather")) return null
    val lat = n34(o, "lat") ?: return null; val lon = n34(o, "lon") ?: return null
    return "geo:$lat,$lon,${s35(o, "name") ?: ""}"
}

/* ======================= Glimt: spørsmål vs. handling ======================= */

private val Q_START36 = Regex("^\\s*(spørsmål|hva|hvor|hvem|hvilke?n?|hvordan|hvorfor|når|kan du|vet du|fortell|what|when|where|how|who|why)\\b", RegexOption.IGNORE_CASE)

private val Q_ANY36 = Regex("\\b(hvor mange|hvor mye|hvor lenge|hvor langt|hva er|hva blir|når går|når er|hvordan blir)\\b", RegexOption.IGNORE_CASE)

private val DO36 = Regex("\\b(legg til|book|bestill|påminn)\\b", RegexOption.IGNORE_CASE)

/** Spørsmålsvakt før avtaletolkning: «?», spørreord først eller «hvor mange / hva er …», uten «legg til / book / bestill / påminn». */
fun isQuestion36(t: String): Boolean = (t.contains('?') || Q_START36.containsMatchIn(t) || Q_ANY36.containsMatchIn(t)) && !DO36.containsMatchIn(t)

/* ---------- Dagslys, soloppgang og solnedgang (suncalc, lokalt) ---------- */

private val SUN36 = Regex("dagslys|soloppgang|solnedgang|sola\\s+(står|går)\\s+(opp|ned)|lyst\\s+ute|sunrise|sunset|daylight", RegexOption.IGNORE_CASE)

private val MONTHS36 = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")

fun isSunQ36(t: String): Boolean = SUN36.containsMatchIn(t)

/** Datoen i spørsmålet: 29.06.2027, 29/6, «29. juni 2027», «i morgen». Ellers i dag. */
fun dateIn36(t: String, today: LocalDate = LocalDate.now(OSLO36)): LocalDate {
    Regex("\\b(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?\\b").find(t)?.let { m ->
        val y = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt()?.let { if (it < 100) 2000 + it else it } ?: today.year
        runCatching { LocalDate.of(y, m.groupValues[2].toInt(), m.groupValues[1].toInt()) }.getOrNull()?.let { return it }
    }
    Regex("\\b(\\d{1,2})\\.?\\s+(" + MONTHS36.joinToString("|") + ")(?:\\s+(\\d{4}))?", RegexOption.IGNORE_CASE).find(t)?.let { m ->
        val mo = MONTHS36.indexOf(m.groupValues[2].lowercase()) + 1
        val y = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt() ?: today.year
        runCatching { LocalDate.of(y, mo, m.groupValues[1].toInt()) }.getOrNull()?.let { return it }
    }
    if (Regex("i\\s*overmorgen", RegexOption.IGNORE_CASE).containsMatchIn(t)) return today.plusDays(2)
    if (Regex("i\\s*morgen|imorgen|tomorrow", RegexOption.IGNORE_CASE).containsMatchIn(t)) return today.plusDays(1)
    return today
}

/** Stedet i spørsmålet («… i Bergen»), ellers null. */
fun sunPlaceIn36(t: String): String? {
    val skip = setOf("dag", "morgen", "overmorgen", "kveld", "natt", "år", "fjor", "sommer", "vinter") + MONTHS36
    for (m in Regex("(?:^|\\s)(?:i|på|in|for)\\s+([A-Za-zÆØÅæøåÜüÉé][\\wÆØÅæøåÜüÉé-]+(?:\\s+[A-ZÆØÅ][\\wæøå-]+)?)").findAll(t)) {
        val p = m.groupValues[1].trim()
        if (p.lowercase() in skip || p.first().isLowerCase()) continue
        return p
    }
    return null
}

data class Sun36(val rise: ZonedDateTime?, val set: ZonedDateTime?, val dayMin: Int)

/** Soloppgang/solnedgang (suncalc, h0 = −0,833°). Midnattssol: dayMin = 1440, mørketid: 0 (rise/set null). */
fun sunTimes36(date: LocalDate, lat: Double, lon: Double, zone: ZoneId = OSLO36): Sun36 {
    val rad = PI / 180
    val dayMs = 86_400_000.0
    val j1970 = 2440588.0; val j2000 = 2451545.0; val j0 = 0.0009
    val ms = date.atTime(12, 0).atZone(zone).toInstant().toEpochMilli()
    val d = ms / dayMs - 0.5 + j1970 - j2000
    val lw = rad * -lon
    val phi = rad * lat
    val n = Math.round(d - j0 - lw / (2 * PI)).toDouble()
    val ds = j0 + lw / (2 * PI) + n
    val m = rad * (357.5291 + 0.98560028 * ds)
    val c = rad * (1.9148 * sin(m) + 0.02 * sin(2 * m) + 0.0003 * sin(3 * m))
    val l = m + c + rad * 102.9372 + PI
    val dec = asin(sin(l) * sin(rad * 23.4397))
    val jNoon = j2000 + ds + 0.0053 * sin(m) - 0.0069 * sin(2 * l)
    val x = (sin(-0.833 * rad) - sin(phi) * sin(dec)) / (cos(phi) * cos(dec))
    if (x <= -1) return Sun36(null, null, 1440)
    if (x >= 1) return Sun36(null, null, 0)
    val w = acos(x)
    val a = j0 + (w + lw) / (2 * PI) + n
    val jSet = j2000 + a + 0.0053 * sin(m) - 0.0069 * sin(2 * l)
    val jRise = jNoon - (jSet - jNoon)
    fun at(j: Double): ZonedDateTime = Instant.ofEpochMilli(((j + 0.5 - j1970) * dayMs).roundToLong()).atZone(zone)
    val r = at(jRise); val s = at(jSet)
    return Sun36(r, s, ((s.toEpochSecond() - r.toEpochSecond()) / 60).toInt())
}

private fun hhmm36(t: ZonedDateTime) = "%02d:%02d".format(t.hour, t.minute)

/** «29. juni 2027 i Oslo: soloppgang 03:54, solnedgang 22:44, 18 t 50 min dagslys.» */
fun sunText36(date: LocalDate, place: String, s: Sun36): String {
    val ds = "${date.dayOfMonth}. ${MONTHS36[date.monthValue - 1]}" + if (date.year != LocalDate.now(OSLO36).year) " ${date.year}" else ""
    if (s.rise == null || s.set == null) return if (s.dayMin >= 1440) "$ds i $place: midnattssol, sola går ikke ned (24 t dagslys)." else "$ds i $place: mørketid, sola står ikke opp."
    return "$ds i $place: soloppgang ${hhmm36(s.rise)}, solnedgang ${hhmm36(s.set)}, **${s.dayMin / 60} t ${s.dayMin % 60} min** dagslys."
}

private suspend fun geocode36(place: String): Triple<Double, Double, String>? = withContext(Dispatchers.IO) {
    runCatching {
        val c = URL("https://geocoding-api.open-meteo.com/v1/search?count=1&language=nb&name=" + URLEncoder.encode(place, "UTF-8")).openSikker()
        c.connectTimeout = 6000; c.readTimeout = 8000
        val raw = try { c.inputStream.bufferedReader().use { it.readText() } } finally { c.disconnect() }
        val g = JSONObject(raw).optJSONArray("results")?.optJSONObject(0) ?: return@runCatching null
        Triple(g.getDouble("latitude"), g.getDouble("longitude"), g.optString("name", place))
    }.getOrNull()
}

/** Hjem-søket: dagslys/sol for en dato besvares lokalt i kortet under søkefeltet (med Åpne Vær ›). true = tatt. */
fun AppViewModel.askSun36(q: String): Boolean {
    if (!isSunQ36(q)) return false
    val s = p31
    val seq = ++s.ansSeq
    s.ans = HomeAns31(q, busy = true)
    Haptics.tap()
    launch36 {
        val date = dateIn36(q)
        val wanted = sunPlaceIn36(q)
        val home = mobileHome?.weather
        val loc: Triple<Double, Double, String> = wanted?.let { geocode36(it) }
            ?: if (home?.lat != null && home.lon != null && wanted == null) Triple(home.lat, home.lon, home.place.ifBlank { "Oslo" }) else Triple(59.9139, 10.7522, "Oslo")
        val sun = sunTimes36(date, loc.first, loc.second)
        if (s.ansSeq != seq) return@launch36
        s.ans = HomeAns31(q, false, sunText36(date, loc.third, sun), "Glimt · beregnet lokalt", wxGeo = "geo:${loc.first},${loc.second},${loc.third}")
        Haptics.success()
    }
    return true
}

/* ======================= «Hvor er Ingrid?» ======================= */

private val WHERE37 = listOf(
    Regex("^\\s*(?:hvor|kor|hvorhen)\\s+(?:er|befinner|holder)\\s+(?:seg\\s+)?([A-Za-zÆØÅæøåÉé][\\wÆØÅæøåÉé-]*)(?:\\s+(?:seg|nå|akkurat nå))?\\s*\\??\\s*$", RegexOption.IGNORE_CASE),
    Regex("^\\s*(?:hvor|kor)\\s+(?:befinner|holder)\\s+([A-Za-zÆØÅæøåÉé][\\wÆØÅæøåÉé-]*)\\s+seg", RegexOption.IGNORE_CASE),
    Regex("^\\s*posisjonen\\s+til\\s+([A-Za-zÆØÅæøåÉé][\\wÆØÅæøåÉé-]*)", RegexOption.IGNORE_CASE),
    Regex("^\\s*where\\s+is\\s+([A-Za-z][\\w-]*)", RegexOption.IGNORE_CASE),
    Regex("^\\s*er\\s+([A-ZÆØÅ][\\wæøå-]*)\\s+(?:på|hos|hjemme|i)\\b", RegexOption.IGNORE_CASE),
)

private val WHERE_STOP37 = setOf("det", "den", "de", "neste", "min", "mitt", "mine", "nærmeste", "butikken", "bilen", "du", "vi", "dere", "han", "hun", "noen", "alle",
    "været", "toalettet", "do", "nøklene", "telefonen", "mobilen", "pakken", "pakkene", "the", "my")

/** Navnet i «hvor er Ingrid» (eller «jeg»), ellers null. */
fun whereWho37(q: String): String? {
    for (r in WHERE37) r.find(q.trim())?.let { m -> val n = m.groupValues[1]; if (n.lowercase() !in WHERE_STOP37) return n }
    return null
}

private fun ago37(ts: String?): Long? = ts?.let { runCatching { (System.currentTimeMillis() - java.time.Instant.parse(it).toEpochMilli()) / 60_000 }.getOrNull() }

private fun agoText37(min: Long): String = when { min < 1 -> "nå nettopp"; min < 60 -> "$min min siden"; min < 60 * 24 -> "${min / 60} t siden"; else -> "${min / 1440} d siden" }

private fun dist37(a: FamPos, lat: Double, lon: Double): Double {
    val r = 6371.0
    val dLat = Math.toRadians(lat - a.lat); val dLon = Math.toRadians(lon - a.lon)
    val x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Math.toRadians(a.lat)) * Math.cos(Math.toRadians(lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/** Hjem-søket: «hvor er Ingrid» svarer med posisjonen (serveren først, så Familie lokalt). true = tatt. */
fun AppViewModel.askWhere37(q: String): Boolean {
    val who = whereWho37(q) ?: return false
    val s = p31
    val seq = ++s.ansSeq
    s.ans = HomeAns31(q, busy = true)
    Haptics.tap()
    launch37 {
        val r = runCatching { assist31(q, "search") }.getOrNull()
        if (s.ansSeq != seq) return@launch37
        if (r != null && r.intent == "family.where") {
            val person = r.open?.s37("person") ?: r.card?.s37("person") ?: r.card?.optJSONObject("person")?.s37("userId")
            s.ans = HomeAns31(q, false, r.text, "Familie · posisjon", famPerson37 = person ?: who)
            Haptics.success()
            return@launch37
        }
        if (family == null) runCatching { openFamilyData37() }
        if (s.ansSeq != seq) return@launch37
        val f = family
        val known = who.lowercase() in setOf("jeg", "meg", "i") || f?.members?.any { firstName37(it.name).equals(who, true) || it.username.equals(who, true) || it.name.equals(who, true) } == true
        // Ikke en person i Familie («hvor er kalenderen»): vis Glimt-svaret som vanlig.
        if (!known && r != null && r.text.isNotBlank()) { s.ans = HomeAns31(q, false, r.text, r.source, r.jobId, wxGeo = geoOfOpen35(r.open)); return@launch37 }
        val txt = whereLocal37(who)
        s.ans = HomeAns31(q, false, txt.first, "Familie · posisjon", famPerson37 = txt.second)
    }
    return true
}

/** Svar fra Familie-dataene: sone, ellers sted; alder, batteri og avstand. Bare personer som deler med deg. */
fun AppViewModel.whereLocal37(who: String): Pair<String, String?> {
    val f = family ?: return "Fant ikke Familie-posisjonene akkurat nå. Åpne Familie for å se kartet." to null
    val meId = f.me?.userId
    val selfQ = who.lowercase() in setOf("jeg", "meg", "i")
    val m = if (selfQ) f.members.firstOrNull { it.userId == meId } else f.members.firstOrNull { firstName37(it.name).equals(who, true) || it.username.equals(who, true) || it.name.equals(who, true) }
    if (m == null) {
        val sharing = f.members.filter { it.userId != meId && it.last != null }.map { firstName37(it.name) }
        val list = when (sharing.size) { 0 -> "ingen"; 1 -> sharing[0]; else -> sharing.dropLast(1).joinToString(", ") + " og " + sharing.last() }
        return "Jeg finner ikke $who i Familie. Personer med deling: $list." to null
    }
    val name = if (selfQ) "Du" else firstName37(m.name)
    val pos = m.last ?: return "$name deler ikke posisjon med deg." to null
    val zone = f.zones.firstOrNull { z -> dist37(pos, z.lat, z.lon) * 1000 <= z.radius }
    val place = zone?.name?.let { z -> if (z.equals("Hjem", true)) "hjemme" else "på $z" } ?: pos.place?.let { "ved $it" } ?: "ved %.4f, %.4f".format(pos.lat, pos.lon)
    val act = when (pos.activity) { "walking", "on_foot" -> "på vei til fots "; "cycling", "on_bicycle" -> "på sykkel "; "driving", "in_vehicle", "automotive" -> "i bil "; else -> "" }
    val mine = f.members.firstOrNull { it.userId == meId }?.last
    val km = if (mine != null && !selfQ) dist37(pos, mine.lat, mine.lon) else null
    val age = ago37(pos.ts)
    val extra = listOfNotNull(pos.place?.takeIf { zone != null }, km?.let { if (it < 1) "${Math.round(it * 1000)} m fra deg" else "%.1f km fra deg".format(it).replace('.', ',') }).joinToString(", ")
    val head = if (age != null && age > 60) "$name ble sist sett for ${agoText37(age).removeSuffix(" siden")} siden $place" else "**$name** er **$act$place**"
    val tail = listOfNotNull(age?.takeIf { it <= 60 }?.let { "Oppdatert ${agoText37(it)}" }, pos.battery?.let { "batteri $it %" }).joinToString(" · ")
    val verb = if (selfQ && age != null && age <= 60) "**Du** er **$act$place**" else head
    return (verb + (if (extra.isNotEmpty()) " ($extra)" else "") + "." + (if (tail.isNotEmpty()) " $tail." else "")) to m.userId
}

/** Familie-dataene uten å åpne siden. */
private suspend fun AppViewModel.openFamilyData37() { loadFamily37() }

fun AppViewModel.openWhere37(person: String?) {
    closeAns31()
    openFamily()
    if (person != null) launch37 {
        delay(400)
        family?.members?.firstOrNull { it.userId == person || firstName37(it.name).equals(person, true) }?.let { famSelect(it.userId) }
    }
}

/* ======================= Glimt-kortene fra serveren ======================= */

/** Et Glimt-kort i listen (GET /api/tasks/glimt/cards): like, forfalte, butikk, pakkeliste. actions = (action, label, eventId). */
data class GCard37(val key: String, val kind: String, val text: String, val list: String?, val ids: List<String>, val actions: List<Triple<String, String, String?>>)

/** null = eldre server (lokale kort brukes). */
fun AppViewModel.loadCards37(list: String?) = launch37 {
    val s = p37
    try {
        val o = JSONObject(api37 { hlGet("/tasks/glimt/cards" + (list?.takeIf { it != "alle" }?.let { "?list=" + URLEncoder.encode(it, "UTF-8") } ?: "")) })
        s.cards = objs34(o.optJSONArray("cards")).mapNotNull { c ->
            GCard37(c.s37("key") ?: return@mapNotNull null, c.s37("kind") ?: "", c.s37("text") ?: "", c.optJSONObject("list")?.s37("id"), strs37(c.optJSONArray("ids")),
                objs34(c.optJSONArray("actions")).mapNotNull { a -> a.s37("action")?.let { Triple(it, a.s37("label") ?: it, a.s37("eventId")) } })
        }
    } catch (e: ApiException) { if (e.status == 404 || e.status == 405) s.cards = null } catch (e: CancellationException) { throw e } catch (_: Exception) {}
}

/** Knappene på kortene: «Ikke nå» skjuler kortet for godt (per hendelse); resten kjøres av Glimt (med Angre). */
fun AppViewModel.cardAct37(c: GCard37, action: String, eventId: String?) {
    val s = p37
    s.cards = s.cards?.filter { it.key != c.key }
    if (action == "dismiss") {
        Haptics.select()
        launch37 { runCatching { api37 { hlPost("/tasks/glimt/cards/dismiss", JSONObject().put("key", c.key)) } } }
        return
    }
    Haptics.tap()
    launch37 {
        try {
            val body = JSONObject().put("action", action).put("q", "").put("ids", JSONArray(c.ids))
            (c.list ?: taskFilter.takeIf { it != "alle" && it != "arkiv" })?.let { body.put("list", it) }
            eventId?.let { body.put("eventId", it) }
            val r = JSONObject(api37 { request("POST", "/tasks/glimt", body, prefix = Api.HOMELAB, read = 60_000) })
            s.glimt = TaskGlimt37(r.s37("kind") ?: "action", r.s37("text") ?: "", objs34(r.optJSONArray("items")).map { x ->
                GItem37(x.s37("id"), x.s37("title") ?: x.s37("n") ?: "", x.s37("list") ?: x.s37("l"), x.s37("due"), x.s37("time"), null)
            }, r.optJSONObject("undo")?.s37("token"))
            s.glimtOpen = true
            Haptics.success()
            armUndo37()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Glimt fikk ikke gjort det: ${e.message}") }
        refreshTasks37()
        loadCards37(taskFilter)
    }
}

internal fun JSONObject.s45(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

internal fun hexColor45(s: String?): Long? = s?.trim()?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { 0xFF000000L or it }

/* ======================= Glimt-agenten ======================= */

/** Modulen for en inngang i appen (source i assist31). */
internal fun agentModule45(source: String): String = when (source) { "search", "hjem", "home" -> "home"; "kalender" -> "calendar"; "huske", "tasks" -> "tasks"; else -> source }

/**
 * POST /api/glimt/agent. null = serveren mangler agenten (404/405 → husket for økten) eller kallet feilet; da brukes /api/assist.
 * Svaret gjøres om til Assist31 (reply → tekst, module.intent → intent), og `confirm` legges i p45.agentConfirm.
 */
internal suspend fun AppViewModel.agent45(q: String, source: String): Assist31? {
    val s = p45
    val module = agentModule45(source)
    // Prompt 67 (ANDCHAT67): Glimt-søket strømmer (POST /api/glimt/agent/stream) med statuslinje og Stopp, i samme samtale
    // (conversationId «home-…», kind search). Valgknappen som ble trykket sendes som choice. Eldre server → POST /api/glimt/agent som før.
    val g = Glimt67
    val pick = g.pendingPick?.takeIf { it.text.trim() == q.trim() }
    g.pendingPick = null
    val conv = if (module == "home") g.homeConv() else null
    val rid = Glimt67.rid()
    val body = agentBody67(q, module, rid, conv, if (conv != null) "search" else null, pick)
    g.homeChoices = null; g.homeTrace = null; g.homeCard70 = null
    var o: JSONObject? = null
    if (module == "home" && g.streamOn()) {
        g.homeRid = rid; g.homeStop = false; g.homeStatus = null; g.homeText = ""
        try {
            o = stream67(body, { g.homeStop }, { g.homeConn = it }, { g.homeStatus = it }, { g.homeText = it })
        } catch (e: CancellationException) { g.homeRid = null; g.homeStatus = null; g.homeText = ""; throw e } catch (e: Stopped67) {
            g.homeRid = null; g.homeStatus = null; g.homeText = ""
            return Assist31(if (e.partial.isBlank()) "Stoppet." else e.partial + " …", "Glimt · Stoppet", "home.stopped", null, null, null, null, null, kind = "question")
        } catch (e: ApiException) {
            g.homeRid = null; g.homeStatus = null; g.homeText = ""
            if (e.status == 429) return Assist31(e.message ?: "Glimt jobber med mye nå. Prøv igjen om litt.", "Glimt", "home.busy", null, null, null, null, null, kind = "question")
            return null
        } catch (e: Exception) { g.homeRid = null; g.homeStatus = null; g.homeText = ""; return null }
        g.homeRid = null; g.homeStatus = null; g.homeText = ""
        if (o != null) s.agentOk = true
    }
    if (o == null) {
        if (s.agentOk == false) return null
        val raw = try { api45 { request("POST", "/glimt/agent", body, prefix = Api.HOMELAB, timeout = 6000, read = 45_000) } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) s.agentOk = false
            return null
        } catch (e: Exception) { return null }
        o = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        s.agentOk = true
    }
    val a = agentView67(o)
    val reply = a.text.takeIf { it.isNotBlank() } ?: return null
    // Prompt 67: valgknappene (choices) vises i boblen; spørsmålet står allerede i svaret.
    val text = reply
    val intent = o.s45("intent") ?: "ask"
    val mod = o.s45("module") ?: module
    val tool = a.toolName
    s.agentConfirm = a.confirm?.let { it.token to it.summary.ifBlank { "Bekreft" } }
    g.homeChoices = a.choices
    g.homeTrace = a.traceId
    g.homeCard70 = a.card?.takeIf { it.optString("k") == "cal70" }?.let { text to it } // prompt 70: kort A i boblen
    // Intent som resten av appen kjenner igjen (reloadKal27 ved «calendar.create», trial.* osv.).
    val legacy = when {
        mod == "calendar" && intent in setOf("create", "update", "delete") -> "calendar.$intent"
        intent == "ask" || intent == "summarize" || intent == "search" -> "$mod.$intent"
        else -> "$mod.$intent"
    }
    // Spørsmål med valg eller bekreftelse vises alltid i boblen (ikke som pille), så knappene kan trykkes.
    val kind = if (a.choices != null || a.confirm != null) "question" else if (intent in setOf("create", "update", "delete", "multi")) "action" else "question"
    return Assist31(text, a.cacheNote()?.let { "Glimt · $it" } ?: "Glimt", legacy, a.card ?: o.optJSONObject("card"), tool, a.ms, null, null, null, a.open, kind)
}

/** Prompt 67: valgknapp i boblen → item.text + choice {setId, id} i samme samtale (søket på Hjem). */
fun AppViewModel.pickHome67(ch: Choices67, item: ChoiceItem67) {
    if (p31.ans?.busy == true) return
    Haptics.select()
    Glimt67.pendingPick = pick67(ch, item)
    Glimt67.homeChoices = null
    askHome32b(item.text)
}

/** «Bekreft» på en handling Glimt foreslo. Svaret erstatter teksten i boblen. */
fun AppViewModel.confirmAgent45() {
    val (token, _) = p45.agentConfirm ?: return
    p45.agentConfirm = null
    Haptics.tap()
    launch45 {
        val raw = try { api45 { hlPost("/glimt/agent/confirm", JSONObject().put("token", token)) } } catch (e: CancellationException) { throw e } catch (e: Exception) {
            flash("Glimt fikk ikke gjort det: ${uiErr73(e, "ukjent feil")}"); Haptics.error(); return@launch45
        }
        val o = runCatching { JSONObject(raw) }.getOrNull()
        val reply = o?.s45("reply") ?: o?.s45("text") ?: "Gjort."
        p31.ans = p31.ans?.copy(text = reply, busy = false)
        Haptics.success()
        reloadKal27()
    }
}

fun AppViewModel.cancelAgent45() { p45.agentConfirm = null; p31.ans = p31.ans?.copy(text = "Greit, jeg lot det være.") }

/* ======================= Kalenderkontekst i Glimt-søket ======================= */

/** Tolket beskjed: type = kalender | huske | spørsmål | annet. source = ai | rule. */
data class Qp52(
    val type: String, val title: String, val date: LocalDate?, val start: String?, val end: String?, val location: String,
    val people: List<String>, val source: String, val dateLabel: String?, val timeLabel: String?,
) {
    fun toQuick(): Quick29Parse = Quick29Parse(date != null, "", title, date, start, end, location, "kalender", true)
}

internal fun JSONObject.s52(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

internal fun parseQp52(raw: String): Qp52? = runCatching {
    val o = JSONObject(raw)
    val r = o.optJSONObject("result") ?: o.optJSONObject("ai") ?: o.optJSONObject("rule") ?: return null
    val ppl = r.optJSONArray("people")?.let { a -> (0 until a.length()).mapNotNull { a.optString(it).takeIf { s -> s.isNotBlank() } } } ?: emptyList()
    Qp52(
        r.s52("type") ?: "annet", r.s52("title") ?: "", r.s52("date")?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() },
        r.s52("start"), r.s52("end"), r.s52("location") ?: r.s52("place") ?: "", ppl, o.s52("source") ?: "rule", r.s52("date_label"), r.s52("time_label"),
    )
}.getOrNull()

private fun words52(t: String) = t.trim().split(Regex("\\s+")).count { it.isNotBlank() }

/**
 * Minst 3 ord i Glimt-søket (motor = Glimt): teksten sendes til AI-tilkoblingen etter 450 ms pause.
 * Svaret bufres per tekst og overstyrer regelparseren: kalender → forslaget med sted, huske → Huskeliste, spørsmål → vanlig svar.
 */
fun AppViewModel.homeAi52(text: String) {
    val s = p52b
    val q = q29
    s.qpJob?.cancel()
    val t = text.trim()
    if (q.engine != "ai" || words52(t) < 3 || isQuestion36(t)) { s.qpBusy = false; s.qpText = ""; s.qpRes = null; return }
    s.qpText = t
    s.qpCache[t]?.let { applyQp52(t, it); s.qpBusy = false; return }
    s.qpRes = null
    s.qpBusy = true
    s.qpJob = launchJob52b {
        delay(450)
        val body = JSONObject().put("text", t).put("now", OffsetDateTime.now().toString()).put("ai", true)
        val raw = runCatching { api52b { request("POST", "/glimt/quickparse52", body, prefix = Api.HOMELAB, timeout = 4_000, read = 7_000) } }.getOrNull()
        val r = raw?.let(::parseQp52)
        if (s.qpText == t) s.qpBusy = false
        if (r == null) return@launchJob52b
        s.qpCache[t] = r
        if (q.homeQ.trim() == t) applyQp52(t, r)
    }
}

private fun AppViewModel.applyQp52(t: String, r: Qp52) {
    val s = p52b
    s.qpRes = r
    when (r.type) {
        "kalender" -> if (r.date != null && r.title.isNotBlank()) q29.homeAppt = r.toQuick()
        else -> if (r.source == "ai") q29.homeAppt = null
    }
    if (s.qpText != t) s.qpText = t
}

/** AI tolker fortsatt denne teksten (Enter venter opptil 2,5 s). */
fun AppViewModel.qpPending52(text: String): Boolean = p52b.qpBusy && p52b.qpText == text.trim()

/** AI sa «huske» for teksten → Huskeliste. */
fun AppViewModel.qpHuske52(text: String): Boolean = p52b.qpRes?.takeIf { p52b.qpText == text.trim() }?.type == "huske"

/** AI (eller regelen fra serveren) ga tittel/sted for teksten → lagres med de feltene, ikke ny tolkning i køen. */
fun AppViewModel.qpAppt52(text: String): Boolean = p52b.qpRes?.takeIf { p52b.qpText == text.trim() }?.let { it.type == "kalender" && it.date != null } == true

/** Trykk på Enter mens AI tolker: vent opptil 2,5 s, så [then]. */
fun AppViewModel.awaitQp52(text: String, then: () -> Unit) {
    launch52b {
        val t0 = System.currentTimeMillis()
        while (qpPending52(text) && System.currentTimeMillis() - t0 < 2_500L) delay(50)
        then()
    }
}

/* ======================= Glimt-figur per bruker ======================= */

data class CharUser52(val id: String, val name: String, val char: String, val default: String?, val source: String)

/** Figuren følger profilen på serveren (glimt_char, ev. admins standard for brukeren, f.eks. Blekksprut). */
fun AppViewModel.loadChar52() {
    val s = p52b
    val a = account?.id ?: return
    if (s.charFor == a) return
    s.charFor = a
    launch52b {
        val o = runCatching { JSONObject(api52b { hlGet("/me/glimt-char52", timeout = 8_000) }) }.getOrNull() ?: return@launch52b
        val c = o.s52("char")?.lowercase() ?: return@launch52b
        if (c !in no.kristo.finanshub.ui.Fig35.IDS) return@launch52b
        prefs.set("glimt_char_$a", c)
        if (p35.set.char != c) {
            p35.set = p35.set.copy(char = c)
            runCatching { Glimt35Prefs.save(appCtx52b, p35.set) }
            runCatching { no.kristo.finanshub.widget.Brief34Store.redrawAsync(appCtx52b) }
        }
    }
}

/** Admin: standardfigur per bruker (gjelder til brukeren velger selv). */
fun AppViewModel.loadCharAdmin52() {
    launch52b {
        val o = runCatching { JSONObject(api52b { hlGet("/admin/glimt-char52", timeout = 8_000) }) }.getOrNull() ?: return@launch52b
        val a = o.optJSONArray("users") ?: JSONArray()
        p52b.charAdmin = (0 until a.length()).mapNotNull { i ->
            val u = a.optJSONObject(i) ?: return@mapNotNull null
            CharUser52(u.s52("id") ?: return@mapNotNull null, u.s52("name") ?: "", u.s52("char") ?: "glimt", u.s52("default"), u.s52("source") ?: "standard")
        }
    }
}

fun AppViewModel.setCharDefault52(userId: String, char: String?) {
    p52b.charAdmin = p52b.charAdmin?.map { if (it.id == userId) it.copy(default = char) else it }
    Haptics.select()
    launch52b {
        runCatching { api52b { hlPut("/admin/glimt-char52/" + URLEncoder.encode(userId, "UTF-8"), JSONObject().put("default", char ?: JSONObject.NULL)) } }
            .onFailure { flash("Fikk ikke lagret standardfiguren") }
        loadCharAdmin52()
    }
}
