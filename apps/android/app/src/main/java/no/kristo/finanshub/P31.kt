package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/*
 * Prompt 31 (ANDROID31): Glimt (AI-agenten i Nordlys OS) og Nordlys OS-oppdateringen.
 *  - Glimt-ruteren: POST /api/assist {q, source:'search'|'chat', chatId?} → 200 {text, source, intent, card?, tool?, ms, chatContext}
 *    eller 202 {jobId} (GET /api/assist/:id). Realtime «assist» (og utvidet «calendar-quick») med {jobId, state, steps[], fields[],
 *    progress, title, model, input} driver toasten og glassboblen (ui/Glimt31.kt). Rask time avbrytes med POST /api/kalender/quick/:id/cancel.
 *  - Søkefeltet på Hjem: svaret i en mørk boble under feltet (ikke Chat). Chat: verktøysvar med kort (ui/Cards31.kt) før LLM.
 *  - Svar som kommer mens appen er i bakgrunnen: lokalt varsel «Glimt» (Notify31.kt), og banner «Glimt svarte mens du var borte».
 *    WorkManager henter GET /api/notify/pending når prosessen er borte (Notify31.kt).
 *  - Prøveperioder: GET/POST /finans/api/subscriptions/trials, PATCH …/:id {status|snooze}; lokale varsler på enheten (AlarmManager).
 *  - Nordlys OS: System-siden (ui/Nordlys31.kt), oppdatering uten passord som standard; bryteren require_password i
 *    /api/system/update/settings. Når den er på: fingeravtrykk/PIN lokalt, og passordet (lagret kryptert i Keystore bare hvis brukeren
 *    har slått på «Bruk fingeravtrykk») byttes mot en kortlivet reauthToken (POST /api/auth/reauth). Ellers passord-arket fra prompt 30.
 */

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

data class Trial31(
    val id: String, val service: String, val endsAt: LocalDate, val priceAfter: String, val offsets: List<Int>, val status: String,
    val cancelUrl: String?, val reminders: List<Pair<Long, Pair<String, String>>>,
)

/** Resultatet av tolkningen i «✦ Skriv det med egne ord». */
data class TrialParse31(val service: String, val endsAt: LocalDate, val price: String)

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
    /* «Glimt svarte mens du var borte» */
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

private fun JSONObject.s31(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

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
private val WDL31 = listOf("mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag")
private val MN31 = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")
private val MNL31 = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")

/** «lør 1. nov» */
fun dShort31(d: LocalDate): String = "${WD31[d.dayOfWeek.value - 1]} ${d.dayOfMonth}. ${MN31[d.monthValue - 1]}"
/** «lørdag 1. november» */
fun dLong31(d: LocalDate): String = "${WDL31[d.dayOfWeek.value - 1]} ${d.dayOfMonth}. ${MNL31[d.monthValue - 1]}"

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
    )
}

/** POST /api/assist. Null = serveren mangler ruteren (404/405) eller svarte ikke innen tiden. Venter på jobben (202) i opptil 60 s. */
internal suspend fun AppViewModel.assist31(q: String, source: String, chatId: String? = null, onJob: (String) -> Unit = {}): Assist31? {
    val s = p31
    if (s.assistMissing) return null
    noteAiErr34(null, null)
    val body = JSONObject().put("q", q).put("source", source)
    chatId?.let { body.put("chatId", it) }
    // Prompt 34: feilen huskes (p34.lastErr/lastModel), så svaret kan si «Glimt fikk ikke svar fra {modell}: {feil}». 25 s: serveren bytter til reserven etter 20 s.
    val raw = try { api31 { request("POST", "/assist", body, prefix = Api.HOMELAB, timeout = 6000, read = 25_000) } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 404 || e.status == 405) s.assistMissing = true
        noteAiErr34(null, e.message)
        return null
    } catch (e: Exception) { noteAiErr34(null, e.message ?: "fikk ikke kontakt med serveren"); return null }
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

fun AppViewModel.closeAns31() { p31.ans = null; p31.ansSeq++ }

/** Chat: verktøysvar (vær, kalender, avganger …) før LLM. Returnerer true når Glimt tar spørsmålet. */
fun AppViewModel.chatTool31(text: String): Boolean {
    val c = chat27
    val s = p31
    if (s.assistMissing || c.att.isNotEmpty() || c.busy) return false
    val t = text.trim()
    if (t.isEmpty()) return false
    c.msgs = c.msgs + ChatMsg27("user", t)
    c.input = ""
    c.busy = true; c.stream = ""; c.streamTools = emptyList(); c.stopped = false
    val t0 = System.currentTimeMillis()
    c.job = launchJob31 {
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

/** Verktøynavnet ut fra kortet. */
internal fun cardTool31(card: JSONObject): String? = when (card.s31("k")) {
    "weather", "wx" -> "Vær"; "calendar", "cal" -> "Kalender"; "departures", "dep" -> "Avganger"; "packages", "pk" -> "Pakker"
    "finance", "fin" -> "Finans"; "tasks" -> "Gjøremål"; "trial", "trials" -> "Abonnementer"; else -> null
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

/* ---------------- Bakgrunn og forgrunn ---------------- */

/** Appen gikk i bakgrunnen: WorkManager følger opp jobber som ikke er ferdige. */
fun AppViewModel.onBackground31() {
    Notify31.setForeground(appCtx29, false)
    if (!loggedIn) return
    Notify31.schedule(appCtx29)
    if (p31.ans?.busy == true || chat27.busy || q29.jobs.isNotEmpty()) Notify31.followUp(appCtx29)
}

/** Tilbake i appen: banneret «Glimt svarte mens du var borte» i 4 s (med mindre varselet ble trykket). */
fun AppViewModel.onForeground31() {
    Notify31.setForeground(appCtx29, true)
    val s = p31
    // Prøvene på nytt (nye fra web planlegges som lokale varsler), høyst hvert 10. minutt.
    if (System.currentTimeMillis() - s.trialsAt > 600_000L) { s.trialsAt = System.currentTimeMillis(); loadTrials31(); Notify31.schedule(appCtx29) }
    launch31 {
        delay(350)
        val sp = Notify31.sp(appCtx29)
        val b = s.away ?: sp.getString("away", null) ?: return@launch31
        s.away = null
        sp.edit().remove("away").apply()
        if (!p39.aiIn) return@launch31 // prompt 39: «Vis svaret i appen også» av – svaret ligger bare i chatten og varselet
        s.banner = "Glimt svarte mens du var borte" to b
        s.bannerSeq++
        delay(4200)
        if (s.banner?.second == b) s.banner = null
    }
}

/** Varselet ble trykket (finanshub://glimt eller finanshub://chat/…): ikke vis banneret i tillegg. */
fun AppViewModel.openedFromNotify31() { p31.away = null; Notify31.sp(appCtx29).edit().remove("away").apply() }

/* ---------------- Innstillinger → Varsler: AI-svar i bakgrunnen ---------------- */

private fun AppViewModel.aiBgKey31() = "ai_bg_notify31_" + (account?.id ?: "")

fun AppViewModel.loadAiBg31() {
    val s = p31
    val key = aiBgKey31()
    if (s.aiBgFor == key) return
    s.aiBgFor = key
    s.aiBg = prefs.bool(key, true)
    Notify31.setAiBg(appCtx29, s.aiBg)
    launch31 {
        val raw = runCatching { api31 { hlGet("/me/notify") } }.getOrNull() ?: return@launch31
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch31
        val x = o.optJSONObject("prefs") ?: o
        if (x.has("ai_bg_notify")) { s.aiBg = x.optBoolean("ai_bg_notify", true); prefs.set(key, s.aiBg); Notify31.setAiBg(appCtx29, s.aiBg) }
    }
}

fun AppViewModel.setAiBg31(on: Boolean) {
    p31.aiBg = on
    prefs.set(aiBgKey31(), on)
    Notify31.setAiBg(appCtx29, on)
    Haptics.select()
    launch31 { runCatching { api31 { hlPut("/me/notify", notifyPrefs.toJson().put("ai_bg_notify", on)) } } }
}

/* ---------------- Nordlys OS ---------------- */

fun AppViewModel.openNordlys31() {
    p31.nordOpen = true
    Haptics.select()
    loadUpd30(force = true)
    loadUpdSettings30()
    loadNordlys31()
}

fun AppViewModel.closeNordlys31() { Haptics.back(); p31.nordOpen = false; p31.bioAsk = false } // prompt 34: haptikk på Tilbake

fun AppViewModel.loadNordlys31() {
    val s = p31
    s.bioOn = Nordlys31Keys.has(appCtx29, account?.id)
    launch31 {
        runCatching { JSONObject(api31 { hlGet("/system/version") }) }.getOrNull()?.let { o ->
            o.s31("name")?.let { s.osName = it }
            o.s31("tagline")?.let { s.tagline = it }
            s.sizeBytes = if (o.has("sizeBytes") && !o.isNull("sizeBytes")) o.optLong("sizeBytes") else null
            val l = o.optJSONObject("latest")
            s.sha = (l?.s31("sha") ?: o.s31("sha") ?: "").take(7)
            s.relDate = l?.s31("date") ?: l?.s31("publishedAt") ?: o.s31("date") ?: ""
        }
        runCatching { JSONObject(api31 { hlGet("/system/update/settings") }) }.getOrNull()?.let { o0 ->
            val o = o0.optJSONObject("settings") ?: o0
            s.reqPw = o.optBoolean("require_password", o.optBoolean("requirePassword", false))
            s.reqPwLoaded = true
        }
    }
}

/** «Se etter»: henter fra GitHub via serveren. */
fun AppViewModel.checkNordlys31() {
    val s = p31
    if (s.checking || p30.upd.phase == "run") return
    s.checking = true
    Haptics.select()
    launch31 {
        runCatching { api31 { request("POST", "/system/update/check", JSONObject(), prefix = Api.HOMELAB, read = 20_000) } }
        loadUpd30(force = true)
        delay(1100)
        loadNordlys31()
        s.checking = false
    }
}

/** Bryteren «Krev fingeravtrykk eller passord» (require_password, bare admin). */
fun AppViewModel.setReqPw31(on: Boolean) {
    val s = p31
    s.reqPw = on
    Haptics.select()
    launch31 {
        try { api31 { hlPut("/system/update/settings", JSONObject().put("require_password", on)) } }
        catch (e: ApiException) { s.reqPw = !on; flash(if (e.status == 404) "Kunne ikke lagre: serveren har ikke denne innstillingen ennå" else "Kunne ikke lagre: ${e.message}") }
    }
}

/** «Bruk fingeravtrykk»: passordet kontrolleres hos serveren (POST /api/auth/reauth) og lagres kryptert på enheten. */
fun AppViewModel.saveBioPw31(pw: String) {
    val s = p31
    if (pw.isBlank()) { s.bioErr = "Skriv inn passordet ditt"; return }
    s.bioBusy = true; s.bioErr = ""
    launch31 {
        try {
            api31 { request("POST", "/auth/reauth", JSONObject().put("password", pw), prefix = Api.HOMELAB) }
            Nordlys31Keys.save(appCtx29, account?.id, pw)
            s.bioOn = true; s.bioAsk = false
            Haptics.success()
        } catch (e: ApiException) {
            s.bioErr = if (e.status == 404) "Serveren støtter ikke dette ennå." else if (e.status == 401 || e.status == 403) "Feil passord" else (e.message ?: "Noe gikk galt")
            Haptics.error()
        } catch (e: Exception) { s.bioErr = e.message ?: "Fikk ikke kontakt med serveren" }
        finally { s.bioBusy = false }
    }
}

fun AppViewModel.clearBioPw31() { Nordlys31Keys.clear(appCtx29, account?.id); p31.bioOn = false; Haptics.select() }

/**
 * «Oppdater nå» (System-siden, banneret, PROGRAMVARE). Standard: ett trykk, uten passord. Med require_password på:
 * fingeravtrykk/PIN → lagret passord → reauthToken; uten lagret passord: passord-arket (prompt 30).
 */
fun AppViewModel.startUpd31(ctx: Context, action: String = "start") {
    val s = p31
    if (s.startBusy) return
    if (s.reqPw) {
        val pw = Nordlys31Keys.get(appCtx29, account?.id)
        if (pw == null) { askUpd30(action); return }
        Bio31.confirm(ctx, if (action == "rollback") "Gjenopprett forrige versjon" else "Oppdater Nordlys OS", displayName.ifBlank { appName },
            onOk = { postUpd31(action, pw) }, onFail = { askUpd30(action) })
        return
    }
    postUpd31(action, null)
}

private fun AppViewModel.postUpd31(action: String, pw: String?) {
    val s = p31
    val u = p30.upd
    s.startBusy = true
    launch31 {
        try {
            val body = JSONObject()
            if (pw != null) {
                val tok = runCatching { JSONObject(api31 { request("POST", "/auth/reauth", JSONObject().put("password", pw), prefix = Api.HOMELAB) }) }.getOrNull()
                    ?.let { it.s31("reauthToken") ?: it.s31("token") }
                if (tok != null) body.put("reauthToken", tok) else body.put("password", pw)
            }
            val path = if (action == "rollback") "/system/update/rollback" else "/system/update/start"
            api31 { request("POST", path, body, prefix = Api.HOMELAB, read = 60_000) }
            u.action = action
            u.phase = "run"; u.pct = 2; u.error = ""; u.notesOpen = false
            u.stepText = if (action == "rollback") "Laster ned forrige versjon …" else updStepText30(0, u.latest)
            Haptics.success()
            // Følg med på fremdriften (samme poll som prompt 30).
            pollUpd30()
        } catch (e: ApiException) {
            // Eldre server eller passord kreves likevel: passord-arket.
            if (e.status == 400 || e.status == 401 || e.status == 403) askUpd30(action)
            else flash(if (e.status == 404 || e.status == 405) "Serveren støtter ikke oppdatering fra appen." else "Kunne ikke starte: ${e.message}")
        } catch (e: Exception) { flash("Kunne ikke starte: ${e.message}") }
        finally { s.startBusy = false }
    }
}

/** «4.22» av «4.22.0». */
fun bigVer31(v: String): String = v.split('.').take(2).joinToString(".").ifBlank { "–" }

fun sizeText31(b: Long?): String? = b?.takeIf { it > 0 }?.let { if (it >= 1_000_000) "${Math.round(it / 1_000_000.0)} MB" else "${Math.max(1, Math.round(it / 1000.0))} kB" }

/* ---------------- Prøveperioder ---------------- */

/** Kjente tjenester (spec + fasiten), i rekkefølgen de sjekkes. */
private val TRIAL_KN31 = listOf(
    "Viaplay", "Netflix", "HBO Max", "Max", "Disney+", "Spotify", "TV 2 Play", "Storytel", "BookBeat", "Apple TV+", "Apple Music", "YouTube Premium",
    "Amazon Prime", "Audible", "Strava", "Tidal", "Duolingo", "ChatGPT", "Adobe", "Canva", "Discovery+", "SkyShowtime", "Nextory",
)

/** Kjente oppsigelseslenker (brukes når serveren ikke sender cancel_url). */
internal val TRIAL_CANCEL31 = mapOf(
    "viaplay" to "https://viaplay.no/account", "netflix" to "https://www.netflix.com/cancelplan", "hbo max" to "https://auth.max.com/subscription",
    "max" to "https://auth.max.com/subscription", "disney+" to "https://www.disneyplus.com/account/subscription", "spotify" to "https://www.spotify.com/no/account/subscription/",
    "tv 2 play" to "https://play.tv2.no/konto", "storytel" to "https://www.storytel.com/no/account", "bookbeat" to "https://www.bookbeat.com/no/account",
    "apple tv+" to "https://apps.apple.com/account/subscriptions", "apple music" to "https://apps.apple.com/account/subscriptions",
    "youtube premium" to "https://www.youtube.com/paid_memberships", "amazon prime" to "https://www.amazon.com/mc", "audible" to "https://www.audible.com/account/overview",
    "strava" to "https://www.strava.com/account", "tidal" to "https://account.tidal.com/subscription", "duolingo" to "https://www.duolingo.com/settings/subscription",
    "chatgpt" to "https://chatgpt.com/#settings/Subscription", "adobe" to "https://account.adobe.com/plans", "canva" to "https://www.canva.com/settings/billing-and-teams",
    "discovery+" to "https://www.discoveryplus.com/no/account", "skyshowtime" to "https://www.skyshowtime.com/no/account", "nextory" to "https://www.nextory.no/konto",
)

/** Tolker «Viaplay gratis i 14 dager, påminn meg» / «Storytel prøve til 25.11, 179 kr» (TRP() i fasiten). */
fun parseTrial31(txt: String, today: LocalDate = LocalDate.now(OSLO31)): TrialParse31? {
    val raw = txt.trim()
    if (raw.isEmpty()) return null
    val t = raw.lowercase()
    var end: LocalDate? = null
    Regex("(\\d+)\\s*(dager|dag|døgn|uker|uke|måneder|måned|mnd)").find(t)?.let { m ->
        val n = m.groupValues[1].toLong()
        val u = m.groupValues[2]
        end = when { u.startsWith("uke") -> today.plusWeeks(n); u.startsWith("mån") || u == "mnd" -> today.plusMonths(n); else -> today.plusDays(n) }
    }
    if (end == null) Regex("(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?").find(t)?.let { m ->
        val y = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt()?.let { if (it < 100) 2000 + it else it }
        val d = runCatching { LocalDate.of(y ?: today.year, m.groupValues[2].toInt(), m.groupValues[1].toInt()) }.getOrNull()
        end = if (d != null && y == null && d.isBefore(today)) d.plusYears(1) else d
    }
    if (end == null && Regex("en måned|1 måned|månedlig prøve").containsMatchIn(t)) end = today.plusMonths(1)
    if (end == null && Regex("\\ben uke\\b").containsMatchIn(t)) end = today.plusWeeks(1)
    val e = end ?: return null
    var n = TRIAL_KN31.firstOrNull { t.contains(it.lowercase()) }
    if (n == null) {
        val skip = setOf("gratis", "påminn", "prøve", "prøveperiode", "minn", "husk", "jeg", "si")
        n = raw.split(Regex("\\s+")).firstOrNull { w -> w.firstOrNull()?.let { it.isUpperCase() } == true && w.lowercase().trim(',', '.', ':', '!') !in skip }?.replace(Regex("[,.:!]"), "")
    }
    if (n.isNullOrBlank()) return null
    val pm = Regex("(\\d+[.,]?\\d*)\\s*(kr|,-)", RegexOption.IGNORE_CASE).find(raw)
    return TrialParse31(n, e, pm?.let { it.groupValues[1] + " kr/mnd" } ?: "")
}

/** Varseltidene på enheten: ends_at − offset kl. 09:00 Europe/Oslo og siste varsel kl. 18:00 på sluttdagen. */
fun trialTimes31(t: Trial31): List<Pair<Long, Pair<String, String>>> {
    if (t.reminders.isNotEmpty()) return t.reminders
    val out = ArrayList<Pair<Long, Pair<String, String>>>()
    val price = t.priceAfter.ifBlank { "å betale" }
    val body = "Avslutt før ${dShort31(t.endsAt)} for å slippe $price. Trykk for å åpne oppsigelsessiden."
    for (d in t.offsets.distinct().sorted()) {
        val at = t.endsAt.minusDays(d.toLong()).atTime(LocalTime.of(9, 0)).atZone(OSLO31).toInstant().toEpochMilli()
        val ti = t.service + "-prøven " + when (d) { 0 -> "slutter i dag"; 1 -> "slutter i morgen"; else -> "slutter om $d dager" }
        out += at to (ti to body)
    }
    val last = t.endsAt.atTime(LocalTime.of(18, 0)).atZone(OSLO31).toInstant().toEpochMilli()
    out += last to ("${t.service}-prøven slutter i dag" to "Siste sjanse: avslutt i dag for å slippe $price.")
    return out
}

internal fun parseTrials31(raw: String): List<Trial31> {
    val tr = raw.trim()
    val a = runCatching { if (tr.startsWith("[")) JSONArray(tr) else JSONObject(tr).let { it.optJSONArray("trials") ?: it.optJSONArray("items") } }.getOrNull() ?: return emptyList()
    val out = ArrayList<Trial31>()
    for (i in 0 until a.length()) {
        val o = a.optJSONObject(i) ?: continue
        val id = o.s31("id") ?: continue
        val end = (o.s31("ends_at") ?: o.s31("endsAt"))?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: continue
        val offs = (o.optJSONArray("remind_offsets_days") ?: o.optJSONArray("remindOffsetsDays"))?.let { x -> (0 until x.length()).map { x.optInt(it) } }
            ?: runCatching { JSONArray(o.optString("remind_offsets_days")).let { x -> (0 until x.length()).map { x.optInt(it) } } }.getOrNull() ?: listOf(1)
        val price = o.opt("price_after").let { v -> when (v) { is Number -> "${v.toInt()} kr/mnd"; is String -> v; else -> "" } }
        val rem = ArrayList<Pair<Long, Pair<String, String>>>()
        (o.optJSONArray("reminders") ?: o.optJSONArray("notifications") ?: o.optJSONArray("notify_at"))?.let { x ->
            for (k in 0 until x.length()) {
                val r = x.optJSONObject(k) ?: continue
                val at = r.opt("at").let { v -> when (v) { is Number -> v.toLong(); is String -> runCatching { java.time.OffsetDateTime.parse(v).toInstant().toEpochMilli() }.getOrNull(); else -> null } } ?: continue
                rem += at to ((r.s31("title") ?: "${o.s31("service")}-prøven slutter snart") to (r.s31("body") ?: ""))
            }
        }
        val svc = o.s31("service") ?: o.s31("name") ?: "Prøve"
        out += Trial31(id, svc, end, price, offs, o.s31("status") ?: "active", o.s31("cancel_url") ?: o.s31("cancelUrl") ?: TRIAL_CANCEL31[svc.lowercase()], rem)
    }
    return out
}

fun AppViewModel.loadTrials31() {
    val s = p31
    launch31 {
        val raw = try { api31 { get("/subscriptions/trials") } } catch (e: ApiException) {
            if (e.status == 404) s.trialsMissing = true
            return@launch31
        } catch (e: Exception) { return@launch31 }
        s.trialsMissing = false
        s.trials = parseTrials31(raw)
        Notify31.scheduleTrials(appCtx29, s.trials)
        trialMeta32b(raw) // prompt 32: startdato (fremdrift) og widgetene (widget/Trials32bWidgets.kt)
    }
}

/** «Fyll ut»: tolker teksten og fyller feltene. */
fun AppViewModel.fillTrial31() {
    val s = p31
    val r = parseTrial31(s.tai)
    if (r == null) { s.trialErr = "Fant ikke tjeneste eller dato"; Haptics.error(); return }
    s.tn = r.service; s.te = r.endsAt; if (r.price.isNotBlank()) s.tp = r.price
    s.trialErr = ""
    Haptics.select()
}

fun AppViewModel.resetTrialForm31() { val s = p31; s.tn = ""; s.te = null; s.tp = ""; s.tai = ""; s.trem = setOf(1); s.trialErr = "" }

/** «Lagre påminnelse». */
fun AppViewModel.saveTrial31(done: () -> Unit) {
    val s = p31
    val end = s.te
    if (s.tn.isBlank() || end == null) { s.trialErr = "Fyll inn tjeneste og sluttdato"; Haptics.error(); return }
    if (s.trialBusy) return
    s.trialBusy = true; s.trialErr = ""
    val price = s.tp.trim()
    val pNum = Regex("(\\d+[.,]?\\d*)").find(price)?.groupValues?.get(1)?.replace(',', '.')?.toDoubleOrNull()
    val body = JSONObject().put("service", s.tn.trim()).put("ends_at", end.toString()).put("remind_offsets_days", JSONArray(s.trem.sorted()))
        .put("price_after", pNum ?: JSONObject.NULL).put("price_text", price)
    launch31 {
        try {
            api31 { post("/subscriptions/trials", body) }
            flash("Påminnelse lagret · ${s.tn.trim()}")
            Haptics.success()
            resetTrialForm31()
            loadTrials31()
            done()
        } catch (e: ApiException) {
            s.trialErr = if (e.status == 404) "Serveren har ikke prøveperioder ennå. Oppdater Nordlys OS." else (e.message ?: "Kunne ikke lagre")
            Haptics.error()
        } catch (e: Exception) { s.trialErr = e.message ?: "Fikk ikke kontakt med serveren" }
        finally { s.trialBusy = false }
    }
}

/** Behold (blir vanlig abonnement) / Avsluttet / Minn meg i morgen. */
fun AppViewModel.patchTrial31(id: String, status: String?, snooze: Boolean = false) {
    launch31 {
        try {
            api31 { patch("/subscriptions/trials/" + URLEncoder.encode(id, "UTF-8"), if (snooze) JSONObject().put("snooze", "tomorrow") else JSONObject().put("status", status)) }
            loadTrials31()
            if (status == "kept") loadSubs()
        } catch (e: ApiException) { flash("Kunne ikke lagre: ${e.message}") }
    }
}

/** «Prøve · 12 dager igjen» */
fun trialLeft31(t: Trial31, today: LocalDate = LocalDate.now(OSLO31)): String {
    val d = java.time.temporal.ChronoUnit.DAYS.between(today, t.endsAt)
    return when { d < 0 -> "Prøven er over"; d == 0L -> "Prøve · slutter i dag"; d == 1L -> "Prøve · 1 dag igjen"; else -> "Prøve · $d dager igjen" }
}
