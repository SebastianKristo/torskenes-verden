package no.kristo.finanshub

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.util.LruCache
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import no.kristo.finanshub.family.FamilyPrefs
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.Locale

/*
 * Prompt 50 (FAMAND50): Familie i nytt design (claude-code-familie-nytt-design.md + claude-code-steder-flere-omrader-ruter.md).
 * Data og handlinger her, skjermene i ui/Family50.kt. Server-API: SRVFAM50 i SERVER50-API.md (server/family50.js).
 *  - Folk (/family/people50), I DAG (/family/today50), Steder med flere områder (/family/places…), Helse (/family/health50…),
 *    Sjekk inn (/family/checkin…), Ruter › Min reise (/ruter/school50).
 *  - Geofencing: én region per område fra /family/places/regions (maks 20), registrert som nærhetsvarsler i LocationManager
 *    (samme mekanisme som skolesonene i Live41.kt, uten Play-tjenester) og som sonekanter for delingstjenesten (FamilyPrefs).
 *    Hentes på nytt ved WebSocket `family {kind:'places'}`.
 *  - Varsler for innsjekk/forespørsel med handlingene 👍 / Ring / Hent; «Hent meg» i egen kanal «sjekkinn-hast».
 * Eldre server (404 på people50): Familie faller tilbake til den gamle siden (Family22Screen).
 */

/* ======================= Modeller ======================= */

data class FamAv50(val userId: String, val name: String, val initials: String, val color: Long, val photoUrl: String?, val self: Boolean)

data class FamFromMe50(val text: String, val dir: String, val bearing: Double?, val label: String)

data class FamPerson50(
    val av: FamAv50, val sharing: String, val status: String, val place: String, val sub: String?, val statusLine: String?,
    val zone: String?, val activity: String?, val speedKmh: Double?, val battery: Int?, val charging: Boolean?, val lowBattery: Boolean,
    val lat: Double?, val lon: Double?, val acc: Double?, val approx: Boolean, val updatedAt: String?, val device: String?,
    val fromMe: FamFromMe50?, val healthShared: Boolean, val phone: String?,
) {
    val userId get() = av.userId
    val name get() = av.name
    val hasPos get() = lat != null && lon != null && validLatLon(lat, lon)
}

data class FamItem50(
    val id: String, val kind: String, val avatar: FamAv50?, val title: String, val sub: String?, val right: String?,
    val pending: Boolean, val alert: Boolean, val checkinId: String?,
)

data class FamArea50(val id: String, val name: String, val lat: Double, val lon: Double, val radius: Int, val label: String)

data class FamPlace50(
    val id: String, val name: String, val type: String, val color: Long, val icon: String?, val mine: Boolean, val shared: Boolean,
    val notify: Map<String, Pair<Boolean, Boolean>>, val areas: List<FamArea50>, val areaText: String, val here: List<FamAv50>,
    val hereText: String, val notifyText: String?, val usedByText: String?, val canEdit: Boolean, val canRemoveArea: Boolean,
)

data class FamDay50(val day: String, val today: Boolean, val steps: Int?, val goalReached: Boolean)

data class FamHealth50(
    val av: FamAv50, val shared: Boolean, val short: String?, val text: String?, val actionLabel: String?, val actionUrl: String?,
    val shareText: String?, val sourceText: String?, val device: String?,
    val steps: Int?, val stepsText: String?, val goal: Int?, val goalText: String?, val goalReached: Boolean, val badge: String?,
    val sleepText: String?, val sleepRange: String?, val restingHr: Int?, val hr: Int?, val activeKcal: Int?, val battery: Int?, val charging: Boolean?,
    val week: List<FamDay50>, val weekText: String?,
)

data class FamCkTo50(val av: FamAv50, val reply: String?, val replyText: String?, val seen: Boolean)

data class FamCheckin50(
    val id: String, val kind: String, val priority: String, val from: FamAv50?, val mine: Boolean, val text: String?,
    val placeName: String?, val placeLabel: String?, val lat: Double?, val lon: Double?, val time: String?, val title: String,
    val to: List<FamCkTo50>, val seenText: String?, val pending: Boolean, val reminderText: String?, val createdAt: String?,
)

data class FamSuggest50(val source: String, val title: String, val detail: String?, val label: String, val lat: Double?, val lon: Double?, val acc: Double?, val eventTitle: String?)

data class FamQuick50(val id: String, val text: String, val high: Boolean)

data class FamCheckinTab50(
    val suggestion: FamSuggest50?, val suggestions: List<FamSuggest50>, val quick: List<FamQuick50>, val people: List<FamAv50>,
    val latest: FamCheckin50?, val requests: List<FamCheckin50>, val log: List<FamItem50>, val logTitle: String,
)

data class FamSchool50(
    val title: String, val placeId: String?, val placeName: String?, val areas: List<FamArea50>, val editLabel: String?,
    val emptyText: String?, val emptyAction: String?,
)

data class FamRegion50(val id: String, val placeId: String, val type: String, val name: String, val lat: Double, val lon: Double, val radius: Double)

/* ======================= Tilstand ======================= */

class FamState50 {
    /** Serveren har ikke people50 (eldre versjon): den gamle Familie-siden vises. */
    var missing by mutableStateOf(false)
    var people by mutableStateOf<List<FamPerson50>?>(null)
    var title by mutableStateOf("Familie")
    var subtitle by mutableStateOf("")
    var today by mutableStateOf<List<FamItem50>>(emptyList())
    var places by mutableStateOf<List<FamPlace50>?>(null)
    var placeTypes by mutableStateOf(listOf("hjem", "skole", "jobb", "annet"))
    var health by mutableStateOf<List<FamHealth50>?>(null)
    var healthSummary by mutableStateOf<String?>(null)
    var personHealth by mutableStateOf<Map<String, FamHealth50>>(emptyMap())
    var checkin by mutableStateOf<FamCheckinTab50?>(null)
    var school by mutableStateOf<FamSchool50?>(null)
    var schoolMissing by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)

    /** Underside: kart · person · sted · helsep. from = hvor Personside ble åpnet fra (folk/kart/helsep). */
    var sub by mutableStateOf<String?>(null)
    var from by mutableStateOf<String?>(null)
    var sel by mutableStateOf<String?>(null)
    /** Sted som redigeres (id), eller "new" for et nytt sted (newType). */
    var placeSel by mutableStateOf<String?>(null)
    var newType by mutableStateOf("annet")
    /** 6b vises etter sending til brukeren trykker «Sjekk inn igjen». */
    var showSent by mutableStateOf(false)
    /** Svar på en forespørsel (requestId) med neste innsjekk. */
    var replyTo by mutableStateOf<String?>(null)
    var sending by mutableStateOf(false)

    @Volatile var lastLoad = 0L
    @Volatile var regionsOk = false
    @Volatile var regionsVersion = -1L
    internal val photoCache = LruCache<String, Bitmap>(48)
    var photoVer by mutableStateOf(0)
}

/* ======================= JSON ======================= */

private fun JSONObject.s50(k: String): String? = if (!has(k) || isNull(k)) null else opt(k)?.toString()?.takeIf { it.isNotBlank() && it != "null" }
private fun JSONObject.d50(k: String): Double? = if (!has(k) || isNull(k)) null else optDouble(k).takeIf { !it.isNaN() }
private fun JSONObject.i50(k: String): Int? = d50(k)?.let { Math.round(it).toInt() }
private fun JSONObject.b50(k: String): Boolean? = if (!has(k) || isNull(k)) null else optBoolean(k)
private fun objs50(a: JSONArray?): List<JSONObject> = if (a == null) emptyList() else (0 until a.length()).mapNotNull { a.optJSONObject(it) }

internal fun hex50(s: String?, fallback: Long = 0xFF5C5850): Long =
    s?.trim()?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { 0xFF000000L or it } ?: fallback

private fun av50(o: JSONObject?): FamAv50? {
    o ?: return null
    val id = o.s50("userId") ?: o.s50("id") ?: return null
    val name = o.s50("name") ?: "?"
    return FamAv50(id, name, o.s50("initials") ?: name.take(2), hex50(o.s50("color"), posColorFor(id)), o.s50("photoUrl"), o.optBoolean("self"))
}

private fun person50(o: JSONObject): FamPerson50? {
    val av = av50(o) ?: return null
    val fm = o.optJSONObject("fromMe")?.let { f -> FamFromMe50(f.s50("text") ?: "", f.s50("dir") ?: "", f.d50("bearing"), f.s50("label") ?: "") }
    return FamPerson50(
        av, o.s50("sharing") ?: "off", o.s50("status") ?: "off", o.s50("place") ?: "–", o.s50("sub"), o.s50("statusLine"),
        o.s50("zone"), o.s50("activity"), o.d50("speedKmh"), o.i50("battery"), o.b50("charging"), o.optBoolean("lowBattery"),
        o.d50("lat"), o.d50("lon"), o.d50("acc"), o.optBoolean("approx"), o.s50("updatedAt"), o.s50("device"), fm, o.optBoolean("healthShared"), o.s50("phone"),
    )
}

private fun item50(o: JSONObject): FamItem50 = FamItem50(
    o.s50("id") ?: o.hashCode().toString(), o.s50("kind") ?: "", av50(o.optJSONObject("avatar")), o.s50("title") ?: "", o.s50("sub"), o.s50("right"),
    o.optBoolean("pending"), o.optBoolean("alert"), o.s50("checkinId"),
)

private fun area50(o: JSONObject): FamArea50? {
    val id = o.s50("id") ?: return null
    val r = o.i50("radius_m") ?: o.i50("radius") ?: 100
    val n = o.s50("name") ?: "Område"
    return FamArea50(id, n, o.d50("lat") ?: return null, o.d50("lon") ?: return null, r, o.s50("label") ?: "$n $r m")
}

internal fun place50(o: JSONObject): FamPlace50? {
    val id = o.s50("id") ?: return null
    val nt = HashMap<String, Pair<Boolean, Boolean>>()
    o.optJSONObject("notify")?.let { n -> n.keys().forEach { k -> n.optJSONObject(k)?.let { v -> nt[k] = v.optBoolean("enter") to v.optBoolean("leave") } } }
    val mine = o.optBoolean("mine", o.optBoolean("canEdit"))
    val areas = objs50(o.optJSONArray("areas")).mapNotNull(::area50).ifEmpty {
        val la = o.d50("lat"); val lo = o.d50("lon")
        if (la != null && lo != null) listOf(FamArea50(id + "-0", o.s50("name") ?: "Sted", la, lo, o.i50("radius") ?: 150, "${o.s50("name") ?: "Sted"} ${o.i50("radius") ?: 150} m")) else emptyList()
    }
    return FamPlace50(
        id, o.s50("name") ?: "Sted", o.s50("type") ?: "annet", hex50(o.s50("color"), 0xFF2B5D8A), o.s50("icon"), mine, o.optBoolean("shared"), nt, areas,
        o.s50("areaText") ?: if (areas.size == 1) "1 område" else "${areas.size} områder",
        objs50(o.optJSONArray("here")).mapNotNull(::av50), o.s50("hereText") ?: "Ingen her nå", o.s50("notifyText"), o.s50("usedByText"),
        o.optBoolean("canEdit", mine), o.optBoolean("canRemoveArea", mine && areas.size > 1),
    )
}

private fun health50(o: JSONObject): FamHealth50? {
    val av = av50(o) ?: return null
    val t = o.optJSONObject("today")
    val act = o.optJSONObject("action")
    val week = objs50(o.optJSONArray("week")).map { d -> FamDay50(d.s50("day") ?: "", d.optBoolean("today"), d.i50("steps"), d.optBoolean("goalReached")) }
    return FamHealth50(
        av, o.optBoolean("shared"), o.s50("short"), o.s50("text"), act?.s50("label"), act?.s50("url"),
        o.s50("shareText"), o.s50("sourceText"), o.s50("device"),
        t?.i50("steps"), t?.s50("stepsText"), t?.i50("goal"), t?.s50("goalText"), t?.optBoolean("goalReached") == true, t?.s50("badge"),
        t?.s50("sleepText"), t?.s50("sleepRange"), t?.i50("restingHr"), t?.i50("hr"), t?.i50("activeKcal"), t?.i50("battery"), t?.b50("charging"),
        week, o.s50("weekText"),
    )
}

private fun checkin50(o: JSONObject?): FamCheckin50? {
    o ?: return null
    val id = o.s50("id") ?: return null
    val pl = o.optJSONObject("place")
    val pos = o.optJSONObject("position")
    return FamCheckin50(
        id, o.s50("kind") ?: "checkin", o.s50("priority") ?: "normal", av50(o.optJSONObject("from")), o.optBoolean("mine"), o.s50("text"),
        pl?.s50("name") ?: pl?.s50("detail"), pl?.s50("label"), pos?.d50("lat"), pos?.d50("lon"), o.s50("time"), o.s50("title") ?: "Sjekk inn",
        objs50(o.optJSONArray("to")).mapNotNull { t -> av50(t)?.let { FamCkTo50(it, t.s50("reply"), t.s50("replyText"), t.s50("seenAt") != null) } },
        o.s50("seenText"), o.optBoolean("pending"), o.optJSONObject("reminder")?.takeIf { !it.optBoolean("done") }?.s50("text"), o.s50("createdAt"),
    )
}

private fun suggest50(o: JSONObject?): FamSuggest50? {
    o ?: return null
    val title = o.s50("title") ?: return null
    return FamSuggest50(o.s50("source") ?: "address", title, o.s50("detail"), o.s50("label") ?: title, o.d50("lat"), o.d50("lon"), o.d50("acc"),
        if (o.s50("source") == "calendar") title else null)
}

internal fun school50(o: JSONObject): FamSchool50 {
    val pl = o.optJSONObject("place")
    return FamSchool50(
        o.s50("title") ?: "SKOLE · FRA FAMILIE › STEDER", pl?.s50("id"), pl?.s50("name"), objs50(o.optJSONArray("areas")).mapNotNull(::area50),
        o.optJSONObject("edit")?.s50("label"), o.optJSONObject("empty")?.s50("text"), o.optJSONObject("empty")?.s50("action"),
    )
}

/* ======================= Henting og handlinger ======================= */

private fun enc50(s: String) = URLEncoder.encode(s, "UTF-8")

/** Telefonens siste kjente posisjon (bare for innsjekk og sortering av regioner – sendes aldri kontinuerlig herfra). */
@SuppressLint("MissingPermission")
internal fun lastFix50(ctx: Context): Location? {
    if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
        ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    return runCatching {
        listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            .mapNotNull { p -> runCatching { lm.getLastKnownLocation(p) }.getOrNull() }.maxByOrNull { it.time }
    }.getOrNull()
}

private fun posQuery50(l: Location?): String =
    if (l == null) "" else String.format(Locale.US, "?lat=%.6f&lon=%.6f&acc=%.0f", l.latitude, l.longitude, if (l.hasAccuracy()) l.accuracy else 50f)

/** Folk, I DAG, Steder og Helse (det som trengs for fanen). Feiler people50 med 404, vises den gamle siden. */
fun AppViewModel.loadFam50(tab: String? = null) {
    val s = fam50
    s.lastLoad = System.currentTimeMillis()
    scope50.launch {
        try {
            val o = JSONObject(api50 { hlGet("/family/people50", timeout = 12_000) })
            s.people = objs50(o.optJSONArray("people")).mapNotNull(::person50)
            s.title = o.s50("title") ?: "Familie"
            s.subtitle = o.s50("subtitle") ?: ""
            s.missing = false
            s.error = null
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404) s.missing = true else if (s.people == null) s.error = e.message
        } catch (e: Exception) { if (s.people == null) s.error = "Kunne ikke lese Familie fra serveren." }
        if (s.missing) return@launch
        runCatching { s.today = objs50(JSONObject(api50 { hlGet("/family/today50") }).optJSONArray("items")).map(::item50) }
        if (tab == null || tab == "steder" || s.places == null) loadPlaces50()
        if (tab == null || tab == "helse" || s.health == null) loadHealth50()
        if (tab == "sjekk") loadCheckin50()
    }
}

fun AppViewModel.loadPlaces50() {
    val s = fam50
    scope50.launch {
        runCatching {
            val o = JSONObject(api50 { hlGet("/family/places") })
            s.places = objs50(o.optJSONArray("places")).mapNotNull(::place50)
            o.optJSONArray("types")?.let { a -> s.placeTypes = (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() }.ifEmpty { s.placeTypes } }
        }
    }
}

fun AppViewModel.loadHealth50() {
    val s = fam50
    scope50.launch {
        runCatching {
            val o = JSONObject(api50 { hlGet("/family/health50") })
            s.health = objs50(o.optJSONArray("people")).mapNotNull(::health50)
            s.healthSummary = o.s50("summary")
        }
    }
}

/** Helse for én person (Personside og 5b). */
fun AppViewModel.loadPersonHealth50(userId: String) {
    val s = fam50
    scope50.launch {
        runCatching { health50(JSONObject(api50 { hlGet("/family/health50/" + enc50(userId)) })) }.getOrNull()?.let { s.personHealth = s.personHealth + (userId to it) }
    }
}

fun AppViewModel.requestHealth50(h: FamHealth50) = launch50 {
    val r = JSONObject(api50 { hlPost("/family/health50/" + enc50(h.av.userId) + "/request") })
    flash(r.s50("text") ?: if (r.optBoolean("throttled")) "Du har allerede spurt nylig" else "Spurte ${h.av.name.split(' ').first()} om deling")
}

fun AppViewModel.loadCheckin50() {
    val s = fam50
    scope50.launch {
        runCatching {
            val o = JSONObject(api50 { hlGet("/family/checkin" + posQuery50(lastFix50(appCtx50)), timeout = 12_000) })
            val log = o.optJSONObject("log")
            s.checkin = FamCheckinTab50(
                suggest50(o.optJSONObject("suggestion")), objs50(o.optJSONArray("suggestions")).mapNotNull(::suggest50),
                objs50(o.optJSONArray("quick")).mapNotNull { q -> q.s50("id")?.let { FamQuick50(it, q.s50("text") ?: it, q.s50("priority") == "high") } },
                objs50(o.optJSONArray("people")).mapNotNull(::av50), checkin50(o.optJSONObject("latest")),
                objs50(o.optJSONArray("requests")).mapNotNull(::checkin50), objs50(log?.optJSONArray("items")).map(::item50), log?.s50("title") ?: "I DAG I FAMILIEN",
            )
        }
    }
}

/** «Sjekk inn til …». Posisjonen sendes bare med selve innsjekken. */
fun AppViewModel.sendCheckin50(to: List<String>, quick: String?, text: String?, place: FamSuggest50?, remindInMin: Int?) {
    val s = fam50
    if (to.isEmpty()) { flash("Velg hvem som skal få beskjed"); return }
    s.sending = true
    launch50 {
        try {
            val fix = lastFix50(appCtx50)
            val b = JSONObject().put("to", JSONArray(to))
            if (quick != null) b.put("quick", quick)
            if (!text.isNullOrBlank()) b.put("text", text.trim())
            if (place != null) {
                b.put("place", JSONObject().put("name", place.title).apply { place.detail?.let { put("detail", it) } })
                place.eventTitle?.let { b.put("eventTitle", it) }
            }
            val la = place?.lat ?: fix?.latitude
            val lo = place?.lon ?: fix?.longitude
            if (la != null && lo != null) { b.put("lat", la).put("lon", lo); (place?.acc ?: fix?.accuracy?.toDouble())?.let { b.put("acc", it) } }
            if (remindInMin != null) b.put("remindInMin", remindInMin)
            s.replyTo?.let { b.put("requestId", it.toIntOrNull() ?: it) }
            api50 { hlPost("/family/checkin", b) }
            Haptics.success()
            s.replyTo = null
            s.showSent = true
            loadCheckin50()
        } finally { s.sending = false }
    }
}

fun AppViewModel.requestCheckin50(to: List<String>) {
    if (to.isEmpty()) { flash("Velg hvem du vil spørre"); return }
    launch50 {
        api50 { hlPost("/family/checkin/request", JSONObject().put("to", JSONArray(to))) }
        flash("Spurte om innsjekk")
        loadCheckin50()
    }
}

/** «Hent meg» på 6b-kortet: samme mottakere, med posisjonen nå. */
fun AppViewModel.pickup50(c: FamCheckin50) = launch50 {
    val fix = lastFix50(appCtx50)
    val b = JSONObject()
    if (fix != null) b.put("lat", fix.latitude).put("lon", fix.longitude).put("acc", fix.accuracy.toDouble())
    api50 { hlPost("/family/checkin/" + enc50(c.id) + "/pickup", b) }
    flash("Ba om å bli hentet")
    loadCheckin50()
}

fun AppViewModel.replyCheckin50(id: String, reply: String) = launch50 {
    val b = JSONObject().put("reply", reply)
    if (reply == "pickup") lastFix50(appCtx50)?.let { b.put("lat", it.latitude).put("lon", it.longitude) }
    val r = JSONObject(api50 { hlPost("/family/checkin/" + enc50(id) + "/reply", b) })
    Checkin50Notify.cancel(appCtx50, id)
    when (reply) {
        "call" -> r.optJSONObject("call")?.s50("phone")?.let { dial50(appCtx50, it) } ?: flash("Fant ikke telefonnummeret")
        "pickup" -> flash("Sa fra at du kommer")
        else -> flash("Svarte 👍")
    }
    loadCheckin50()
}

fun AppViewModel.seenCheckin50(id: String) { scope50.launch { runCatching { api50 { hlPost("/family/checkin/" + enc50(id) + "/seen") } } } }

internal fun dial50(ctx: Context, phone: String?) {
    val i = Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + (phone ?: "").filter { it.isDigit() || it == '+' })).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { ctx.startActivity(i) }
}

/* ----- Steder ----- */

private fun areaJson50(name: String, lat: Double, lon: Double, r: Int) =
    JSONObject().put("name", name.trim().ifBlank { "Område" }).put("lat", lat).put("lon", lon).put("radius_m", r.coerceIn(25, 1000))

private suspend fun AppViewModel.afterPlaces50() { loadPlaces50(); refreshRegions50(); loadSchool50(); loadFamily() }

/** Nytt sted med ett eller flere områder. onDone får id-en til det nye stedet. */
fun AppViewModel.createPlace50(name: String, type: String, areas: List<FamArea50>, onDone: (String?) -> Unit) = launch50 {
    val a = JSONArray().apply { areas.forEach { put(areaJson50(it.name, it.lat, it.lon, it.radius)) } }
    val r = JSONObject(api50 { hlPost("/family/places", JSONObject().put("name", name.trim().ifBlank { "Sted" }).put("type", type).put("areas", a)) })
    flash("${name.ifBlank { "Stedet" }} er lagret")
    afterPlaces50()
    onDone(r.s50("id") ?: r.optJSONObject("place")?.s50("id"))
}

fun AppViewModel.patchPlace50(id: String, body: JSONObject) = launch50 {
    api50 { request("PATCH", "/family/places/" + enc50(id), body, prefix = Api.HOMELAB) }
    afterPlaces50()
}

fun AppViewModel.deletePlace50(p: FamPlace50, onDone: () -> Unit) = launch50 {
    api50 { hlDelete("/family/places/" + enc50(p.id)) }
    flash("${p.name} er slettet")
    afterPlaces50()
    onDone()
}

fun AppViewModel.addArea50(placeId: String, name: String, lat: Double, lon: Double, r: Int) = launch50 {
    api50 { hlPost("/family/places/" + enc50(placeId) + "/areas", areaJson50(name, lat, lon, r)) }
    afterPlaces50()
}

fun AppViewModel.patchArea50(placeId: String, areaId: String, name: String?, r: Int?) = launch50 {
    val b = JSONObject()
    if (name != null) b.put("name", name.trim().ifBlank { "Område" })
    if (r != null) b.put("radius_m", r.coerceIn(25, 1000))
    api50 { request("PATCH", "/family/places/" + enc50(placeId) + "/areas/" + enc50(areaId), b, prefix = Api.HOMELAB) }
    afterPlaces50()
}

fun AppViewModel.deleteArea50(p: FamPlace50, a: FamArea50) {
    if (p.areas.size <= 1) { message = "Det siste området kan ikke fjernes. Slett heller stedet."; return }
    launch50 {
        try { api50 { hlDelete("/family/places/" + enc50(p.id) + "/areas/" + enc50(a.id)) } } catch (e: ApiException) {
            if (e.status == 409) { message = "Det siste området kan ikke fjernes. Slett heller stedet."; return@launch50 } else throw e
        }
        afterPlaces50()
    }
}

/** Varsel når en person kommer til / drar fra stedet (eksisterende /zones/:id/notify – et sted er en sone). */
fun AppViewModel.notifyPlace50(placeId: String, userId: String, on: Boolean) = launch50 {
    api50 { hlPut("/family/zones/" + enc50(placeId) + "/notify", JSONObject().put("userId", userId).put("enter", on).put("leave", on)) }
    loadPlaces50()
}

/* ----- Ruter › Min reise ----- */

fun AppViewModel.loadSchool50() {
    val s = fam50
    scope50.launch {
        try {
            s.school = school50(JSONObject(api50 { hlGet("/ruter/school50") }))
            s.schoolMissing = false
        } catch (e: CancellationException) { throw e } catch (e: ApiException) { if (e.status == 404) s.schoolMissing = true } catch (_: Exception) {}
    }
}

/** «Endre i Steder ›» / «Legg til i Steder ›» fra Ruter: Familie på Steder-fanen med skolen (eller et nytt skole-sted) åpent. */
fun AppViewModel.openSteder50(placeId: String?, newType: String? = null) {
    openFamily()
    famTab = "steder"
    fam50.sub = "sted"
    fam50.placeSel = placeId ?: "new"
    if (placeId == null) fam50.newType = newType ?: "skole"
}

/* ----- Geofencing ----- */

/** Regionene for denne enheten (én per område, maks 20) registreres på nytt. Eldre server: skolesonene som før (Live41). */
suspend fun AppViewModel.refreshRegions50() {
    val s = fam50
    try {
        val o = JSONObject(api50 { hlGet("/family/places/regions" + posQuery50(lastFix50(appCtx50))) })
        val list = objs50(o.optJSONArray("regions")).mapNotNull { r ->
            val id = r.s50("id") ?: return@mapNotNull null
            FamRegion50(id, r.s50("placeId") ?: id.substringBefore(':'), r.s50("type") ?: "annet", r.s50("name") ?: r.s50("place") ?: "Sted",
                r.d50("lat") ?: return@mapNotNull null, r.d50("lon") ?: return@mapNotNull null, r.d50("radius_m") ?: 150.0)
        }
        s.regionsOk = true
        s.regionsVersion = o.optLong("version", -1L)
        Geofence50.apply(appCtx50, list)
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 404) s.regionsOk = false
    } catch (_: Exception) {}
}

/** WebSocket `family`: steder endret → regioner, Steder og Ruter-skolen på nytt; innsjekk → Sjekk inn og I DAG på nytt. */
fun AppViewModel.onFamilyWs50(msg: JSONObject) {
    when (msg.optString("kind")) {
        "places" -> scope50.launch {
            refreshRegions50()
            if (familyOpen) loadPlaces50()
            loadSchool50()
        }
        "checkin" -> if (familyOpen) {
            loadCheckin50()
            scope50.launch { runCatching { fam50.today = objs50(JSONObject(api50 { hlGet("/family/today50") }).optJSONArray("items")).map(::item50) } }
        }
        // Posisjoner o.l.: Folk og I DAG på nytt, høyst hvert 5. sekund.
        else -> if (familyOpen && !fam50.missing && System.currentTimeMillis() - fam50.lastLoad > 5_000) loadFam50("folk")
    }
}

/** WebSocket `notify` (samme varsel som køen): innsjekk/forespørsel/svar vises som systemvarsel med handlinger med en gang. */
fun AppViewModel.onNotify50(msg: JSONObject) {
    val d = msg.optJSONObject("data") ?: return
    if (!Checkin50Notify.handles(d) || msg.optBoolean("silent")) return
    val key = "n50-" + (msg.s50("id") ?: msg.s50("tag") ?: msg.toString().hashCode().toString())
    if (key in Notify31.seen(appCtx50)) return
    Checkin50Notify.show(appCtx50, msg.s50("title") ?: "Familie", msg.s50("body") ?: "", d)
    Notify31.markSeen(appCtx50, key)
    if (familyOpen) loadCheckin50()
}

/** finanshub://familie[/sjekk|/steder|/helse][?id=…&act=call|ok|pickup&request=…] (varslene). */
fun AppViewModel.familyLink50(uri: Uri) {
    openFamily()
    val path = uri.path?.trim('/').orEmpty()
    when (path) {
        "sjekk", "sjekkinn", "checkin" -> famTab = "sjekk"
        "steder" -> famTab = "steder"
        "helse" -> famTab = "helse"
    }
    val id = runCatching { uri.getQueryParameter("id") }.getOrNull()
    val req = runCatching { uri.getQueryParameter("request") }.getOrNull()
    when (val act = runCatching { uri.getQueryParameter("act") }.getOrNull()) {
        "call", "ok", "pickup" -> if (id != null) replyCheckin50(id, act)
        else -> if (id != null) seenCheckin50(id)
    }
    if (req != null) { fam50.replyTo = req; fam50.showSent = false; seenCheckin50(req) }
}

/** Bilde for en avatar (cache i minnet). */
suspend fun AppViewModel.photo50(url: String?): Bitmap? {
    if (url.isNullOrBlank() || !url.startsWith("/")) return null
    fam50.photoCache.get(url)?.let { return it }
    val b = image(url) ?: return null
    fam50.photoCache.put(url, b)
    return b
}

/* ======================= Geofencing (nærhetsvarsler) ======================= */

object Geofence50 {
    const val ACTION = "no.kristo.finanshub.GEO50"
    private const val PREF = "geo50"

    private fun pi(ctx: Context, id: String): PendingIntent = PendingIntent.getBroadcast(ctx, 7600,
        Intent(ctx, Geofence50Receiver::class.java).setAction(ACTION).setData(Uri.parse("geo50://r/" + Uri.encode(id))).putExtra("region", id),
        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /**
     * Registrerer regionene (maks 20). Skole-områdene lagres også som skolesoner (Live41), så «forlot skolen» etter 2 min og
     * ankomst virker som før – nå for alle områdene i skole-stedet. Delingstjenesten får alle områdene som sonekanter.
     */
    @SuppressLint("MissingPermission")
    fun apply(ctx: Context, regions: List<FamRegion50>) {
        val list = regions.take(20)
        runCatching { FamilyPrefs.setZones(ctx, list.map { Triple(it.id, it.lat to it.lon, it.radius) }) }
        val sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val arr = JSONArray()
        list.forEach { r -> arr.put(JSONObject().put("id", r.id).put("type", r.type).put("name", r.name).put("lat", r.lat).put("lon", r.lon).put("r", r.radius)) }
        val old = runCatching { JSONArray(sp.getString("regions", "[]")) }.getOrDefault(JSONArray())
        sp.edit().putString("regions", arr.toString()).apply()
        // Skole-områdene som skolesoner (uten egne nærhetsvarsler: de kommer herfra).
        SchoolZones41.saveOnly50(ctx, list.filter { it.type == "skole" }.map { Zone41(it.id, it.name, it.lat, it.lon, it.radius.toInt(), "${it.name} ${it.radius.toInt()} m") })
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
        for (i in 0 until old.length()) old.optJSONObject(i)?.optString("id")?.let { runCatching { lm.removeProximityAlert(pi(ctx, it)) } }
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        for (r in list) runCatching { lm.addProximityAlert(r.lat, r.lon, r.radius.toFloat(), -1, pi(ctx, r.id)) }
    }

    internal fun region(ctx: Context, id: String): JSONObject? {
        val a = runCatching { JSONArray(ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString("regions", "[]")) }.getOrNull() ?: return null
        return (0 until a.length()).mapNotNull { a.optJSONObject(it) }.firstOrNull { it.optString("id") == id }
    }
}

/**
 * Inn i / ut av et område: skole-områder går videre til skolesonene (Ruter, 2-minuttersregelen i Live41). Deler du posisjonen,
 * sendes siste posisjon med en gang, så serveren ser «kom/forlot» uten å vente på neste sending.
 */
class Geofence50Receiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra("region") ?: return
        if (!intent.hasExtra(LocationManager.KEY_PROXIMITY_ENTERING)) return
        val entering = intent.getBooleanExtra(LocationManager.KEY_PROXIMITY_ENTERING, false)
        val r = Geofence50.region(ctx, id)
        if (r?.optString("type") == "skole") {
            runCatching {
                ctx.sendBroadcast(Intent(ctx, SchoolZone41Receiver::class.java).setAction(SchoolZones41.ACTION).putExtra("zone", id)
                    .putExtra(LocationManager.KEY_PROXIMITY_ENTERING, entering))
            }
        }
        if (!FamilyPrefs.sharing(ctx)) return
        val fix = lastFix50(ctx) ?: return
        val pend = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val api = FamilyPrefs.api(ctx) ?: return@launch
                val o = JSONObject().put("lat", fix.latitude).put("lon", fix.longitude)
                    .put("acc", if (fix.hasAccuracy()) fix.accuracy.toDouble() else JSONObject.NULL)
                    .put("device", Build.MODEL).put("deviceId", no.kristo.finanshub.family.installId24(ctx)).put("platform", "android")
                    .put("ts", System.currentTimeMillis())
                no.kristo.finanshub.family.FamilyService.battery(ctx)?.let { (lvl, ch) -> if (FamilyPrefs.sensors(ctx)) o.put("battery", lvl).put("charging", ch) }
                val res = runCatching { JSONObject(api.hlPost("/family/location", o)) }.getOrNull()
                runCatching { ZoneNotify45.postEvents(ctx, api, res?.optJSONArray("events")) }
            } finally { pend.finish() }
        }
    }
}

/* ======================= Varsler: Sjekk inn ======================= */

object Checkin50Notify {
    const val CH = "sjekkinn"
    const val CH_HIGH = "sjekkinn-hast"
    const val ACT = "no.kristo.finanshub.CHECKIN50"

    fun handles(d: JSONObject): Boolean = d.optString("kind").let { it.startsWith("checkin.") || it == "health.request" }

    private fun channels(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CH) == null) nm.createNotificationChannel(NotificationChannel(CH, "Sjekk inn", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Innsjekk, forespørsler og svar fra familien"
        })
        if (nm.getNotificationChannel(CH_HIGH) == null) nm.createNotificationChannel(NotificationChannel(CH_HIGH, "Sjekk inn · Hent meg (haster)", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "«Hent meg» fra familien – tidskritisk, med posisjon"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 600)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            runCatching { setBypassDnd(true) }
        })
    }

    private fun on(ctx: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            ctx.getSharedPreferences("notify_prefs", Context.MODE_PRIVATE).getBoolean("on", true)

    private fun nid(id: String) = ("checkin50-$id").hashCode()

    /** Det monokrome app-ikonet (samme som de andre varslene), slått opp ved navn; reserve: app-ikonet. */
    private fun smallIcon(ctx: Context): Int =
        ctx.resources.getIdentifier("ic_launcher_monochrome", "drawable", ctx.packageName).takeIf { it != 0 } ?: ctx.applicationInfo.icon

    fun cancel(ctx: Context, id: String) { runCatching { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(nid(id)) } }

    private fun link(ctx: Context, q: String, code: Int): PendingIntent {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://familie/sjekk$q")).setPackage(ctx.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun reply(ctx: Context, id: String, r: String): PendingIntent = PendingIntent.getBroadcast(ctx, ("$id-$r").hashCode(),
        Intent(ctx, Checkin50Receiver::class.java).setAction(ACT).setData(Uri.parse("checkin50://$id/$r")).putExtra("id", id).putExtra("reply", r),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** Varsel fra køen eller sanntid. data.kind: checkin.checkin | checkin.request | checkin.pickup | checkin.reply | checkin.reminder | health.request. */
    fun show(ctx: Context, title: String, body: String, d: JSONObject) {
        if (!on(ctx)) return
        channels(ctx)
        val kind = d.optString("kind")
        val id = d.s50("checkinId") ?: d.s50("id") ?: d.s50("requestId") ?: ""
        val high = d.optString("priority") == "high" || kind == "checkin.pickup" || d.optString("channel") == CH_HIGH
        val code = nid(id + kind)
        val b = Notification.Builder(ctx, if (high) CH_HIGH else CH)
            .setSmallIcon(smallIcon(ctx))
            .setContentTitle(title).setContentText(body).setStyle(Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true).setCategory(if (high) Notification.CATEGORY_ALARM else Notification.CATEGORY_MESSAGE)
            .setColor(0xFFB23A2A.toInt())
        when (kind) {
            "health.request" -> b.setContentIntent(PendingIntent.getActivity(ctx, code,
                Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://familie/helse")).setPackage(ctx.packageName)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            "checkin.request" -> {
                b.setContentIntent(link(ctx, "?request=" + Uri.encode(id), code))
                if (id.isNotBlank()) {
                    b.addAction(Notification.Action.Builder(null, "👍 Alt bra", reply(ctx, id, "ok")).build())
                    b.addAction(Notification.Action.Builder(null, "Sjekk inn", link(ctx, "?request=" + Uri.encode(id), code + 1)).build())
                }
            }
            "checkin.checkin", "checkin.pickup" -> {
                b.setContentIntent(link(ctx, "?id=" + Uri.encode(id), code))
                if (id.isNotBlank()) {
                    if (kind == "checkin.checkin") b.addAction(Notification.Action.Builder(null, "👍", reply(ctx, id, "ok")).build())
                    b.addAction(Notification.Action.Builder(null, "Ring", link(ctx, "?id=" + Uri.encode(id) + "&act=call", code + 2)).build())
                    b.addAction(Notification.Action.Builder(null, "Hent", reply(ctx, id, "pickup")).build())
                }
                if (kind == "checkin.pickup" && d.has("lat") && d.has("lon")) {
                    val geo = Intent(Intent.ACTION_VIEW, Uri.parse(String.format(Locale.US, "geo:%.6f,%.6f?q=%.6f,%.6f", d.optDouble("lat"), d.optDouble("lon"), d.optDouble("lat"), d.optDouble("lon"))))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    b.addAction(Notification.Action.Builder(null, "Kart", PendingIntent.getActivity(ctx, code + 3, geo, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)).build())
                }
            }
            else -> b.setContentIntent(link(ctx, if (id.isNotBlank()) "?id=" + Uri.encode(id) else "", code))
        }
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(if (kind == "checkin.reply" || kind == "checkin.reminder") code else nid(id), b.build()) } catch (_: SecurityException) {}
    }
}

/** 👍 / Hent fra varselet: POST /family/checkin/:id/reply uten å åpne appen. */
class Checkin50Receiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val reply = intent.getStringExtra("reply") ?: return
        Checkin50Notify.cancel(ctx, id)
        val fix = if (reply == "pickup") lastFix50(ctx) else null
        val pend = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val api = FamilyPrefs.api(ctx) ?: bgApi41(ctx) ?: return@launch
                val b = JSONObject().put("reply", reply)
                if (fix != null) b.put("lat", fix.latitude).put("lon", fix.longitude)
                runCatching { api.hlPost("/family/checkin/" + enc50(id) + "/reply", b) }
            } finally { pend.finish() }
        }
    }
}

/** Fra køen (/api/notify/pending, Notify31): true når varselet ble vist her. */
internal fun pendingCheckin50(ctx: Context, x: JSONObject, tag: String): Boolean {
    val d = x.optJSONObject("data") ?: return false
    if (!Checkin50Notify.handles(d)) return false
    val key = "n50-" + (x.s50("id") ?: tag)
    if (key !in Notify31.seen(ctx)) {
        Checkin50Notify.show(ctx, x.s50("title") ?: "Familie", x.s50("body") ?: x.s50("text") ?: "", d)
        Notify31.markSeen(ctx, key)
    }
    return true
}
