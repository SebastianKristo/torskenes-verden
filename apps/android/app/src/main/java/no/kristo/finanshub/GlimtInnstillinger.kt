package no.kristo.finanshub

import android.content.Context
import android.media.AudioManager
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.LocalTime
import java.time.ZoneId
import kotlinx.coroutines.Job
import no.kristo.finanshub.ui.Fig35
import org.json.JSONObject

internal val OSLO35: ZoneId = ZoneId.of("Europe/Oslo")

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

internal fun s35(o: JSONObject?, vararg k: String): String? = s34(o, *k)

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

internal fun mins35(at: String): Int = at.split(':').let { (it.getOrNull(0)?.trim()?.toIntOrNull() ?: 0) * 60 + (it.getOrNull(1)?.trim()?.toIntOrNull() ?: 0) }

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
    say35(when (c) { "gris" -> "Nøff! Nå er jeg din Glimt."; "blekk" -> "Hei! Seks armer klare. Nå er jeg din Glimt."; else -> "Hei! Nå er jeg din Glimt." }, c, force = true)
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
        // Prompt 67: lenkene fra push (faste-oppgaver, glimt-husker, kvalitet[/run/<id>|/uke/<uke>]) → sidene under Glimt (GlimtInnstillingerSider.kt).
        else -> settingsPage = alias67(path) ?: path
    }
}
