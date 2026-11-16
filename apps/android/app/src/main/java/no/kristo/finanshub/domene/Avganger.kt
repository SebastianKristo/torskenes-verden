@file:JvmName("DomeneAvganger")

package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

/*
 * Avganger (Ruter): kode som lå i blandingsfilene (P41.kt, P45b.kt, P52B.kt, Models.kt, Models.kt, Mod27B.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

data class Leg41(val mode: String, val line: String?, val from: String?, val to: String?, val dep: String?, val arr: String?, val delayMin: Int, val walkMin: Int?, val meters: Int?, val label: String? = null)

data class TripOpt41(val legs: List<Leg41>, val dep: String?, val arr: String?, val minutes: Int?, val preferred: Boolean, val badges: List<String>)

data class TripAlert41(val text: String, val walkMin: Int?, val km: Double?, val catches: String?, val homeAt: String?, val body: String? = null)

data class Trip41(val dir: String, val from: String, val to: String, val options: List<TripOpt41>, val alert: TripAlert41?, val updatedAt: String?)

data class Journey41(val leftAt: String, val expiresAt: String?)

/* ======================= Min reise ======================= */

private fun leg41(o: JSONObject): Leg41 = Leg41(
    o.s37("mode") ?: "foot", o.s37("line"), o.s37("from"), o.s37("to"), o.s37("dep") ?: o.s37("expected") ?: o.s37("aimed"), o.s37("arr"),
    o.optInt("delayMin", 0), if (o.has("walkMin")) o.optInt("walkMin") else null, if (o.has("meters")) o.optInt("meters") else null, o.s37("label"),
)

internal fun parseTrip41(raw: String): Trip41? {
    val o = JSONObject(raw)
    val opts = objs34(o.optJSONArray("options")).map { x ->
        TripOpt41(objs34(x.optJSONArray("legs")).map(::leg41), x.s37("dep"), x.s37("arr"), if (x.has("minutes")) x.optInt("minutes") else null,
            x.optBoolean("preferred", false), x.optJSONArray("badges")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } } ?: emptyList())
    }
    val al = o.optJSONObject("alert")?.let { a ->
        val w = a.optJSONObject("walk")
        TripAlert41(a.s37("text") ?: "", w?.let { if (it.has("minutes")) it.optInt("minutes") else null }, w?.optDouble("km")?.takeIf { !it.isNaN() }, w?.s37("catches"), a.s37("homeAt"), a.s37("body"))
    }
    return Trip41(o.s37("dir") ?: "toHome", o.s37("from") ?: "", o.s37("to") ?: "", opts, al, o.s37("updatedAt"))
}

fun AppViewModel.loadTrip41(force: Boolean = false) {
    val s = p41
    if (!force && System.currentTimeMillis() - s.tripAt < 25_000L && s.trip != null) return
    s.tripAt = System.currentTimeMillis()
    launch41 {
        s.tripBusy = true
        try {
            val raw = api41 { hlGet("/ruter/my-trip?dir=" + s.tripDir, timeout = 12_000) }
            s.trip = parseTrip41(raw); s.tripMissing = false
        } catch (e: ApiException) { if (e.status == 404 || e.status == 405 || e.status == 403) { s.tripMissing = true; s.trip = null } } catch (_: Exception) { } finally { s.tripBusy = false }
    }
}

fun AppViewModel.flipTrip41() {
    val s = p41
    val cur = s.trip?.dir ?: if (LocalTime.now().hour < 12) "toSchool" else "toHome"
    s.tripDir = if (cur == "toHome") "toSchool" else "toHome"
    Haptics.select()
    loadTrip41(force = true)
}

/** Aktiv «forlot skolen»-hendelse (utløper hjemme / etter 90 min). Innstillingen homeCard: over | instead | off. */
fun AppViewModel.loadJourney41() {
    val s = p41
    launch41 {
        val raw = try { api41 { hlGet("/ruter/journey", timeout = 8_000) } } catch (_: Exception) { null } ?: run { s.journey = null; return@launch41 }
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch41
        if (o.has("journey") && o.isNull("journey")) { s.journey = null; return@launch41 }
        val j = o.optJSONObject("journey") ?: o
        val at = j.s37("leftSchoolAt") ?: j.s37("leftAt") ?: j.s37("left_school_at") ?: j.s37("at")
        val active = (!j.has("active") || j.optBoolean("active", true)) && j.s37("endedAt") == null
        if (j.optBoolean("hidden", false) && at != null) { s.rtHide = at; prefs41().edit().putString("papir_rt_hide", at).apply() }
        j.optJSONObject("trip")?.let { tr -> runCatching { parseTrip41(tr.toString()) }.getOrNull()?.let { s.trip = it } }
        (j.s37("homeCard") ?: o.s37("homeCard") ?: o.optJSONObject("settings")?.s37("homeCard"))?.takeIf { it in setOf("over", "instead", "off") }?.let { s.homeCard = it; prefs41().edit().putString("rt_home_card", it).apply() }
        val exp = j.s37("expiresAt") ?: at?.let { epoch41(it) }?.let { Instant.ofEpochMilli(it + 90 * 60_000L).toString() }
        val alive = at != null && active && (epoch41(exp) ?: Long.MAX_VALUE) > System.currentTimeMillis()
        val was = s.journey?.leftAt
        s.journey = if (alive) Journey41(at!!, exp) else null
        if (alive) { s.tripDir = "toHome"; loadTrip41() }
        // Live Update for Min reise: ny tur → vis; utløpt/hjemme → fjern.
        if (alive && was != at && s.rtHide != at) s.trip?.let { Live41.trip(appCtx40, it, epoch41(exp)) }
        if (!alive && was != null) Live41.endTrip(appCtx40)
    }
}

/** Kortet på Hjem vises bare med aktiv hendelse som ikke er sveipet bort for denne turen. */
fun AppViewModel.tripOnHome41(): Boolean {
    val j = p41.journey ?: return false
    return p41.homeCard != "off" && p41.rtHide != j.leftAt && p41.trip?.options?.isNotEmpty() == true
}

fun AppViewModel.hideTrip41() {
    val j = p41.journey ?: return
    p41.rtHide = j.leftAt
    prefs41().edit().putString("papir_rt_hide", j.leftAt).apply()
    p41.rtToast = true
    Live41.endTrip(appCtx40)
    launch41 { runCatching { api41 { hlPost("/ruter/journey/hide") } }; delay(4_500); p41.rtToast = false }
}

fun AppViewModel.undoHideTrip41() {
    p41.rtHide = null; p41.rtToast = false
    prefs41().edit().remove("papir_rt_hide").apply()
    launch41 { runCatching { api41 { hlDelete("/ruter/journey/hide") } } }
}

fun AppViewModel.setHomeCard41(v: String) {
    p41.homeCard = v; Haptics.select()
    prefs41().edit().putString("rt_home_card", v).apply()
    launch41 { runCatching { api41 { hlPut("/ruter/settings", JSONObject().put("homeCard", v)) } } }
}

/** Etiketter laget ferdig i koden («Gå 17 min», «Trikk 9 min»), aldri tekst rundt en verdi. */
fun legLabel41(l: Leg41): String {
    l.label?.takeIf { it.isNotBlank() }?.let { return it }
    val min = l.walkMin ?: run { val a = epoch41(l.arr); val d = epoch41(l.dep); if (a != null && d != null) ((a - d) / 60_000L).toInt() else null }
    return when (l.mode) {
        "foot", "walk", "gå" -> "Gå" + (min?.let { " $it" } ?: "")
        "tram" -> (l.line?.let { "Trikk $it" } ?: "Trikk") + (min?.let { " · $it min" } ?: "")
        "bus" -> l.line ?: "Buss"
        "metro" -> l.line?.let { "T-bane $it" } ?: "T-bane"
        else -> l.line ?: l.mode
    }
}

/* ======================= Ruter: antall anbefalte reiser ======================= */

fun AppViewModel.loadRecoCount45() {
    val s = p45
    val k = account?.id ?: ""
    if (s.recoFor == k) return
    s.recoFor = k
    s.recoCount = prefs.str("p45_reco_$k", "2").toIntOrNull()?.coerceIn(1, 3) ?: 2
    launch45 {
        val raw = runCatching { api45 { hlGet("/ruter/settings") } }.getOrNull() ?: return@launch45
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch45
        val n = (o.optJSONObject("settings") ?: o).optInt("recoCount", 0)
        if (n in 1..3) { s.recoCount = n; prefs.set("p45_reco_$k", n.toString()) }
    }
}

fun AppViewModel.setRecoCount45(n: Int) {
    val v = n.coerceIn(1, 3)
    p45.recoCount = v
    Haptics.select()
    prefs.set("p45_reco_" + (account?.id ?: ""), v.toString())
    launch45 { runCatching { api45 { hlPut("/ruter/settings", JSONObject().put("recoCount", v)) } } }
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

/* ---------- Avganger (Ruter / Entur) ---------- */

data class StopRef(val id: String, val name: String, val locality: String = "", val modes: List<String> = emptyList()) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("name", name)
}

data class Dep(
    val line: String, val to: String, val mode: String?, val color: Long?, val textColor: Long?,
    val aimed: String?, val expected: String?, val minutes: Int?, val realtime: Boolean, val platform: String?,
    val cancelled: Boolean, val situation: String?,
    /** Prompt 21: stoppene fra valgt holdeplass til endestasjonen (Entur serviceJourney.estimatedCalls). Tom på eldre server. */
    val stops: List<DepStop> = emptyList(),
    /** Forsinkelse i minutter (expected − aimed). */
    val delayMin: Int? = null,
    /** «i rute» eller «N min forsinket» fra serveren. */
    val status: String? = null,
    val ruterUrl: String? = null,
)

/** Ett stopp på turen: navn, plattform og tidspunkt (klokkeslett «19:04» eller ISO). */
data class DepStop(val name: String, val platform: String?, val time: String?, val aimed: String?, val expected: String?)

data class StopDeps(val stop: StopRef, val departures: List<Dep>)

fun parseStopList(s: String): List<StopRef> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("stops") ?: it.optJSONArray("items") ?: JSONArray() }
    return (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        StopRef(o.optStr("id") ?: return@mapNotNull null, o.optStr("name") ?: "Holdeplass", o.optStr("locality") ?: "", o.optJSONArray("modes").strings())
    }
}

private fun parseDep(o: JSONObject): Dep {
    val sa = o.optJSONArray("stops") ?: JSONArray()
    val stops = (0 until sa.length()).mapNotNull { i ->
        val x = sa.optJSONObject(i) ?: return@mapNotNull sa.optString(i).takeIf { it.isNotBlank() }?.let { DepStop(it, null, null, null, null) }
        DepStop(x.optStr("name") ?: return@mapNotNull null, x.optStr("platform"), x.optStr("time"), x.optStr("aimed"), x.optStr("expected"))
    }
    return Dep(
        o.optStr("line") ?: o.optStr("publicCode") ?: "?", o.optStr("to") ?: o.optStr("destination") ?: "", o.optStr("mode"),
        o.optStr("color")?.let(::color), o.optStr("textColor")?.let(::color), o.optStr("aimed"), o.optStr("expected"),
        o.optIntOrNull("minutes") ?: o.optIntOrNull("min"), o.optBoolean("realtime", false), o.optStr("platform") ?: o.optStr("quay"),
        o.optBoolean("cancelled", false), o.optStr("situation"),
        stops, o.optIntOrNull("delayMin"), o.optStr("status"), o.optStr("ruterUrl"),
    )
}

fun parseStopDeps(s: String): StopDeps {
    val o = JSONObject(s)
    val st = o.optJSONObject("stop")
    val deps = o.optJSONArray("departures") ?: JSONArray()
    return StopDeps(
        StopRef(st?.optStr("id") ?: "", st?.optStr("name") ?: "Holdeplass"),
        (0 until deps.length()).mapNotNull { i -> deps.optJSONObject(i)?.let(::parseDep) },
    )
}

/** Ruters standardfarger per transportmiddel, når serveren ikke sender linjefargen. */
fun ruterModeColor(mode: String?, line: String): Long = when (mode) {
    "metro" -> 0xFFEC700C
    "tram" -> 0xFF0B91EF
    "bus" -> if ((line.filter(Char::isDigit).toIntOrNull() ?: 0) >= 100) 0xFF75A300 else 0xFFE60000
    "water" -> 0xFF682C88
    "rail" -> 0xFF003087
    else -> {
        // Uten mode: T-banelinjene er 1–5, trikken 11–19, ellers buss.
        val n = line.filter(Char::isDigit).toIntOrNull()
        when {
            line.startsWith("T", true) || (n != null && n in 1..5) -> 0xFFEC700C
            n != null && n in 11..19 -> 0xFF0B91EF
            n != null && n >= 100 -> 0xFF75A300
            else -> 0xFFE60000
        }
    }
}

/** Hjem-kortet: valgte stopp (≤ 3) og avganger per stopp (1–4). */
data class HomeDep27(val stops: List<String>, val n: Int)

/* ---------- Ruter på Hjem ---------- */

private fun homeDepKey27(vm: AppViewModel) = "home_dep27_" + (vm.account?.id ?: "")

private fun parseHomeDep27(raw: String): HomeDep27? = runCatching {
    val o0 = JSONObject(raw)
    val o = o0.optJSONObject("home_departures") ?: o0.optJSONObject("homeDepartures") ?: o0
    if (!o.has("stops")) return@runCatching null
    HomeDep27(o.optJSONArray("stops").strings().filter { it.isNotBlank() }.take(3), o.optInt("n", 3).coerceIn(1, 4))
}.getOrNull()

private fun HomeDep27.json() = JSONObject().put("stops", JSONArray(stops)).put("n", n)

/** Stoppene kortet viser: de valgte i rekkefølgen fra Mine stopp, ellers det første. */
fun AppViewModel.homeShown27(): List<StopRef> {
    val all = b27.homeStops ?: return emptyList()
    val sel = all.filter { it.id in b27.homeDep.stops }
    return sel.ifEmpty { all.take(1) }.take(3)
}

/** Første gang (per konto): lagret valg, så serveren, så Mine stopp og avgangene. */
fun AppViewModel.loadHomeDep27() {
    val s = b27
    val key = homeDepKey27(this)
    if (s.homeDepFor != key) {
        s.homeDepFor = key
        s.homeStops = null; s.homeDeps = emptyMap()
        s.homeDep = parseHomeDep27(prefs.str(key, "")) ?: HomeDep27(emptyList(), 3)
        runCatching { seedHome52() } // prompt 52 (AND52B): stoppene og avgangene fra bufferen før nettverkskallet
        launch27b {
            val srv = runCatching { api27b { hlGet("/me/home-departures") } }.getOrNull()?.let(::parseHomeDep27)
                ?: runCatching { api27b { hlGet("/me/layout") } }.getOrNull()?.let(::parseHomeDep27)
            if (srv != null) { s.homeDep = srv; prefs.set(key, srv.json().toString()) }
        }
    }
    launch27b { refreshHomeDeps27(stops = true) }
}

suspend fun AppViewModel.refreshHomeDeps27(stops: Boolean = false) {
    val s = b27
    if (stops || s.homeStops == null) {
        s.homeStops = runCatching { api27b { hlGet("/me/stops") }.let { raw -> parseStopList(raw).also { runCatching { cacheStops52(raw) } } } }.getOrNull() ?: s.homeStops ?: emptyList()
    }
    val shown = homeShown27()
    if (shown.isEmpty()) return
    val n = maxOf(4, s.homeDep.n)
    val out = s.homeDeps.toMutableMap()
    for (st in shown) {
        runCatching { api27b { hlGet("/ruter/departures?stop=" + URLEncoder.encode(st.id, "UTF-8") + "&n=" + (n + 2), timeout = 12_000) }.let { raw -> raw to parseStopDeps(raw) } }
            .getOrNull()?.let { (raw, sd) ->
                val v = sd.copy(stop = sd.stop.copy(id = st.id, name = st.name.ifBlank { sd.stop.name }))
                out[st.id] = v
                runCatching { cacheDeps52(st.id, raw, v) } // prompt 52: hurtigbuffer per stopp
            }
    }
    s.homeDeps = out
}

fun AppViewModel.setHomeDep27(v: HomeDep27, ctx: Context? = null) {
    val s = b27
    val nv = v.copy(stops = v.stops.take(3), n = v.n.coerceIn(1, 4))
    s.homeDep = nv
    prefs.set(homeDepKey27(this), nv.json().toString())
    launch27b {
        // Egen rute (avtalen). Eldre server uten ruten: valget ligger lokalt per konto (layouten skrives ikke over).
        runCatching { api27b { hlPut("/me/home-departures", nv.json()) } }
        refreshHomeDeps27()
        ctx?.let { c -> runCatching { no.kristo.finanshub.widget.Ruter27Widgets.refreshNow(c) } }
    }
}

/** «Legg til eller fjern stopp ›»: Avganger i redigeringsmodus. */
fun AppViewModel.manageStops27() {
    b27.homeSheet = false
    openRuter()
    stopEdit = true
}
