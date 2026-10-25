package no.kristo.finanshub

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId

/*
 * Prompt 52 (AND52B): Ruter med en gang, Vær nå-bakgrunn etter værtype × tid, kalenderkontekst i Glimt-søket,
 * brief-kortene per innlogget bruker, Glimt-figur per bruker (Blekksprut) og butikklogoer i Finans → Søk.
 * API: $S/SERVER52-API.md (SRV52). UI: ui/Ui52B.kt og ui/Blekk52.kt.
 */

class P52BState {
    /* Ruter */
    /** Sist avgangene for Mine stopp ble hentet (ms). Ny henting ved åpning bare når dataene er eldre enn 30 s. */
    internal var ruterAt = 0L
    internal var ruterSeedFor: String? = null
    internal var prefetchBusy = false

    /* Vær nå */
    internal var vaerKey: String? = null

    /* Kalenderkontekst (POST /api/glimt/quickparse52) */
    var qpText by mutableStateOf("")
    var qpBusy by mutableStateOf(false)
    var qpRes by mutableStateOf<Qp52?>(null)
    internal val qpCache = HashMap<String, Qp52>()
    internal var qpJob: Job? = null

    /* Brief-kortene (GET /api/brief52) */
    var brief by mutableStateOf<Brief52?>(null)
    var briefBusy by mutableStateOf(false)
    var briefFor: String? = null
    var starting by mutableStateOf<Set<String>>(emptySet())

    /* Glimt-figur per bruker */
    internal var charFor: String? = null
    var charAdmin by mutableStateOf<List<CharUser52>?>(null)
    var charAdminOpen by mutableStateOf(false)

    /* Butikklogoer (POST /finans/api/logos52/batch) */
    var logos by mutableStateOf<Map<String, Logo52>>(emptyMap())
    internal val logoAsked = HashSet<String>()
}

/* ======================= Ruter: hurtigbuffer på disk ======================= */

/**
 * Avgangene per stopp (rå JSON fra /api/ruter/departures + tidspunkt) og Mine stopp, per konto.
 * Ligger i SharedPreferences (samme prosess som widgetene), så Ruter-widgetene bruker samme buffer.
 */
object Ruter52Cache {
    private const val FILE = "ruter52_cache"
    private val mem = HashMap<String, Pair<StopDeps, Long>>()
    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun putDeps(ctx: Context, acct: String, id: String, raw: String, sd: StopDeps, at: Long = System.currentTimeMillis()) {
        synchronized(mem) { mem["$acct|$id"] = sd to at }
        runCatching { sp(ctx).edit().putString("d|$acct|$id", JSONObject().put("raw", raw).put("at", at).toString()).apply() }
    }

    /** Bufrede avganger for stoppet, med avganger som har gått filtrert bort og minutter regnet på nytt fra klokka. */
    fun deps(ctx: Context, acct: String, id: String, now: Long = System.currentTimeMillis()): Pair<StopDeps, Long>? {
        val hit = synchronized(mem) { mem["$acct|$id"] } ?: runCatching {
            val o = JSONObject(sp(ctx).getString("d|$acct|$id", null) ?: return null)
            val sd = parseStopDeps(o.getString("raw"))
            (sd to o.optLong("at")).also { v -> synchronized(mem) { mem["$acct|$id"] = v } }
        }.getOrNull() ?: return null
        return fresh52(hit.first, now) to hit.second
    }

    fun putStops(ctx: Context, acct: String, raw: String) { runCatching { sp(ctx).edit().putString("s|$acct", raw).apply() } }
    fun stops(ctx: Context, acct: String): List<StopRef>? = runCatching { sp(ctx).getString("s|$acct", null)?.let { parseStopList(it) } }.getOrNull()
}

/** Avgangstid i ms: ISO med sone, lokal ISO eller «HH:MM» i dag. */
internal fun depEpoch52(t: String?): Long? {
    if (t.isNullOrBlank()) return null
    runCatching { return OffsetDateTime.parse(t).toInstant().toEpochMilli() }
    runCatching { return Instant.parse(t).toEpochMilli() }
    runCatching { return LocalDateTime.parse(t.take(19)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }
    val hm = Regex("""^(\d{1,2}):(\d{2})""").find(t.trim()) ?: return null
    val lt = runCatching { LocalTime.of(hm.groupValues[1].toInt(), hm.groupValues[2].toInt()) }.getOrNull() ?: return null
    var dt = LocalDate.now().atTime(lt)
    if (dt.isBefore(LocalDateTime.now().minusHours(1))) dt = dt.plusDays(1)
    return dt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
}

/** Avganger mer enn 1 min tilbake tas bort; minuttene regnes på nytt fra klokka (fasit avPrefetch/avFetch). */
internal fun fresh52(sd: StopDeps, now: Long = System.currentTimeMillis()): StopDeps =
    sd.copy(departures = sd.departures.mapNotNull { d ->
        val t = depEpoch52(d.expected ?: d.aimed) ?: return@mapNotNull d
        if (t < now - 60_000L) null else d.copy(minutes = ((t - now) / 60_000L).toInt().coerceAtLeast(0))
    })

private fun AppViewModel.acct52(): String = account?.id ?: ""

/** Bufferen inn i Mine stopp og Hjem-kortet før noe nettverkskall (første frame har avgangene). */
fun AppViewModel.seedRuter52() {
    val ctx = appCtx52b
    val a = acct52()
    val now = System.currentTimeMillis()
    val stops = myStops.ifEmpty { Ruter52Cache.stops(ctx, a) ?: emptyList() }
    val out = HashMap<String, StopDeps>()
    for (st in stops) {
        val cur = stopDeps[st.id]
        if (cur != null) { out[st.id] = fresh52(cur, now); continue }
        Ruter52Cache.deps(ctx, a, st.id, now)?.let { (sd, _) -> out[st.id] = sd.copy(stop = sd.stop.copy(id = st.id, name = st.name.ifBlank { sd.stop.name })) }
    }
    setRuter52(if (myStops.isEmpty() && stops.isNotEmpty()) stops else null, if (out.isNotEmpty()) stopDeps + out else null)
    seedHome52()
}

/** Hjem-kortet/flisen (b27): stoppene og avgangene fra bufferen når de ikke er hentet ennå. */
fun AppViewModel.seedHome52() {
    val s = b27
    val ctx = appCtx52b
    val a = acct52()
    if (s.homeStops == null) Ruter52Cache.stops(ctx, a)?.takeIf { it.isNotEmpty() }?.let { s.homeStops = it }
    val shown = homeShown27()
    if (shown.isEmpty()) return
    val out = s.homeDeps.toMutableMap()
    var changed = false
    for (st in shown) {
        val cur = out[st.id]
        if (cur != null) { out[st.id] = fresh52(cur); changed = true; continue }
        Ruter52Cache.deps(ctx, a, st.id)?.let { (sd, _) -> out[st.id] = sd.copy(stop = sd.stop.copy(id = st.id, name = st.name.ifBlank { sd.stop.name })); changed = true }
    }
    if (changed) s.homeDeps = out
}

/** Kalles etter hvert vellykket svar fra /api/ruter/departures (Avganger, Hjem-kortet og forhåndshentingen). */
fun AppViewModel.cacheDeps52(id: String, raw: String, sd: StopDeps) {
    Ruter52Cache.putDeps(appCtx52b, acct52(), id, raw, sd)
}

fun AppViewModel.cacheStops52(raw: String) = Ruter52Cache.putStops(appCtx52b, acct52(), raw)

internal fun AppViewModel.ruterFresh52(): Boolean = System.currentTimeMillis() - p52b.ruterAt < 30_000L && stopDeps.isNotEmpty()

/**
 * Forhåndshenting: ved oppstart, hvert 60. s i forgrunnen og ved retur fra bakgrunn.
 * Alle lagrede stopp (Mine stopp + Hjem-stoppene). Feil: gamle data beholdes.
 */
suspend fun AppViewModel.prefetchRuter52() {
    val s = p52b
    if (s.prefetchBusy || !loggedIn) return
    s.prefetchBusy = true
    try {
        val a = acct52()
        val rawStops = runCatching { api52b { hlGet("/me/stops", timeout = 8_000) } }.getOrNull()
        val mine = rawStops?.let { r -> runCatching { parseStopList(r) }.getOrNull() }
        if (rawStops != null && mine != null) { cacheStops52(rawStops); setRuter52(mine, null); if (b27.homeStops == null || b27.homeStops != mine) b27.homeStops = mine }
        val all = (mine ?: myStops).ifEmpty { Ruter52Cache.stops(appCtx52b, a) ?: emptyList() }
        val home = homeShown27()
        val ids = (all.map { it.id } + home.map { it.id }).distinct()
        if (ids.isEmpty()) return
        val got = HashMap<String, StopDeps>()
        for (id in ids) {
            val name = all.firstOrNull { it.id == id }?.name ?: home.firstOrNull { it.id == id }?.name ?: ""
            val raw = runCatching { api52b { hlGet("/ruter/departures?stop=" + URLEncoder.encode(id, "UTF-8") + "&n=20", timeout = 12_000) } }.getOrNull() ?: continue
            val sd = runCatching { parseStopDeps(raw) }.getOrNull() ?: continue
            val fixed = sd.copy(stop = sd.stop.copy(id = id, name = name.ifBlank { sd.stop.name }))
            cacheDeps52(id, raw, fixed)
            got[id] = fixed
        }
        if (got.isEmpty()) return
        s.ruterAt = System.currentTimeMillis()
        setRuter52(null, stopDeps + got.filterKeys { k -> all.any { it.id == k } })
        val hs = home.map { it.id }.toSet()
        if (hs.isNotEmpty()) b27.homeDeps = b27.homeDeps + got.filterKeys { it in hs }
        writeWidget52(home.ifEmpty { all.take(1) }, got)
    } finally { s.prefetchBusy = false }
}

/** Ruter-widgetene får de nye tidene fra samme henting (bare når en widget er lagt til). */
private suspend fun AppViewModel.writeWidget52(shown: List<StopRef>, got: Map<String, StopDeps>) {
    val ctx = appCtx52b
    if (!runCatching { no.kristo.finanshub.widget.Ruter27Widgets.anyPlaced(ctx) }.getOrDefault(false)) return
    val stops = shown.take(3).mapNotNull { st ->
        val sd = got[st.id] ?: return@mapNotNull null
        no.kristo.finanshub.widget.WStop27(st.id, st.name.ifBlank { sd.stop.name }, sd.departures.filter { !it.cancelled }.map { d ->
            no.kristo.finanshub.widget.WDep27(d.line, d.to, d.color ?: ruterModeColor(d.mode, d.line), d.textColor ?: 0xFFFFFFFF, depEpoch52(d.expected ?: d.aimed), d.minutes, d.realtime)
        })
    }
    if (stops.isEmpty()) return
    val prev = runCatching { no.kristo.finanshub.widget.Ruter27Store.current(ctx) }.getOrNull()
    no.kristo.finanshub.widget.Ruter27Store.save(ctx, no.kristo.finanshub.widget.WRuter27(stops, prev?.deviations ?: emptyList(), System.currentTimeMillis()), account?.id)
    runCatching { no.kristo.finanshub.widget.Ruter27Widgets.redraw(ctx) }
}

/* ======================= Vær nå: bilde etter værtype × tid på døgnet ======================= */

/** Frie Wikimedia Commons-bilder per værtype og tidsrom (samme liste som fasiten, BGSET i Homelab.dc.html). */
val VAER52: Map<String, List<String>> = mapOf(
    "klart_morgen" to listOf("Sunrise_over_the_sea.jpg", "Golden_hour.jpg"),
    "klart_dag" to listOf("Blue_sky_with_sun.jpg", "Sky_with_clouds.jpg", "Cumulus_clouds_in_fair_weather.jpeg"),
    "klart_kveld" to listOf("Sunset_2007-1.jpg", "Golden_hour.jpg"),
    "klart_natt" to listOf("Starry_night_sky.jpg", "Milky_Way_Night_Sky_Black_Rock_Desert_Nevada.jpg", "Aurora_borealis_above_Lyngenfjorden,_2012_March.jpg", "Night_sky.jpg"),
    "sky_morgen" to listOf("Morning_fog.jpg", "Sun_and_clouds.jpg"),
    "sky_dag" to listOf("Cloudy_Sky_Background.jpg", "Sun_and_clouds.jpg", "Clouds_over_the_Atlantic_Ocean.jpg"),
    "sky_kveld" to listOf("Sunset_2007-1.jpg", "Cloudy_Sky_Background.jpg"),
    "sky_natt" to listOf("Night_sky.jpg", "Winter_night.jpg"),
    "regn_morgen" to listOf("Rain_on_window.jpg", "Heavy_rain.jpg"),
    "regn_dag" to listOf("Heavy_rain.jpg", "Rain_on_window.jpg", "Rain_drops_on_window_02_ies.jpg"),
    "regn_kveld" to listOf("Rain_drops_on_window_02_ies.jpg", "Rain_on_window.jpg"),
    "regn_natt" to listOf("Rain_drops_on_window_02_ies.jpg", "Rain_on_window.jpg"),
    "sno_morgen" to listOf("Snowy_landscape.jpg", "Snow_covered_trees.jpg"),
    "sno_dag" to listOf("Snowy_forest.jpg", "Snow_covered_trees.jpg", "Winter_in_Norway.jpg", "Snowfall.jpg"),
    "sno_kveld" to listOf("Snow_falling.jpg", "Winter_night.jpg"),
    "sno_natt" to listOf("Winter_night.jpg", "Snow_falling.jpg"),
    "torden_dag" to listOf("Thunderstorm.jpg", "Lightning_strike.jpg", "Lightning3.jpg"),
    "torden_natt" to listOf("Lightning3.jpg", "Lightning_strike.jpg", "Thunderstorm.jpg"),
    "take_morgen" to listOf("Morning_fog.jpg", "Foggy_forest.jpg"),
    "take_dag" to listOf("Foggy_forest.jpg", "Fog.jpg", "Morning_fog.jpg"),
    "take_natt" to listOf("Fog.jpg", "Foggy_forest.jpg"),
)

/** WMO-kode → værtype (klart, sky, regn, snø, torden, tåke). */
fun vaerType52(c: Int?): String = when {
    c == null -> "sky"
    c >= 95 -> "torden"
    c in 71..77 || c == 85 || c == 86 -> "sno"
    c >= 51 -> "regn"
    c == 45 || c == 48 -> "take"
    c <= 1 -> "klart"
    else -> "sky"
}

/** Morgen 5–9, dag 9–17, kveld 17–21, ellers natt. */
fun vaerTid52(h: Int = LocalTime.now().hour): String = when (h) { in 5..8 -> "morgen"; in 9..16 -> "dag"; in 17..20 -> "kveld"; else -> "natt" }

/** Nøkkelen som finnes: type_tid, så nabotidsrommet, så type_dag/type_natt, ellers sky_dag («lånt fra»). */
fun AppViewModel.vaerKey52(): String {
    val ty = vaerType52(weatherFull?.current?.code)
    val td = vaerTid52()
    val alt = when (td) { "morgen" -> "dag"; "kveld" -> "natt"; "natt" -> "kveld"; else -> "morgen" }
    return listOf("${ty}_$td", "${ty}_$alt", "${ty}_dag", "${ty}_natt").firstOrNull { it in VAER52 } ?: "sky_dag"
}

/** Bildet for nå (time % antall i settet, så resten). Feiler alle, brukes serverens bakgrunn som før. */
internal suspend fun AppViewModel.vaer52(): Pair<Bitmap, String?>? {
    val key = vaerKey52()
    val l = VAER52[key] ?: return null
    val i = LocalTime.now().hour % l.size
    val order = l.drop(i) + l.take(i)
    for (f in order) for (w in listOf(2000, 1280)) {
        val b = runCatching { bgImage41(osloUrl41(f, w)) }.getOrNull() ?: continue
        p52b.vaerKey = key
        return b to "Vær nå · Wikimedia Commons"
    }
    return null
}

/* ======================= Kalenderkontekst i Glimt-søket ======================= */

/** Tolket beskjed: type = kalender | huske | spørsmål | annet. source = ai | rule. */
data class Qp52(
    val type: String, val title: String, val date: LocalDate?, val start: String?, val end: String?, val location: String,
    val people: List<String>, val source: String, val dateLabel: String?, val timeLabel: String?,
) {
    fun toQuick(): Quick29Parse = Quick29Parse(date != null, "", title, date, start, end, location, "kalender", true)
}

private fun JSONObject.s52(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

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

/** Læring: rettet navn/sted (bekreftelsesarket eller skjemaet) → brukerens ordforråd på serveren. */
fun AppViewModel.learnLex52(from: String, to: String, kind: String? = null) {
    val f = from.trim(); val t = to.trim()
    if (f.isEmpty() || t.isEmpty() || f.equals(t, ignoreCase = false)) return
    launch52b { runCatching { api52b { hlPost("/glimt/lex52", JSONObject().put("from", f).put("to", t).apply { kind?.let { put("kind", it) } }) } } }
}

/* ======================= Brief-kortene per innlogget bruker ======================= */

data class Card52(val id: String, val variant: String, val title: String, val data: JSONObject?, val error: String?)
data class Brief52(val name: String, val greeting: String, val dateLabel: String, val char: String?, val cards: List<Card52>, val admin: Boolean)

internal fun parseBrief52(raw: String): Brief52? = runCatching {
    val o = JSONObject(raw)
    val u = o.optJSONObject("user")
    val a = o.optJSONArray("cards") ?: JSONArray()
    Brief52(
        u?.s52("first") ?: u?.s52("name") ?: "", o.s52("greeting") ?: "", o.s52("date_label") ?: "", o.s52("glimt_char"),
        (0 until a.length()).mapNotNull { i ->
            val c = a.optJSONObject(i) ?: return@mapNotNull null
            Card52(c.s52("id") ?: return@mapNotNull null, c.s52("variant") ?: "", c.s52("title") ?: "", c.optJSONObject("data"), c.s52("error"))
        },
        u?.optBoolean("admin", false) == true,
    )
}.getOrNull()

/** Kortene for den som er logget inn (ingen velger). Eldre server (404): ingen kort, briefen ellers som før. */
fun AppViewModel.loadBrief52(force: Boolean = false) {
    val s = p52b
    val a = account?.id
    if (!force && s.briefFor == a && s.brief != null) return
    if (s.briefFor != a) { s.brief = null; s.briefFor = a }
    if (s.briefBusy) return
    s.briefBusy = true
    launch52b {
        try { runCatching { api52b { hlGet("/brief52", timeout = 10_000) } }.getOrNull()?.let(::parseBrief52)?.let { s.brief = it } }
        finally { s.briefBusy = false }
    }
}

fun AppViewModel.hasBriefTodo52(): Boolean = p52b.brief?.cards?.any { it.id == "todo" } == true

/** Homelab-kortet: Start (stoppet) eller omstart (unhealthy) via serverens trygge handling. Bare admin. */
fun AppViewModel.startService52(id: String) {
    val s = p52b
    if (id in s.starting) return
    s.starting = s.starting + id
    Haptics.tap()
    launch52b {
        try {
            api52b { hlPost("/brief52/homelab/" + URLEncoder.encode(id, "UTF-8") + "/start") }
            Haptics.success()
            flash("Starter tjenesten …")
            delay(2_500)
            loadBrief52(force = true)
        } catch (e: ApiException) {
            flash(if (e.status == 403) "Bare admin kan starte tjenester" else e.message ?: "Fikk ikke startet tjenesten")
        } catch (e: Exception) {
            flash("Fikk ikke kontakt med serveren")
        } finally { s.starting = s.starting - id }
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

/* ======================= Butikklogoer (bare lokal logo-cache på serveren) ======================= */

data class Logo52(val url: String?, val initial: String, val color: Long?)

private fun hex52(s: String?): Long? = s?.trim()?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { 0xFF000000 or it }

/** Henter logoene for navnene som ikke er spurt om ennå (maks 200 per kall). Ingen eksterne oppslag. */
fun AppViewModel.logos52(names: List<String>) {
    val s = p52b
    val want = names.map { it.trim() }.filter { it.isNotEmpty() && it !in s.logoAsked }.distinct().take(200)
    if (want.isEmpty()) return
    s.logoAsked.addAll(want)
    launch52b {
        val raw = runCatching { api52b { request("POST", "/logos52/batch", JSONObject().put("names", JSONArray(want)), timeout = 6_000, read = 10_000) } }.getOrNull() ?: return@launch52b
        val items = runCatching { JSONObject(raw).optJSONObject("items") }.getOrNull() ?: return@launch52b
        val out = HashMap<String, Logo52>()
        items.keys().forEach { k ->
            val o = items.optJSONObject(k) ?: return@forEach
            out[k] = Logo52(o.s52("url"), o.s52("initial") ?: k.take(1).uppercase(), hex52(o.s52("color")))
        }
        if (out.isNotEmpty()) s.logos = s.logos + out
    }
}
