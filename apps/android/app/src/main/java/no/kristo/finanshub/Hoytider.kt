package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import org.json.JSONObject

/* ======================= Julemodus ======================= */

/**
 * Julemodus (claude-code-glimt-jul.md): Auto (1. des–13. jan, Europe/Oslo) / Av / På med fase. Lagres lokalt (også for widgets i
 * samme prosess) og synkes til /api/glimt/settings {jul, julPhase, snow, julSound}. Figurbiblioteket leser [phase] selv.
 */
object Jul40 {
    var mode by mutableStateOf("auto")
    var manual by mutableStateOf("advent")
    var snow by mutableStateOf(true)
    var sound by mutableStateOf("av")
    /** Øker ved hver endring (Flow-erstatning: skjermene som leser den tegnes på nytt). */
    var tick by mutableIntStateOf(0)
    private var loaded = false

    val PHASES = listOf("advent" to "Advent", "jul" to "Jul", "nyttar" to "Nyttår", "vinter" to "Vinter")

    fun autoPhase(d: LocalDate = ZonedDateTime.now(ZoneId.of("Europe/Oslo")).toLocalDate()): String? = when {
        d.monthValue == 12 && d.dayOfMonth <= 23 -> "advent"
        d.monthValue == 12 && d.dayOfMonth <= 30 -> "jul"
        d.monthValue == 12 -> "nyttar"
        d.monthValue == 1 && d.dayOfMonth == 1 -> "nyttar"
        d.monthValue == 1 && d.dayOfMonth <= 13 -> "vinter"
        else -> null
    }

    /** Fasen som gjelder nå, eller null (av). */
    val phase: String? get() = when (mode) { "av" -> null; "pa" -> manual; else -> autoPhase() }

    fun ensure(ctx: Context) {
        if (loaded) return
        loaded = true
        val sp = ctx.applicationContext.getSharedPreferences("jul40", Context.MODE_PRIVATE)
        mode = sp.getString("glimt_jul", "auto") ?: "auto"
        manual = sp.getString("glimt_jul_p", "advent") ?: "advent"
        snow = sp.getBoolean("snow", true)
        sound = sp.getString("julSound", "av") ?: "av"
    }

    fun store(ctx: Context) {
        ctx.applicationContext.getSharedPreferences("jul40", Context.MODE_PRIVATE).edit()
            .putString("glimt_jul", mode).putString("glimt_jul_p", manual).putBoolean("snow", snow).putString("julSound", sound).apply()
        tick++
    }

    fun statusText(): String {
        val ph = phase
        val name = PHASES.firstOrNull { it.first == ph }?.second
        return when (mode) {
            "av" -> "Av hele året"
            "pa" -> "På · ${name ?: "Advent"}"
            else -> if (ph != null) "På nå · slås av 13. januar" else "Slås på 1. desember"
        }
    }
}

fun AppViewModel.loadJul40() {
    Jul40.ensure(appCtx40)
    val acct = account?.id
    if (p40.julLoadedFor == acct) return
    p40.julLoadedFor = acct
    launch40 {
        val raw = runCatching { api40 { hlGet("/glimt/settings", timeout = 8_000) } }.getOrNull() ?: return@launch40
        runCatching { applyJul40(JSONObject(raw)) }
    }
}

/** Fra serveren (GET-svaret eller sanntid «glimt:settings»). */
fun AppViewModel.applyJul40(o: JSONObject) {
    val s = o.optJSONObject("settings") ?: o
    var ch = false
    s.s37("jul")?.takeIf { it in setOf("auto", "av", "pa") }?.let { if (it != Jul40.mode) { Jul40.mode = it; ch = true } }
    s.s37("julPhase")?.takeIf { k -> Jul40.PHASES.any { it.first == k } }?.let { if (it != Jul40.manual) { Jul40.manual = it; ch = true } }
    if (s.has("snow")) s.optBoolean("snow").let { if (it != Jul40.snow) { Jul40.snow = it; ch = true } }
    s.s37("julSound")?.let { if (it != Jul40.sound) { Jul40.sound = it; ch = true } }
    if (ch) { Jul40.store(appCtx40); redrawWidgets40() }
    runCatching { Mai41.apply(s, appCtx40) } // Prompt 41: 17. mai (Høytider)
}

fun AppViewModel.setJul40(mode: String? = null, phase: String? = null, snow: Boolean? = null, sound: String? = null) {
    Jul40.ensure(appCtx40)
    mode?.let { Jul40.mode = it }
    phase?.let { Jul40.manual = it }
    snow?.let { Jul40.snow = it }
    sound?.let { Jul40.sound = it }
    Jul40.store(appCtx40)
    Haptics.select()
    redrawWidgets40()
    val patch = JSONObject().put("jul", Jul40.mode).put("julPhase", if (Jul40.mode == "pa") Jul40.manual else JSONObject.NULL).put("snow", Jul40.snow).put("julSound", Jul40.sound)
    launch40 { runCatching { api40 { hlPut("/glimt/settings", patch) } } }
}

/** Widgets på hjemskjermen tegnes på nytt (figuren med eller uten lue). */
fun AppViewModel.redrawWidgets40() {
    val app = appCtx40
    launch40 { runCatching { no.kristo.finanshub.widget.WidgetSync.redraw(app) } }
}

data class MaiItem41(val time: String, val title: String, val past: Boolean, val next: Boolean, val kind: String)

data class MaiData41(val dateLabel: String?, val greeting: String?, val program: List<MaiItem41>, val briefText: String?, val briefItems: List<String>)

/* ======================= 17. mai ======================= */

/**
 * Høytider → «17. mai» (claude-code-17-mai.md): auto (14.–17. mai i Norge) · av · pa (vis nå). Synkes med /api/glimt/settings mai17
 * (serveren sender også mai17Active). Figurene får sløyfe og norsk flagg som vaier (GlimtFigs35 → drawMai41). Ingen bunad.
 */
object Mai41 {
    var mode by mutableStateOf("auto")
    var serverActive by mutableStateOf<Boolean?>(null)
    private var loaded = false

    fun autoOn(d: LocalDate = java.time.ZonedDateTime.now(ZoneId.of("Europe/Oslo")).toLocalDate()): Boolean = d.monthValue == 5 && d.dayOfMonth in 14..17
    val on: Boolean get() = when (mode) { "av" -> false; "pa" -> true; else -> serverActive ?: autoOn() }

    fun ensure(ctx: Context) {
        if (loaded) return
        loaded = true
        mode = ctx.applicationContext.getSharedPreferences("p41", Context.MODE_PRIVATE).getString("mai17", "auto") ?: "auto"
    }

    fun apply(o: JSONObject, ctx: Context) {
        ensure(ctx)
        o.s37("mai17")?.takeIf { it in setOf("auto", "av", "pa") }?.let { if (it != mode) { mode = it; ctx.applicationContext.getSharedPreferences("p41", Context.MODE_PRIVATE).edit().putString("mai17", it).apply() } }
        if (o.has("mai17Active")) serverActive = o.optBoolean("mai17Active")
    }
}

fun AppViewModel.setMai41(m: String) {
    Mai41.ensure(appCtx40)
    Mai41.mode = m
    Mai41.serverActive = null
    prefs41().edit().putString("mai17", m).apply()
    Haptics.select()
    redrawWidgets40()
    launch41 { runCatching { api41 { hlPut("/glimt/settings", JSONObject().put("mai17", m)) } } }
}

/* ======================= 17. mai-Hjem ======================= */

/** Festdesignet på Hjem gjelder bare selve dagen (eller «Vis nå»). Bryteren nullstilles 18. mai. */
fun AppViewModel.maiHome41(): Boolean {
    Mai41.ensure(appCtx40)
    val d = java.time.ZonedDateTime.now(ZoneId.of("Europe/Oslo")).toLocalDate()
    val today = (d.monthValue == 5 && d.dayOfMonth == 17)
    return Mai41.mode != "av" && (today || Mai41.mode == "pa")
}

/** Bryterens verdi for i dag (lokalt speil; nullstilles neste dag). Kalles fra LaunchedEffect, ikke under tegning. */
fun AppViewModel.initMaiDesign41() {
    val sp = prefs41()
    val d = LocalDate.now().toString()
    if (sp.getString("mai_design_day", null) != d) { sp.edit().remove("mai_design_day").remove("mai_design").apply(); p41.maiDesign = true }
    else p41.maiDesign = sp.getBoolean("mai_design", true)
    loadMai41()
}

fun AppViewModel.setMaiDesign41(on: Boolean) {
    p41.maiDesign = on; Haptics.select()
    prefs41().edit().putBoolean("mai_design", on).putString("mai_design_day", LocalDate.now().toString()).apply()
    launch41 { runCatching { api41 { hlPut("/glimt/mai17/design", JSONObject().put("on", on)) } } }
}

/** GET /api/glimt/mai17 → dato, hilsen, program, brief og hurra-telleren. */
fun AppViewModel.loadMai41() {
    launch41 {
        val o = runCatching { JSONObject(api41 { hlGet("/glimt/mai17", timeout = 8_000) }) }.getOrNull() ?: return@launch41
        val prog = objs34(o.optJSONArray("program")).map { MaiItem41(it.s37("time") ?: "", it.s37("title") ?: "", it.optBoolean("past"), it.optBoolean("next"), it.s37("kind") ?: "city") }
        val b = o.optJSONObject("brief")
        p41.mai = MaiData41(o.s37("dateLabel"), o.s37("greeting"), prog, b?.s37("text"), objs34(b?.optJSONArray("items")).mapNotNull { it.s37("text") ?: it.s37("title") } +
            (b?.optJSONArray("items")?.let { a -> (0 until a.length()).mapNotNull { a.opt(it) as? String } } ?: emptyList()))
        o.optJSONObject("hurra")?.let { h -> p41.hurra = h.optInt("count", p41.hurra) }
        if (o.has("design")) p41.maiDesign = o.optBoolean("design", p41.maiDesign)
    }
}

/** «Hipp hipp hurra!»: konfetti + haptikk og «Hipp hipp hurra fra Sebastian!» til familien (POST /api/glimt/mai17/hurra). */
fun AppViewModel.hurra41() {
    val s = p41
    s.hurra++; s.confetti = System.currentTimeMillis()
    Haptics.success()
    launch41 {
        runCatching { JSONObject(api41 { hlPost("/glimt/mai17/hurra") }) }.getOrNull()?.let { s.hurra = it.optInt("count", s.hurra) }
    }
}
