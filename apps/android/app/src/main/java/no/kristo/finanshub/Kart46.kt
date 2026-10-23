package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.Locale

/*
 * Prompt 46 (claude-code-kart-side.md, fasit Kart.dc.html): ny side Kart (Mer → Kart, side-nøkkel tkart).
 * Alt går via serverens /api/kart (DATA46, server/kart46.js): holdeplasser i utsnittet (Entur stopPlacesByBbox, fra zoom 14),
 * avganger (estimatedCalls 12 / 2 t), kjøretøy i sanntid BARE for valgte soner (poll 10 s), søk (Entur Geocoder) og soner/personer
 * fra Familie med de samme delingsreglene. Brukervalg kart_v1 = {z, c, show, md, vz} per bruker (PUT /api/kart/prefs).
 * Fliser: Kartverket topograatone (WMTS webmercator), som serveren oppgir i GET /api/kart → tiles.url.
 * 404 (eldre server) → «Kart finnes ikke på serveren ennå».
 */

data class KStop46(val id: String, val name: String, val lat: Double, val lon: Double, val modes: List<String>)
data class KZone46(val id: String, val name: String, val lat: Double, val lon: Double, val radius: Double, val color: Long?, val live: Boolean)
data class KPerson46(val id: String, val name: String, val color: Long?, val self: Boolean, val lat: Double, val lon: Double, val zone: String?, val updatedAt: String?)
data class KVehicle46(val id: String, val line: String, val mode: String, val bearing: Double?, val lat: Double, val lon: Double, val dest: String?)
data class KCall46(val line: String, val mode: String, val to: String, val platform: String?, val minutes: Int, val delayMin: Int, val realtime: Boolean, val time: String?)
data class KDeps46(val stop: KStop46, val calls: List<KCall46>, val demo: Boolean)
data class KHit46(val id: String?, val name: String, val label: String, val lat: Double, val lon: Double, val modes: List<String>)

/** kart_v1: zoom, senter, lag (stops/vehicles/zones/people), moduser og soner med sanntid. */
data class KPrefs46(
    val z: Double = 14.0, val lat: Double = 59.9225, val lon: Double = 10.735,
    val show: Map<String, Boolean> = mapOf("stops" to true, "vehicles" to true, "zones" to true, "people" to true),
    val md: Set<String> = MODES46.toSet(), val vz: Set<String> = emptySet(),
)

val MODES46 = listOf("bus", "metro", "tram", "rail", "water")
val MODE_NAME46 = mapOf("bus" to "Buss", "metro" to "T-bane", "tram" to "Trikk", "rail" to "Tog", "water" to "Båt")
val MODE_COLOR46 = mapOf("bus" to 0xFFC8372DL, "metro" to 0xFFD9661FL, "tram" to 0xFF2B6FB3L, "rail" to 0xFF2F7A4FL, "water" to 0xFF5B4BB5L)
val MODE_PATH46 = mapOf(
    "bus" to "M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2zM4 11h16M7 20v-4M17 20v-4", "metro" to "M5 5h14M12 5v15",
    "tram" to "M7 7h10v9H7zM9 3h6M12 3v4M8 21l2-5M16 21l-2-5", "rail" to "M7 3h10v12H7zM7 10h10M9 19l-2 2M15 19l2 2",
    "water" to "M3 16c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M6 13l1-5h10l1 5M12 4v4",
)

class Kart46State {
    var open by mutableStateOf(false)
    var missing by mutableStateOf(false)
    var err by mutableStateOf<String?>(null)
    var prefs by mutableStateOf(KPrefs46())
    var tilesUrl by mutableStateOf("https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png")
    var attribution by mutableStateOf("© Kartverket")
    /** Flisene går via vår egen /tiles-proxy (relativ URL fra serveren) → app-tokenet sendes bare dit. */
    var tilesAuth by mutableStateOf(false)
    var sourceText by mutableStateOf("SANNTID · ENTUR")
    var demo by mutableStateOf(false)
    var zones by mutableStateOf<List<KZone46>>(emptyList())
    var people by mutableStateOf<List<KPerson46>>(emptyList())
    var stops by mutableStateOf<List<KStop46>>(emptyList())
    var stopsNote by mutableStateOf<String?>(null)
    var vehicles by mutableStateOf<List<KVehicle46>>(emptyList())
    var vehSeq by mutableIntStateOf(0)
    var sel by mutableStateOf<KStop46?>(null)
    var deps by mutableStateOf<KDeps46?>(null)
    var depsBusy by mutableStateOf(false)
    var tab by mutableStateOf("lag") // lag · soner · personer
    var sheet by mutableStateOf("peek") // peek · half · full
    var q by mutableStateOf("")
    var hits by mutableStateOf<List<KHit46>>(emptyList())
    /** Be kartet fly til (lat, lon, zoom). */
    var fly by mutableStateOf<Triple<Double, Double, Double>?>(null)
    var flySeq by mutableIntStateOf(0)
    internal var stopsJob: Job? = null
    internal var vehJob: Job? = null
    internal var saveJob: Job? = null
    internal var searchJob: Job? = null
    internal var lastBox: String? = null
}

private fun JSONObject.dd46(k: String): Double? = if (has(k) && !isNull(k)) optDouble(k).takeIf { !it.isNaN() } else null
private fun hexL46(s: String?): Long? = s?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { 0xFF000000L or it }
private fun modes46(a: JSONArray?): List<String> = (0 until (a?.length() ?: 0)).mapNotNull { a!!.optString(it).takeIf { m -> m in MODES46 } }.ifEmpty { listOf("bus") }

private fun parsePrefs46(o: JSONObject?): KPrefs46 {
    if (o == null) return KPrefs46()
    val c = o.optJSONArray("c")
    val sh = o.optJSONObject("show")
    val md = o.optJSONArray("md")
    val vz = o.optJSONArray("vz")
    val def = KPrefs46()
    return KPrefs46(
        o.dd46("z") ?: def.z, c?.optDouble(0)?.takeIf { !it.isNaN() } ?: def.lat, c?.optDouble(1)?.takeIf { !it.isNaN() } ?: def.lon,
        def.show.mapValues { (k, v) -> sh?.optBoolean(k, v) ?: v },
        if (md != null) (0 until md.length()).map { md.optString(it) }.filter { it in MODES46 }.toSet() else def.md,
        if (vz != null) (0 until vz.length()).map { vz.opt(it).toString() }.toSet() else emptySet(),
    )
}

private fun prefsJson46(p: KPrefs46) = JSONObject().put("z", p.z).put("c", JSONArray().put(p.lat).put(p.lon))
    .put("show", JSONObject().apply { p.show.forEach { (k, v) -> put(k, v) } }).put("md", JSONArray(p.md.toList()))
    .put("vz", JSONArray().apply { p.vz.forEach { put(it.toLongOrNull() ?: it) } })

private fun parseZones46(a: JSONArray?) = objs34(a).mapNotNull { z ->
    val lat = z.dd46("lat") ?: return@mapNotNull null; val lon = z.dd46("lon") ?: return@mapNotNull null
    KZone46(z.opt("id")?.toString() ?: return@mapNotNull null, z.s43("name") ?: "Sone", lat, lon, z.dd46("radius") ?: 150.0, hexL46(z.s43("color")), z.optBoolean("live", false))
}
private fun parsePeople46(a: JSONArray?) = objs34(a).mapNotNull { m ->
    val lat = m.dd46("lat") ?: return@mapNotNull null; val lon = m.dd46("lon") ?: return@mapNotNull null
    KPerson46(m.s43("userId", "id") ?: return@mapNotNull null, m.s43("name") ?: "?", hexL46(m.s43("color")), m.optBoolean("self", false), lat, lon, m.s43("zone"), m.s43("updatedAt"))
}

fun AppViewModel.openKart46() {
    val k = p46.kart
    k.open = true
    k.err = null
    Haptics.tap()
    loadKart46()
}

fun AppViewModel.closeKart46() {
    val k = p46.kart
    if (k.sel != null) { k.sel = null; k.deps = null; return }
    k.open = false
    k.vehJob?.cancel(); k.stopsJob?.cancel()
    Haptics.back()
}

fun AppViewModel.loadKart46() = launch46 {
    val k = p46.kart
    val raw = try { api46 { hlGet("/kart", timeout = 12_000) } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 404) k.missing = true else k.err = e.message
        null
    } catch (e: Exception) { k.err = e.message; null } ?: return@launch46
    k.missing = false
    val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch46
    k.prefs = parsePrefs46(o.optJSONObject("prefs"))
    k.zones = parseZones46(o.optJSONArray("zones"))
    k.people = parsePeople46(o.optJSONArray("people"))
    k.demo = o.s43("source") == "demo"
    k.sourceText = o.s43("sourceText") ?: if (k.demo) "DEMO-DATA" else "SANNTID · ENTUR"
    o.optJSONObject("tiles")?.let { t ->
        val u = t.s43("url")
        when {
            u != null && u.startsWith("/") && base.isNotBlank() -> { k.tilesUrl = base.trimEnd('/') + u; k.tilesAuth = true }
            u != null && u.startsWith("https://") -> { k.tilesUrl = u; k.tilesAuth = false }
            else -> t.s43("directUrl")?.takeIf { it.startsWith("https://") }?.let { k.tilesUrl = it; k.tilesAuth = false }
        }
        t.s43("attribution")?.let { k.attribution = it }
    }
    k.fly = Triple(k.prefs.lat, k.prefs.lon, k.prefs.z); k.flySeq++
    pollVehicles46()
}

/** Kalles når kartet har stått stille (400 ms) etter dra/zoom. Holdeplasser bare fra zoom 14. */
fun AppViewModel.kartMoved46(lat: Double, lon: Double, z: Double, minLat: Double, minLon: Double, maxLat: Double, maxLon: Double) {
    val k = p46.kart
    k.prefs = k.prefs.copy(z = z, lat = lat, lon = lon)
    saveKart46()
    k.stopsJob?.cancel()
    if (z < 14 || k.prefs.show["stops"] == false) { k.stops = emptyList(); k.stopsNote = if (z < 14 && k.prefs.show["stops"] != false) "Zoom inn for å se holdeplasser" else null; return }
    val box = String.format(Locale.US, "%.4f,%.4f,%.4f,%.4f", minLat, minLon, maxLat, maxLon)
    if (box == k.lastBox && k.stops.isNotEmpty()) return
    k.stopsJob = launchJob46 {
        delay(250)
        val raw = try { api46 { hlGet("/kart/stops?bbox=" + URLEncoder.encode(box, "UTF-8"), timeout = 12_000) } } catch (e: CancellationException) { throw e } catch (e: Exception) { null } ?: return@launchJob46
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launchJob46
        k.lastBox = box
        k.stopsNote = if (o.optBoolean("tooBig")) (o.s43("message") ?: "Zoom inn for å se holdeplasser") else o.s43("error")
        if (o.s43("source") == "demo") { k.demo = true; k.sourceText = "DEMO-DATA" }
        k.stops = objs34(o.optJSONArray("stops")).mapNotNull { s ->
            KStop46(s.s43("id") ?: return@mapNotNull null, s.s43("name") ?: "", s.dd46("lat") ?: return@mapNotNull null, s.dd46("lon") ?: return@mapNotNull null, modes46(s.optJSONArray("modes")))
        }
    }
}

/** Kjøretøy for soner med sanntid, hvert 10. sekund mens Kart er åpent. */
internal fun AppViewModel.pollVehicles46() {
    val k = p46.kart
    k.vehJob?.cancel()
    k.vehJob = launchJob46 {
        while (k.open) {
            if (k.prefs.show["vehicles"] != false && k.prefs.vz.isNotEmpty()) {
                val raw = runCatching { api46 { hlGet("/kart/vehicles?zones=" + URLEncoder.encode(k.prefs.vz.joinToString(","), "UTF-8"), timeout = 9_000) } }.getOrNull()
                val o = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
                if (o != null) {
                    if (o.s43("source") == "demo") { k.demo = true; k.sourceText = "DEMO-DATA" }
                    k.vehicles = objs34(o.optJSONArray("vehicles")).mapNotNull { v ->
                        KVehicle46(v.s43("id") ?: return@mapNotNull null, v.s43("line") ?: "", v.s43("mode") ?: "bus", v.dd46("bearing"), v.dd46("lat") ?: return@mapNotNull null,
                            v.dd46("lon") ?: return@mapNotNull null, v.s43("destination"))
                    }
                    k.vehSeq++
                }
            } else if (k.vehicles.isNotEmpty()) { k.vehicles = emptyList(); k.vehSeq++ }
            delay(10_000)
        }
    }
}

private fun AppViewModel.saveKart46() {
    val k = p46.kart
    k.saveJob?.cancel()
    k.saveJob = launchJob46 {
        delay(1_200)
        runCatching { api46 { hlPut("/kart/prefs", prefsJson46(k.prefs)) } }
    }
}

fun AppViewModel.kartLayer46(key: String, on: Boolean) {
    val k = p46.kart
    Haptics.select()
    k.prefs = k.prefs.copy(show = k.prefs.show + (key to on))
    if (key == "stops") k.lastBox = null
    saveKart46()
    if (key == "vehicles") pollVehicles46()
}

fun AppViewModel.kartMode46(m: String) {
    val k = p46.kart
    Haptics.select()
    val md = if (m in k.prefs.md) k.prefs.md - m else k.prefs.md + m
    k.prefs = k.prefs.copy(md = md.ifEmpty { MODES46.toSet() })
    saveKart46()
}

/** «Sanntid» for en sone (POST /api/kart/live). Slår også på laget Kjøretøy. */
fun AppViewModel.kartLive46(z: KZone46) {
    val k = p46.kart
    val on = z.id !in k.prefs.vz
    Haptics.select()
    k.prefs = k.prefs.copy(vz = if (on) k.prefs.vz + z.id else k.prefs.vz - z.id, show = if (on) k.prefs.show + ("vehicles" to true) + ("zones" to true) else k.prefs.show)
    k.zones = k.zones.map { if (it.id == z.id) it.copy(live = on) else it }
    launch46 {
        runCatching { api46 { hlPost("/kart/live", JSONObject().put("zoneId", z.id).put("on", on)) } }.onFailure { saveKart46() }
        pollVehicles46()
    }
    if (on) { kartFly46(z.lat, z.lon, zoneZoom46(z.radius)) }
}

internal fun zoneZoom46(r: Double): Double = when { r > 1500 -> 13.0; r > 700 -> 14.0; r > 300 -> 15.0; else -> 16.0 }

fun AppViewModel.kartFly46(lat: Double, lon: Double, z: Double) { val k = p46.kart; k.fly = Triple(lat, lon, z); k.flySeq++ }

fun AppViewModel.kartPick46(s: KStop46) {
    val k = p46.kart
    Haptics.select()
    k.sel = s; k.deps = null; k.depsBusy = true
    if (k.sheet == "peek") k.sheet = "half"
    launch46 {
        val raw = runCatching { api46 { hlGet("/kart/stops/" + URLEncoder.encode(s.id, "UTF-8") + "/departures", timeout = 12_000) } }.getOrNull()
        val o = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
        if (k.sel?.id == s.id) {
            k.deps = o?.let { d ->
                val st = d.optJSONObject("stop")
                KDeps46(st?.let { KStop46(s.id, it.s43("name") ?: s.name, s.lat, s.lon, modes46(it.optJSONArray("modes"))) } ?: s,
                    objs34(d.optJSONArray("calls")).map { c ->
                        KCall46(c.s43("line") ?: "", c.s43("mode") ?: "bus", c.s43("to") ?: "", c.s43("platform"), c.i43("minutes") ?: 0, c.i43("delayMin") ?: 0, c.optBoolean("realtime"),
                            c.s43("expected", "aimed")?.let { t -> runCatching { java.time.OffsetDateTime.parse(t).atZoneSameInstant(java.time.ZoneId.of("Europe/Oslo")).toLocalTime().toString().take(5) }.getOrNull() })
                    }, d.s43("source") == "demo")
            }
            k.depsBusy = false
        }
    }
}

fun AppViewModel.kartSearch46(q: String) {
    val k = p46.kart
    k.q = q
    k.searchJob?.cancel()
    if (q.trim().length < 2) { k.hits = emptyList(); return }
    k.searchJob = launchJob46 {
        delay(300)
        val raw = runCatching { api46 { hlGet("/kart/search?q=" + URLEncoder.encode(q.trim(), "UTF-8"), timeout = 10_000) } }.getOrNull() ?: return@launchJob46
        k.hits = objs34(runCatching { JSONObject(raw).optJSONArray("results") }.getOrNull()).mapNotNull { h ->
            KHit46(h.s43("id"), h.s43("name") ?: return@mapNotNull null, h.s43("label") ?: "", h.dd46("lat") ?: return@mapNotNull null, h.dd46("lon") ?: return@mapNotNull null, modes46(h.optJSONArray("modes")))
        }
    }
}

/** finanshub://kart[/<soneId>][?live=1]: åpner Kart, flyr til sonen og slår på sanntid når live=1. */
fun AppViewModel.kartLink46(uri: android.net.Uri) {
    openKart46()
    val zid = uri.path?.trim('/')?.takeIf { it.isNotBlank() } ?: uri.getQueryParameter("zone") ?: return
    val live = uri.getQueryParameter("live") == "1"
    launch46 {
        var n = 0
        while (p46.kart.zones.isEmpty() && n++ < 20) delay(250)
        val z = p46.kart.zones.firstOrNull { it.id == zid || it.name.equals(zid, true) } ?: return@launch46
        if (live && !z.live) kartLive46(z) else kartFly46(z.lat, z.lon, zoneZoom46(z.radius))
    }
}
