package no.kristo.finanshub

import android.content.Context
import android.media.AudioManager
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.Locale
import no.kristo.finanshub.ui.Fig35

/*
 * Prompt 35 (ANDROID35), filer med «35»:
 *  - Glimt-figurene (13 stk., ui/GlimtFigs35.kt) og Glimt-familien: verten (brukerens figur, Glimt Natt 21–06) og vennene som tar over
 *    etter tema (vær → Sky/Dråpe, kalender → Ugle, prøveperioder → Gris, nyheter → verten). claude-code-glimt-figurer.md.
 *  - Innstillinger → GLIMT → «Glimt» (claude-code-innst-glimt.md): figur, brytere, briefer gjennom dagen, stemmemotor, stemme, språk, tempo.
 *    GET/PUT /api/glimt/settings (delvis, per bruker), eldre server: /api/brief/settings, ellers lokalt. Nøkler: bare admin (PUT /api/ai/keys/:motor).
 *  - Opplesning: POST /api/tts → audio/mpeg (MediaPlayer, cache 30 dager på telefonen også). 503 {fallback:'browser'} eller feil → telefonens
 *    egen stemme (TextToSpeech) med klang per figur. Stopper ved Hopp over / Ferdig / bakgrunn / samtale (lydfokus), følger lydløs og stille timer.
 *  - Briefen: nyheter med bilder (toppsak + 6), prøveperioder som slutter innen 7 dager (POST /api/brief/trials/:id/done), guide[] fra serveren.
 *  - AI-søk på Hjem: «været i New York» → GET /api/weather/place?q= (reserve: Open-Meteo direkte). Trykk åpner Vær for stedet.
 *  - Bursdager → Google Kalender: velg flere kalendere (calendarIds), deep link finanshub://settings/glimt | kalendere.
 */

private val OSLO35: ZoneId = ZoneId.of("Europe/Oslo")

/* ---------------- Innstillinger ---------------- */

data class GlimtBrief35(val on: Boolean, val at: String)
data class GlimtEngine35(val id: String, val name: String, val ready: Boolean, val keySet: Boolean, val tail: String?, val admin: Boolean)

data class GlimtSet35(
    val char: String = "glimt", val friends: Boolean = true, val brief: Boolean = true, val readAloud: Boolean = false, val guide: Boolean = true, val notify: Boolean = true,
    val briefs: Map<String, GlimtBrief35> = BRIEFS35_DEFAULT,
    val engine: String = "openai", val voice: String = "nora", val rate: String = "normal", val lang: String = "no",
    val engines: List<GlimtEngine35> = emptyList(), val chars: List<Pair<String, String>> = emptyList(),
    /** Prompt 39 (claude-code-brief-glimt-av.md): Glimt-figuren og vennene i briefen, på Hjem-kortet og i widgets (briefGlimt). */
    val briefGlimt: Boolean = true,
) {
    fun toJson(): JSONObject = JSONObject().put("char", char).put("friends", friends).put("brief", brief).put("readAloud", readAloud).put("guide", guide).put("notify", notify).put("briefGlimt", briefGlimt)
        .put("briefs", JSONObject().apply { briefs.forEach { (k, v) -> put(k, JSONObject().put("on", v.on).put("at", v.at)) } })
        .put("tts", JSONObject().put("engine", engine).put("voice", voice).put("rate", rate).put("lang", lang))
}

val BRIEFS35_DEFAULT = linkedMapOf("morning" to GlimtBrief35(true, "06:45"), "day" to GlimtBrief35(false, "12:00"), "evening" to GlimtBrief35(true, "18:00"), "night" to GlimtBrief35(false, "22:30"))
val BRIEF_KINDS35 = listOf("morning", "day", "evening", "night")

/** Stemmene (fasit: VOICES). */
val VOICES35 = listOf(Triple("nora", "Nora · rolig og varm", "Kvinne · voksen, rolig"), Triple("henrik", "Henrik · lav og trygg", "Mann · dyp, avslappet"), Triple("lys", "Lys · glad og lett", "Kvinne · ung, smilende"))

/** Motorene når serveren ikke sender engines[] (fasit: ENG). id, navn, beskrivelse, merke, nøkkel-lenke. */
data class EngInfo35(val id: String, val name: String, val desc: String, val tag: String, val tagBg: Long, val tagFg: Long, val keyUrl: String?)
val ENGINES35 = listOf(
    EngInfo35("openai", "OpenAI · gpt-4o-mini-tts", "Nesten menneskelig. Følger instruks om tone og følelse.", "ANBEFALT", 0xFFE3EFE6, 0xFF2F7A4F, "https://platform.openai.com/api-keys"),
    EngInfo35("elevenlabs", "ElevenLabs · Multilingual v2", "Mest naturlig og uttrykksfull. Kan klone en egen stemme.", "BEST", 0xFFFBEEE8, 0xFFB23A2A, "https://elevenlabs.io/app/settings/api-keys"),
    EngInfo35("azure", "Azure · nb-NO Neural (Pernille, Finn, Iselin)", "Ekte norske stemmer med riktig tonelag.", "NORSK", 0xFFE6EEF4, 0xFF2B5D8A, "https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices"),
    EngInfo35("browser", "Telefonens stemme", "Robotaktig. Bare som reserve uten nøkkel.", "", 0, 0, null),
)

private fun b35(o: JSONObject?, k: String, def: Boolean): Boolean = if (o != null && o.has(k) && !o.isNull(k)) o.optBoolean(k, def) else def
private fun s35(o: JSONObject?, vararg k: String): String? = s34(o, *k)

fun parseGlimtSet35(raw: String, prev: GlimtSet35 = GlimtSet35()): GlimtSet35 {
    val o0 = JSONObject(raw.trim())
    val o = o0.optJSONObject("settings") ?: o0
    val br = o.optJSONObject("briefs")
    val briefs = LinkedHashMap<String, GlimtBrief35>()
    for (k in BRIEF_KINDS35) {
        val d = prev.briefs[k] ?: BRIEFS35_DEFAULT.getValue(k)
        val x = br?.optJSONObject(k) ?: br?.optJSONObject(when (k) { "morning" -> "morgen"; "day" -> "dag"; "evening" -> "kveld"; else -> "natt" })
        briefs[k] = if (x == null) d else GlimtBrief35(b35(x, "on", d.on), s35(x, "at", "t", "time") ?: d.at)
    }
    val tts = o.optJSONObject("tts")
    val engines = objs34(o.optJSONArray("engines")).mapNotNull { e ->
        val id = s35(e, "id") ?: return@mapNotNull null
        GlimtEngine35(if (id == "eleven") "elevenlabs" else id, s35(e, "name") ?: id, b35(e, "ready", false), b35(e, "keySet", false), s35(e, "tail", "last4"), b35(e, "admin", false))
    }
    val chars = objs34(o.optJSONArray("chars")).mapNotNull { c -> (s35(c, "id") ?: return@mapNotNull null) to (s35(c, "name") ?: "") }
    return GlimtSet35(
        s35(o, "char", "figure")?.let { Fig35.norm(it) } ?: prev.char, b35(o, "friends", prev.friends), b35(o, "brief", b35(o, "on", prev.brief)),
        b35(o, "readAloud", b35(o, "voice", prev.readAloud)), b35(o, "guide", b35(o, "auto", prev.guide)), b35(o, "notify", b35(o, "notif", prev.notify)), briefs,
        (s35(tts, "engine") ?: s35(o, "engine", "eng") ?: prev.engine).let { if (it == "eleven") "elevenlabs" else it },
        s35(tts, "voice") ?: s35(o, "voiceId") ?: prev.voice, s35(tts, "rate") ?: prev.rate, s35(tts, "lang") ?: s35(o, "lang") ?: prev.lang,
        engines.ifEmpty { prev.engines }, chars.ifEmpty { prev.chars },
        b35(o, "briefGlimt", b35(o.optJSONObject("glimt_brief_cfg"), "fig", b35(o, "fig", prev.briefGlimt))),
    )
}

/** Verten: brukerens figur, Glimt Natt mellom 21 og 06 når «Glimt» er valgt. */
fun hostChar35(char: String, h: Int = LocalTime.now(OSLO35).hour): String = if (char == "glimt" && (h >= 21 || h < 6)) "natt" else char

private fun mins35(at: String): Int = at.split(':').let { (it.getOrNull(0)?.trim()?.toIntOrNull() ?: 0) * 60 + (it.getOrNull(1)?.trim()?.toIntOrNull() ?: 0) }

/** Siste valgte brief som har vært (ellers den siste fra i går). Ingen valgt: etter tiden på dagen. */
fun briefKind35(set: GlimtSet35?, now: LocalTime = LocalTime.now(OSLO35)): String {
    val on = set?.briefs?.filter { it.value.on }?.entries?.sortedBy { mins35(it.value.at) } ?: return briefKind34(now.hour)
    if (on.isEmpty()) return briefKind34(now.hour)
    val m = now.hour * 60 + now.minute
    return (on.lastOrNull { mins35(it.value.at) <= m } ?: on.last()).key
}

/** Innstillingene som widgetene trenger (figur og briefer) uten appen: SharedPreferences «brief34_widgets» → «glimt35». */
object Glimt35Prefs {
    fun save(ctx: Context, s: GlimtSet35) { runCatching { ctx.getSharedPreferences("brief34_widgets", Context.MODE_PRIVATE).edit().putString("glimt35", s.toJson().toString()).putBoolean("notify", s.notify).apply() } }
    fun load(ctx: Context): GlimtSet35? = runCatching { ctx.getSharedPreferences("brief34_widgets", Context.MODE_PRIVATE).getString("glimt35", null)?.let { parseGlimtSet35(it) } }.getOrNull()
}

/* ---------------- Guide-runden og prøveperioder i briefen ---------------- */

/** Ett steg i guide-runden: hvem som snakker (figur-id), kortet (vaer | kal | abo | nyh | null), tekst og knapp. */
data class Guide35(val target: String?, val text: String, val textEn: String?, val action: String, val char: String)

/** Prøve som slutter innen 7 dager (GET /api/brief → trials[]). */
data class BriefTrial35(val id: String, val service: String, val logo: String?, val endsAt: LocalDate?, val endsLabel: String, val daysLeft: Int, val priceLabel: String?,
    val progress: Float, val cancelUrl: String?)

private val WD35 = listOf("man", "tir", "ons", "tor", "fre", "lør", "søn")
private fun endsLabel35(d: LocalDate) = WD35[d.dayOfWeek.value - 1] + " " + d.dayOfMonth + "."

internal fun parseGuide35(a: JSONArray?): List<Guide35> = objs34(a).mapNotNull { g ->
    val text = s35(g, "text", "t") ?: return@mapNotNull null
    val tg = s35(g, "target", "k")?.takeIf { it in setOf("vaer", "kal", "abo", "nyh") }
    Guide35(tg, text, s35(g, "textEn", "en"), s35(g, "action", "next", "button") ?: "Neste", Fig35.norm(s35(g, "char", "who")))
}

internal fun parseTrials35(a: JSONArray?, today: LocalDate = LocalDate.now(OSLO35)): List<BriefTrial35> = objs34(a).mapNotNull { t ->
    val id = s35(t, "id") ?: return@mapNotNull null
    val svc = s35(t, "service", "name", "n") ?: return@mapNotNull null
    val end = s35(t, "endsAt", "ends_at", "end")?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
    val days = n34(t, "daysLeft", "dd")?.toInt() ?: end?.let { trialDays32b(it, today) } ?: 0
    val prog = n34(t, "progress", "pc")?.toFloat()?.let { if (it > 1f) it / 100f else it } ?: end?.let { trialPct32b(it, null, today) } ?: .5f
    BriefTrial35(id, svc, s35(t, "logo"), end, s35(t, "endsLabel") ?: end?.let { endsLabel35(it) } ?: "", days,
        s35(t, "priceLabel") ?: n34(t, "price", "p", "price_after")?.let { "${it.toInt()} kr/mnd" }, prog.coerceIn(.04f, 1f), s35(t, "cancelUrl", "cancel_url"))
}

/** Prøvene i briefen: fra serveren, ellers fra Abonnementer (aktive, slutter innen 7 dager). */
fun AppViewModel.briefTrials35(b: Brief34?): List<BriefTrial35> {
    if (b != null && b.trials.isNotEmpty()) return b.trials.filter { it.id !in p35.trialsDone }
    val today = LocalDate.now(OSLO35)
    return p31.trials.filter { it.status == "active" && it.id !in p35.trialsDone }.mapNotNull { t ->
        val d = trialDays32b(t.endsAt, today)
        if (d < 0 || d > 7) null else BriefTrial35(t.id, t.service, null, t.endsAt, endsLabel35(t.endsAt), d, t.priceAfter.ifBlank { null },
            trialPct32b(t.endsAt, p32b.trialStart[t.id], today), t.cancelUrl)
    }.sortedBy { it.daysLeft }.take(3)
}

/** «✓ Jeg har avsluttet Viaplay»: markerer prøven avsluttet og fjerner påminnelsene. */
fun AppViewModel.trialDone35(t: BriefTrial35) {
    Haptics.success()
    p35.trialsDone = p35.trialsDone + t.id
    launch35 {
        val ok = runCatching { api35 { hlPost("/brief/trials/" + URLEncoder.encode(t.id, "UTF-8") + "/done") } }.isSuccess
        if (!ok) patchTrial31(t.id, "cancelled") else loadTrials31()
        flash("${t.service} er markert som avsluttet")
    }
}

private fun cap35(s: String) = s.replaceFirstChar { it.uppercase() }
private fun n35no(n: Int) = when (n) { 1 -> "én"; 2 -> "to"; 3 -> "tre"; 4 -> "fire"; 5 -> "fem"; 6 -> "seks"; 7 -> "sju"; else -> n.toString() }

/** Guide-runden: fra serveren (guide[]) når den finnes, ellers samme replikker som fasiten (G0). */
fun AppViewModel.guide35(b: Brief34): List<Guide35> {
    val set = p35.set
    val host = b.host?.let { Fig35.norm(it) } ?: hostChar35(set.char)
    val list0 = b.guide.ifEmpty { localGuide35(b, host) }
    if (set.friends) return list0
    // Uten venner: bare verten, og tekstene skrives om uten vennene.
    return list0.map { g ->
        val t = g.text.replace(Regex("^Hei, det er (Sky|Dråpe)! "), "Været: ").replace(Regex("^(Og Sky her|Sky her igjen): "), "")
            .replace(Regex(" Nå (gir vi ordet tilbake til Glimt|tar Glimt over)!"), "").replace(Regex("^Uhu, Ugle her med kalenderen\\. "), "I kalenderen: ")
            .replace(Regex("^Nøff! Gris her\\. "), "").replace(Regex("^Glimt igjen! "), "")
        g.copy(text = t, action = g.action.replace(Regex("^Takk, (Sky|Dråpe|Gris)$"), "Neste"), char = host)
    }
}

private fun AppViewModel.localGuide35(b: Brief34, host: String): List<Guide35> {
    val w = b.wx
    val today = LocalDate.now(OSLO35)
    val wet = w != null && (w.cond.contains("regn") || w.cond.contains("snø") || w.rainSoon.startsWith("regn"))
    val wch = if (wet) "drape" else "sky"
    val wn = if (wet) "Dråpe" else "Sky"
    val wnEn = if (wet) "Drop" else "Sky"
    val out = ArrayList<Guide35>()
    out += Guide35(null, "Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din? Vennene mine hjelper til.", "Hi! I'm Glimt. Shall I show you your day? My friends will help.", "Vis meg", host)
    if (w != null) {
        val now = w.now?.let { "$it°" } ?: ""
        out += Guide35("vaer", "Hei, det er $wn! ${cap35(w.cond)}, $now nå og ${w.rainSoon}." + if (wet) " Jeg drypper litt, så ta med paraply!" else " Søylene viser nedbøren time for time.",
            "Hi, it's $wnEn! ${cap35(enCond35(w.cond))}, $now right now." + if (wet) " I'm dripping a bit, so bring an umbrella!" else " The bars show rain hour by hour.", "Takk, $wn", wch)
        if (!wet && w.sunset != null) out += Guide35("vaer", "Sky her igjen: sola går ned ${w.sunset}. Nå tar Glimt over!", "Sky again: the sun sets at ${w.sunset}. Back to Glimt!", "Neste", "sky")
    } else out += Guide35("vaer", "Jeg har ikke fått været ennå.", "I haven't got the weather yet.", "Neste", host)
    val n = b.next
    out += Guide35("kal",
        "Uhu, Ugle her med kalenderen. " + if (n != null) "${n.title} ${if (n.date == today) "i dag" else "i morgen"}" + (n.start?.let { " kl. $it" } ?: "") + ". Trykk på en avtale for å åpne Kalender." else "Kalenderen din er helt fri.",
        "Hoo, Owl here with your calendar. " + if (n != null) "${n.title} ${if (n.date == today) "today" else "tomorrow"}" + (n.start?.let { " at $it" } ?: "") + ". Tap an event to open Calendar." else "Your calendar is completely free.",
        "Neste", "ugle")
    briefTrials35(b).firstOrNull()?.takeIf { it.daysLeft <= 7 }?.let { t ->
        val whenNo = when (t.daysLeft) { 0 -> "i dag"; 1 -> "i morgen"; else -> "om ${t.daysLeft} dager" }
        val whenEn = when (t.daysLeft) { 0 -> "today"; 1 -> "tomorrow"; else -> "in ${t.daysLeft} days" }
        val price = t.priceLabel?.let { Regex("\\d+").find(it)?.value }
        out += Guide35("abo", "Nøff! Gris her. Prøveperioden på ${t.service} slutter $whenNo. Husk å avslutte den før ${t.endsLabel}" + (price?.let { ", ellers koster den $it kroner i måneden." } ?: "."),
            "Oink! Piggy here. Your ${t.service} trial ends $whenEn. Remember to cancel it" + (price?.let { ", or it will cost $it kroner a month." } ?: "."), "Takk, Gris", "gris")
    }
    out += Guide35("nyh", if (b.news.isNotEmpty()) "Glimt igjen! Her er de ${n35no(minOf(b.news.size, 7))} viktigste nyhetene. Trykk for å lese hele." else "Glimt igjen! Ingen nyheter akkurat nå.",
        "Glimt again! Here are the top stories. Tap to read more.", "Neste", host)
    out += Guide35(null, "Det var alt for nå. Trykk på meg når du vil ha en ny runde.", "That's all for now. Tap me whenever you want another round.", "Takk, Glimt", host)
    return out
}

private fun enCond35(c: String) = when (c.lowercase()) { "klart" -> "clear"; "lettskyet" -> "partly cloudy"; "skyet" -> "cloudy"; "regn" -> "rain"; "snø" -> "snow"; else -> c }

/* ---------------- Tilstand ---------------- */

class P35State {
    var set by mutableStateOf(GlimtSet35())
    var setLoaded by mutableStateOf(false)
    internal var setFor: String? = null
    /** Innstillinger → Glimt i fullskjerm, og ⚙-arket i briefen. */
    var glimtOpen by mutableStateOf(false)
    var cfgSheet by mutableStateOf(false)
    /** Hvem som snakker nå (figur-id), og stemmen. */
    var speaking by mutableStateOf<String?>(null)
    var ttsErr by mutableStateOf<String?>(null)
    var keyEdit by mutableStateOf<Map<String, String>>(emptyMap())
    var keyBusy by mutableStateOf<String?>(null)
    var trialsDone by mutableStateOf<Set<String>>(emptySet())
    /** Antall steg i guide-runden (brukes av tourNext35). */
    var tourLen by mutableIntStateOf(0)
    internal var player: MediaPlayer? = null
    internal var tts: TextToSpeech? = null
    internal var ttsReady = false
    internal var sayJob: Job? = null
    internal var sayId = 0
    internal var focus: AudioManager.OnAudioFocusChangeListener? = null
}

/* ---------------- Henting og lagring ---------------- */

private fun AppViewModel.setKey35() = "glimt35_" + (account?.id ?: "")

fun AppViewModel.loadGlimt35(force: Boolean = false) {
    val s = p35
    val acct = account?.id
    if (!force && s.setFor == acct && s.setLoaded) return
    if (s.setFor != acct) {
        s.set = prefs.str(setKey35(), "").takeIf { it.isNotBlank() }?.let { runCatching { parseGlimtSet35(it) }.getOrNull() } ?: GlimtSet35(guide = tourAuto34(), notify = briefNotify34())
        s.setFor = acct
    }
    launch35 {
        val raw = runCatching { api35 { hlGet("/glimt/settings", timeout = 8_000) } }.getOrNull()
            ?: runCatching { api35 { hlGet("/brief/settings", timeout = 8_000) } }.getOrNull()
        raw?.let { r -> runCatching { parseGlimtSet35(r, s.set) }.getOrNull()?.let { s.set = it } }
        s.setLoaded = true
        storeGlimt35()
    }
}

private fun AppViewModel.storeGlimt35() {
    val v = p35.set
    prefs.set(setKey35(), v.toJson().toString())
    prefs.set(tourAutoKey34(), v.guide)
    prefs.set(briefNotifyKey34(), v.notify)
    Glimt35Prefs.save(appCtx35, v)
}

/** Endrer innstillingene med en gang (⚙ i briefen og Innstillinger → Glimt er samme data) og sender endringen (delvis) til serveren. */
fun AppViewModel.setGlimt35(patch: JSONObject, f: (GlimtSet35) -> GlimtSet35) {
    val s = p35
    val before = s.set
    s.set = f(before)
    Haptics.select()
    storeGlimt35()
    if (before.char != s.set.char) runCatching { no.kristo.finanshub.widget.Brief34Store.redrawAsync(appCtx35) }
    if (before.briefs != s.set.briefs) loadBrief34(force = true)
    launch35 {
        val ok = runCatching { api35 { hlPut("/glimt/settings", patch) } }.getOrNull()
        if (ok != null) runCatching { parseGlimtSet35(ok, s.set) }.getOrNull()?.let { s.set = it.copy(char = s.set.char) }
        else runCatching { api35 { hlPut("/brief/settings", patch) } }
    }
}

fun AppViewModel.setChar35(id: String) {
    val c = Fig35.norm(id)
    setGlimt35(JSONObject().put("char", c)) { it.copy(char = c) }
    say35(if (c == "gris") "Nøff! Nå er jeg din Glimt." else "Hei! Nå er jeg din Glimt.", c, force = true)
}

fun AppViewModel.setBriefSlot35(kind: String, on: Boolean? = null, at: String? = null) {
    val cur = p35.set.briefs[kind] ?: BRIEFS35_DEFAULT.getValue(kind)
    val nx = GlimtBrief35(on ?: cur.on, at ?: cur.at)
    setGlimt35(JSONObject().put("briefs", JSONObject().put(kind, JSONObject().put("on", nx.on).put("at", nx.at)))) { it.copy(briefs = LinkedHashMap(it.briefs).apply { put(kind, nx) }) }
}

fun AppViewModel.setTts35(engine: String? = null, voice: String? = null, rate: String? = null, lang: String? = null) {
    val t = JSONObject()
    engine?.let { t.put("engine", it) }; voice?.let { t.put("voice", it) }; rate?.let { t.put("rate", it) }; lang?.let { t.put("lang", it) }
    setGlimt35(JSONObject().put("tts", t)) { it.copy(engine = engine ?: it.engine, voice = voice ?: it.voice, rate = rate ?: it.rate, lang = lang ?: it.lang) }
}

/** Nøkkel for stemmemotoren (bare admin): PUT /api/ai/keys/openai|elevenlabs|azure. Azure: «nøkkel@region». */
fun AppViewModel.saveTtsKey35(engine: String, value: String) {
    val v = value.trim()
    if (v.isEmpty() || p35.keyBusy != null) return
    p35.keyBusy = engine
    launch35 {
        try {
            val body = if (engine == "azure" && v.contains('@')) JSONObject().put("key", v.substringBefore('@')).put("region", v.substringAfter('@')) else JSONObject().put("key", v)
            api35 { hlPut("/ai/keys/$engine", body) }
            p35.keyEdit = p35.keyEdit - engine
            flash("Nøkkelen er lagret på serveren")
            Haptics.success()
            loadGlimt35(force = true)
        } catch (e: ApiException) { flash("Kunne ikke lagre nøkkelen: ${e.message}"); Haptics.error() }
        finally { p35.keyBusy = null }
    }
}

fun AppViewModel.openGlimt35() { Haptics.tap(); p35.glimtOpen = true; loadGlimt35() }
fun AppViewModel.closeGlimt35() { Haptics.back(); p35.glimtOpen = false; stopSay35() }

/** finanshub://settings/glimt og finanshub://settings/kalendere (fra Kalender-appen). */
fun AppViewModel.settingsLink35(path: String) {
    openPaperPage("set")
    when (path.lowercase().substringBefore('/')) {
        "glimt", "brief" -> openGlimt35()
        "kalendere", "kalender", "kal", "calendars" -> openKalSettings26(null)
        "ai" -> openAiCtl34("ov")
        "" -> settingsPage = null
        else -> settingsPage = path
    }
}

/* ---------------- Opplesning ---------------- */

/** Klang per figur for telefonens stemme (fasit: CHV): [pitch, tempo]. */
private val CHV35 = mapOf("glimt" to (1f to 1f), "natt" to (.92f to .95f), "sky" to (1.12f to 1.02f), "drape" to (1.25f to 1.06f), "ugle" to (.8f to .94f), "gris" to (1.08f to 1.04f), "stjerne" to (1.15f to 1.05f))
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
    val c = URL(base.trimEnd('/') + "/api/tts").openConnection() as HttpURLConnection
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

/* ---------------- Guide-runden ---------------- */

fun AppViewModel.tourNext35() {
    val s = p34
    Haptics.select()
    s.tour = if (s.tour >= p35.tourLen) 99 else s.tour + 1
    s.tourSeq++
}

fun AppViewModel.tourSkip35() { Haptics.select(); stopSay35(); p34.tour = 99; p34.tourSeq++ }

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
    fun get(u: String): String = (URL(u).openConnection() as HttpURLConnection).run {
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

/* ---------------- Bursdager: velg flere Google-kalendere ---------------- */

/** g.cals i fasiten: flere kalendere (calendarIds), calendarId = den første (for eldre server og der nye bursdager skrives). */
fun AppViewModel.toggleGoogleCal35(id: String) {
    val s = bd24
    val cur = s.google.calendarIds.ifEmpty { listOfNotNull(s.google.calendarId) }
    val nx = if (id in cur) cur - id else cur + id
    val list = nx.ifEmpty { cur }
    s.google = s.google.copy(calendarIds = list, calendarId = list.firstOrNull() ?: s.google.calendarId)
    Haptics.select()
    launch35 {
        runCatching {
            api35 { hlPut("/birthdays/google", JSONObject().put("calendarId", list.firstOrNull() ?: JSONObject.NULL).put("calendarIds", JSONArray(list))
                .put("writeNew", s.google.writeNew).put("contacts", s.google.contacts)) }
        }
    }
}

/** calendarIds / cals fra GET /api/birthdays → google. */
fun calIds35(g: JSONObject): List<String> = (g.optJSONArray("calendarIds") ?: g.optJSONArray("cals"))?.let { a -> (0 until a.length()).mapNotNull { a.optString(it).takeIf { s -> s.isNotBlank() } } } ?: emptyList()
