@file:JvmName("DomeneVaer")

package no.kristo.finanshub

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.location.Location
import android.location.LocationManager
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.Locale
import kotlin.coroutines.resume
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.felles.nett.openSikker
import org.json.JSONArray
import org.json.JSONObject

/*
 * Vær: kode som lå i blandingsfilene (P41.kt, P45.kt, P45b.kt, P46.kt, P52B.kt, Models.kt, Models.kt, Models.kt, Models.kt, Models22.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

data class VaerLay41(val ord: List<String>, val hid: Set<String>, val ski: Boolean)

data class Ski41(val depth: Double, val fresh: Double, val t: Double, val rh: Double, val thaw: Boolean, val at: Long) { val has: Boolean get() = depth >= .15 }

/* ======================= Vær: rediger kort og skiføre ======================= */

val VAER_KEYS41 = listOf("hero", "ski", "hour", "days", "cmp", "wind", "moon", "tiles", "glimt")

val VAER_NAMES41 = mapOf("hero" to ("Nå" to "Temperatur og sted"), "ski" to ("Skiføre" to "Glimt anbefaler smøring · vises når det er snø"),
    "hour" to ("Time for time" to ""), "days" to ("10 dager" to ""), "cmp" to ("Yr mot Storm" to ""), "wind" to ("Vind" to ""), "moon" to ("Måne" to ""),
    "tiles" to ("Detaljer" to "Sol, UV, følt, nedbør, sikt, fuktighet, trykk"), "glimt" to ("Glimt · uka" to "Ukas vær mot forrige uke"))

/** vaer_layout (per bruker, lagret på enheten): rekkefølge, skjulte og «Skiføre» av/på. */
fun AppViewModel.vaerLay41(): VaerLay41 {
    p41.vaerLay?.let { return it }
    val raw = prefs41().getString("vaer_layout_" + (account?.id ?: ""), null)
    val o = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
    val ord0 = o?.optJSONArray("ord")?.let { a -> (0 until a.length()).map { a.optString(it) } }?.filter { it in VAER_KEYS41 } ?: emptyList()
    val l = VaerLay41(ord0 + VAER_KEYS41.filter { it !in ord0 }, o?.optJSONArray("hid")?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet(), o?.optBoolean("ski", true) ?: true)
    p41.vaerLay = l
    return l
}

fun AppViewModel.setVaerLay41(l: VaerLay41) {
    p41.vaerLay = l
    prefs41().edit().putString("vaer_layout_" + (account?.id ?: ""), JSONObject().put("ord", JSONArray(l.ord)).put("hid", JSONArray(l.hid.toList())).put("ski", l.ski).toString()).apply()
}

fun AppViewModel.skiShow41(): Boolean { loadSki41(); return vaerLay41().ski && p41.ski?.has == true }

/** Open-Meteo for Nordmarka (59.99, 10.67): snødybde, snøfall siste 3 dager, temperatur, fukt og maks-temp (tining). Hver 30. min. */
fun AppViewModel.loadSki41() {
    val s = p41
    if (System.currentTimeMillis() - s.skiAt < 30 * 60_000L) return
    s.skiAt = System.currentTimeMillis()
    launch41 {
        runCatching {
            val body = withContext(Dispatchers.IO) {
                val c = java.net.URL("https://api.open-meteo.com/v1/forecast?latitude=59.99&longitude=10.67&current=temperature_2m,relative_humidity_2m,snow_depth&daily=snowfall_sum,temperature_2m_max,temperature_2m_min&past_days=3&forecast_days=1&timezone=auto").openSikker()
                c.connectTimeout = 6000; c.readTimeout = 8000
                try { c.inputStream.bufferedReader().use { it.readText() } } finally { c.disconnect() }
            }
            val o = JSONObject(body); val cur = o.getJSONObject("current"); val d = o.getJSONObject("daily")
            val sf = d.optJSONArray("snowfall_sum"); val mx = d.optJSONArray("temperature_2m_max")
            val fresh = (0 until minOf(4, sf?.length() ?: 0)).sumOf { sf!!.optDouble(it, 0.0).let { v -> if (v.isNaN()) 0.0 else v } }
            val max = (0 until minOf(4, mx?.length() ?: 0)).maxOfOrNull { mx!!.optDouble(it, 0.0) } ?: 0.0
            s.ski = Ski41(cur.optDouble("snow_depth", 0.0), fresh, cur.optDouble("temperature_2m", -4.0), cur.optDouble("relative_humidity_2m", 0.0), max > .5, System.currentTimeMillis())
        }
    }
}

/** Reglene for feste og glid (reserve når Glimt ikke skriver teksten): (feste, smøring, forklaring, glid). */
fun skiAdvice41(x: Ski41): List<String> {
    val t = x.t; val fresh = x.fresh; val icy = (fresh < 1) && x.thaw
    val (kick, wax, txt) = when {
        icy -> Triple("Blå klister", "Blå klister · skareføre", "Snøen har tint og frosset igjen. Bruk blå klister i festesonen, varm det inn og la det kjølne før du går.")
        t <= -10 -> Triple("Grønn (V20)", "Grønn voks · kaldt og tørt", "Kald og tørr snø. Tynne lag grønn voks, kork godt. Gir godt feste og fin glid.")
        t <= -3 -> { val k = if (fresh >= 2) "Blå (V30)" else "Blå ekstra (V40)"
            Triple(k, k + " · " + if (fresh >= 2) "nysnø" else "fint føre",
                if (fresh >= 2) "Nysnø i marka (${Math.round(fresh)} cm siste dager). Blå voks i 3–4 tynne lag gir feste uten at det ises." else "Stabilt vinterføre. Blå ekstra holder godt; legg på et ekstra lag hvis du glipper i motbakkene.") }
        t <= 0 -> Triple("Fiolett (V45)", "Fiolett · rundt null", "Rundt null grader og fuktig. Fiolett voks, og ha rød i lomma hvis sola kommer fram. Se opp for ising i skyggen.")
        else -> Triple("Rød (V55) / universalklister", "Rød voks eller klister · vått føre", "Plussgrader og våt snø. Rød voks på ny snø, universalklister hvis snøen er grovkornet. Felleski er et godt valg i dag.")
    }
    val glide = if (t <= -8) "Kald (blå)" else if (t <= -2) "Universal (fiolett)" else "Varm (gul/rød)"
    return listOf(kick, wax, txt, glide)
}

data class WxHere45(val place: String, val temp: Double?, val text: String?, val hi: Double?, val lo: Double?, val same: Boolean)

/* ======================= Vær: Min posisjon ======================= */

/**
 * Været der telefonen er. [lat]/[lon] fra telefonens siste kjente posisjon (aldri fra serveren eller en annen enhet).
 * Maks hvert 10. minutt (force = trykk på «Tillat»/oppdater).
 */
fun AppViewModel.loadHere45(lat: Double, lon: Double, selLat: Double?, selLon: Double?, force: Boolean = false) {
    val s = p45
    if (!force && s.hereState == "ok" && System.currentTimeMillis() - s.hereAt < 600_000L) return
    s.hereAt = System.currentTimeMillis()
    if (s.here == null) s.hereState = "loading"
    launch45 {
        val q = String.format(java.util.Locale.US, "/weather/here?lat=%.4f&lon=%.4f", lat, lon) +
            (if (selLat != null && selLon != null) String.format(java.util.Locale.US, "&selLat=%.4f&selLon=%.4f", selLat, selLon) else "")
        val raw = try { api45 { hlGet(q, timeout = 12_000) } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.hereState = if (e.status == 404) "missing" else "error"; null
        } catch (e: Exception) { s.hereState = "error"; null } ?: return@launch45
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: run { s.hereState = "error"; return@launch45 }
        val now = o.optJSONObject("now")
        val today = o.optJSONObject("today")
        fun d(x: JSONObject?, k: String): Double? = x?.takeIf { it.has(k) && !it.isNull(k) }?.optDouble(k)?.takeIf { !it.isNaN() }
        s.here = WxHere45(o.optJSONObject("place")?.s45("name") ?: "Her", d(now, "temp"), now?.s45("text"), d(today, "hi"), d(today, "lo"), o.optBoolean("sameAsSelected", false))
        s.hereState = "ok"
    }
}

/* ======================= Vær: Min posisjon ======================= */

private fun AppViewModel.wxKey46() = "vaer_city46_" + (account?.id ?: "")

/** Er «Min posisjon» valgt? Standard for alle som ikke har valgt et sted selv (også eksisterende brukere: «oslo» var aldri et valg). */
fun AppViewModel.wxGps46(): Boolean {
    p46.wxGps?.let { return it }
    val v = prefs.str(wxKey46(), "__gps")
    return (v == "__gps").also { p46.wxGps = it }
}

/** Et sted valgt i Steder (eller «__gps»). Lagres per konto lokalt. */
fun AppViewModel.wxPick46(id: String) {
    val gps = id == "__gps"
    p46.wxGps = gps
    prefs.set(wxKey46(), id)
}

@SuppressLint("MissingPermission")
private fun lastFix46(ctx: Context): Location? {
    if (!no.kristo.finanshub.family.FamilyService.hasLocation(ctx)) return null
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    return runCatching {
        listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            .mapNotNull { p -> runCatching { lm.getLastKnownLocation(p) }.getOrNull() }.maxByOrNull { it.time }
    }.getOrNull()
}

/** Ny posisjon med lav nøyaktighet (nett først), maks 10 s. */
@SuppressLint("MissingPermission")
private suspend fun freshFix46(ctx: Context): Location? {
    if (!no.kristo.finanshub.family.FamilyService.hasLocation(ctx)) return null
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    val prov = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).firstOrNull { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) } ?: return null
    return withTimeoutOrNull(10_000L) {
        suspendCancellableCoroutine { cont ->
            try {
                if (Build.VERSION.SDK_INT >= 30) {
                    val sig = android.os.CancellationSignal()
                    cont.invokeOnCancellation { sig.cancel() }
                    lm.getCurrentLocation(prov, sig, ctx.mainExecutor) { l -> if (cont.isActive) cont.resume(l) }
                } else {
                    @Suppress("DEPRECATION")
                    lm.requestSingleUpdate(prov, object : android.location.LocationListener {
                        override fun onLocationChanged(l: Location) { if (cont.isActive) cont.resume(l) }
                        @Deprecated("") override fun onStatusChanged(p: String?, s: Int, b: android.os.Bundle?) {}
                        override fun onProviderEnabled(p: String) {}
                        override fun onProviderDisabled(p: String) {}
                    }, android.os.Looper.getMainLooper())
                }
            } catch (e: Exception) { if (cont.isActive) cont.resume(null) }
        }
    }
}

/**
 * Hovedværet for «Min posisjon»: siste kjente posisjon (≤ 10 min) med en gang, ellers en ny i bakgrunnen. Stedsnavn fra
 * serveren (GET /api/weather/here → place.name, cache på serveren). Feil: siste kjente posisjon, ellers første lagrede sted –
 * men valget «Min posisjon» beholdes.
 */
fun AppViewModel.openGps46(force: Boolean = false) {
    val ctx = appCtx46
    val s = p46
    if (!no.kristo.finanshub.family.FamilyService.hasLocation(ctx)) {
        s.gpsState = "denied"
        val fallback = s.gpsFix
        if (fallback != null) launch46 { loadGpsWeather46(fallback.first, fallback.second) } else loadWeather(wxPlaces.firstOrNull()?.id ?: "oslo")
        return
    }
    if (!force && s.gpsState == "ok" && System.currentTimeMillis() - s.gpsAt < 600_000L && weatherFull != null && weatherPlace.startsWith("geo:")) return
    s.gpsState = "loading"
    launch46 {
        val last = lastFix46(ctx)?.takeIf { System.currentTimeMillis() - it.time < 600_000L }
        if (last != null) loadGpsWeather46(last.latitude, last.longitude)
        val fresh = freshFix46(ctx) ?: lastFix46(ctx)
        if (fresh == null) {
            if (last == null) {
                s.gpsState = "error"
                val fb = s.gpsFix
                if (fb != null) loadGpsWeather46(fb.first, fb.second) else loadWeather(wxPlaces.firstOrNull()?.id ?: "oslo")
            }
            return@launch46
        }
        val moved = last == null || FloatArray(1).also { Location.distanceBetween(last.latitude, last.longitude, fresh.latitude, fresh.longitude, it) }[0] > 2_000f
        if (moved) loadGpsWeather46(fresh.latitude, fresh.longitude)
    }
}

private suspend fun AppViewModel.loadGpsWeather46(lat: Double, lon: Double) {
    val s = p46
    s.gpsFix = lat to lon
    val name = runCatching {
        val raw = api46 { hlGet(String.format(java.util.Locale.US, "/weather/here?lat=%.4f&lon=%.4f", lat, lon), timeout = 6_000) }
        JSONObject(raw).optJSONObject("place")?.s43("name", "city", "place")
    }.getOrNull() ?: s.gpsName
    s.gpsName = name
    s.gpsAt = System.currentTimeMillis()
    s.gpsState = "ok"
    if (wxGps46()) loadWeather(String.format(java.util.Locale.US, "geo:%.4f,%.4f,%s", lat, lon, (name ?: "Min posisjon").replace(",", " ")))
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

/* ---------------- Vær (MET: Locationforecast + Nowcast + Sunrise) ---------------- */

data class WHour(val label: String, val symbol: String, val temp: Double?, val mm: Double)

data class WDay(val label: String, val symbol: String, val min: Double?, val max: Double?, val mm: Double)

data class WeatherX(
    val symbol: String, val feels: Double?, val hi: Double?, val lo: Double?, val wind: Double?, val gust: Double?, val windDir: String,
    val precip24: Double?, val humidity: Double?, val uv: Double?, val pressure: Double?, val pressureTrend: String,
    val sunrise: Instant?, val sunset: Instant?, val nowcast: String, val hours: List<WHour>, val days: List<WDay>,
)

private fun compass(d: Double?): String = d?.let { listOf("N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV")[(((it % 360 + 360) % 360 + 22.5) / 45).toInt() % 8] } ?: ""

fun parseWeatherX(o: JSONObject): WeatherX {
    // Vind kan være et tall (m/s) eller et objekt {speed, gust, dir}; detaljene ligger også i windInfo og flate felt.
    val w = o.optJSONObject("wind") ?: o.optJSONObject("windInfo")
    val wind = (if (o.opt("wind") is Number) o.optDoubleOrNull("wind") else null) ?: w?.optDoubleOrNull("speed")
    return WeatherX(
        o.optStr("symbol") ?: o.optStr("code") ?: "", o.optDoubleOrNull("feels"), o.optDoubleOrNull("hi") ?: o.optDoubleOrNull("max"), o.optDoubleOrNull("lo") ?: o.optDoubleOrNull("min"),
        wind, o.optDoubleOrNull("windGust") ?: w?.optDoubleOrNull("gust"), o.optStr("windDirText") ?: w?.optStr("dirText") ?: compass(o.optDoubleOrNull("windDir") ?: w?.optDoubleOrNull("dir")),
        o.optDoubleOrNull("precip24"), o.optDoubleOrNull("humidity"), o.optDoubleOrNull("uv"), o.optDoubleOrNull("pressure"), o.optStr("pressureTrend") ?: "",
        o.timeAt("sunrise"), o.timeAt("sunset"), o.optJSONObject("nowcast")?.optStr("text") ?: (o.opt("nowcast") as? String) ?: "",
        o.optJSONArray("hours")?.map { h ->
            val l = h.optStr("label") ?: h.optStr("t") ?: ""
            WHour(if (l.contains('T')) fmtTime(anyTime(l), "HH") else l, h.optStr("symbol") ?: "", h.optDoubleOrNull("temp"), h.optDoubleOrNull("mm") ?: h.optDoubleOrNull("precip") ?: 0.0)
        } ?: emptyList(),
        o.optJSONArray("days")?.map { d ->
            val date = d.optStr("date") ?: ""
            WDay(d.optStr("label") ?: runCatching { LocalDate.parse(date).dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, Locale.forLanguageTag("nb-NO")).replaceFirstChar { it.uppercase() } }.getOrDefault(date),
                d.optStr("symbol") ?: "", d.optDoubleOrNull("min"), d.optDoubleOrNull("max"), d.optDoubleOrNull("mm") ?: 0.0)
        } ?: emptyList(),
    )
}

/* ---------------- Vær (GET /api/weather/full) ---------------- */

data class WxCurrent(
    val temp: Double?, val feels: Double?, val code: Int, val text: String, val isDay: Boolean,
    val wind: Double?, val gust: Double?, val windDir: Double?, val humidity: Double?, val dew: Double?,
    val pressure: Double?, val pressureTrend: String?, val visibility: Double?, val uv: Double?, val precip: Double?,
)

data class WxToday(val hi: Double?, val lo: Double?, val sunrise: String?, val sunset: String?, val daylight: String?, val precipSum: Double?, val precipProb: Double?)

data class WxHour(
    val t: String, val temp: Double?, val feels: Double?, val code: Int, val isDay: Boolean, val precipProb: Double?, val precip: Double?, val wind: Double?, val gust: Double?, val windDir: Double?,
    /** Prompt 22: timedata fra MET for detaljarkene (7 dager). Mangler på eldre server. Sikt i km. */
    val humidity: Double? = null, val uv: Double? = null, val pressure: Double? = null, val visKm: Double? = null,
)

data class WxDay(val date: String, val hi: Double?, val lo: Double?, val code: Int, val precipProb: Double?, val precipSum: Double?, val sunrise: String?, val sunset: String?, val uvMax: Double?, val windMax: Double?)

data class WxMoon(val phase: Double, val illum: Double, val name: String, val nextFull: String?, val nextNew: String?)

data class WeatherFull(
    val placeId: String, val place: String, val lat: Double?, val lon: Double?,
    val current: WxCurrent, val today: WxToday, val yHi: Double?, val yLo: Double?,
    val hours: List<WxHour>, val days: List<WxDay>, val moon: WxMoon?, val nextRainT: String?, val nextRainMm: Double?,
    val kind: String, val yrUrl: String?, val updatedAt: String?, val mock: Boolean,
)

/** Stedene i stedsvelgeren nederst på værskjermen. */
val WX_PLACES: List<Pair<String, String>> = listOf("oslo" to "Oslo", "bergen" to "Bergen", "trondheim" to "Trondheim", "tromso" to "Tromsø")

private fun JSONObject.dOrNull(k: String): Double? = optDoubleOrNull(k)

/** «↑», «↓», «stiger», et tall eller ingenting. */
private fun trendOf(o: JSONObject, k: String): String? {
    if (!o.has(k) || o.isNull(k)) return null
    val v = o.opt(k)
    return when (v) {
        is Number -> if (v.toDouble() > 0.3) "up" else if (v.toDouble() < -0.3) "down" else "flat"
        else -> v.toString().lowercase().let { s ->
            when {
                s.contains("up") || s.contains("stig") || s.contains("↑") -> "up"
                s.contains("down") || s.contains("synk") || s.contains("fall") || s.contains("↓") -> "down"
                else -> "flat"
            }
        }
    }
}

fun parseWeatherFull(s: String): WeatherFull {
    val o = JSONObject(s)
    val pl = o.optJSONObject("place") ?: JSONObject()
    val c = o.optJSONObject("current") ?: JSONObject()
    val td = o.optJSONObject("today") ?: JSONObject()
    val y = o.optJSONObject("yesterday") ?: JSONObject()
    val code = c.optInt("code", 3)
    val cur = WxCurrent(
        c.dOrNull("temp"), c.dOrNull("feels"), code, c.optStr("text") ?: wmoText(code), c.optBoolean("isDay", true),
        c.dOrNull("wind"), c.dOrNull("gust"), c.dOrNull("windDir"), c.dOrNull("humidity"), c.dOrNull("dew"),
        c.dOrNull("pressure"), trendOf(c, "pressureTrend"), c.dOrNull("visibility"), c.dOrNull("uv"), c.dOrNull("precip"),
    )
    val today = WxToday(td.dOrNull("hi"), td.dOrNull("lo"), td.optStr("sunrise"), td.optStr("sunset"), td.optStr("daylight"), td.dOrNull("precipSum"), td.dOrNull("precipProb"))
    val hours = o.optJSONArray("hours")?.map {
        WxHour(it.optString("t"), it.dOrNull("temp"), it.dOrNull("feels"), it.optInt("code", 3), it.optBoolean("isDay", true),
            it.dOrNull("precipProb"), it.dOrNull("precip"), it.dOrNull("wind"), it.dOrNull("gust"), it.dOrNull("windDir"),
            it.dOrNull("humidity") ?: it.dOrNull("rh"), it.dOrNull("uv") ?: it.dOrNull("uvIndex"), it.dOrNull("pressure") ?: it.dOrNull("pressureMsl"),
            (it.dOrNull("visibility") ?: it.dOrNull("vis"))?.let { v -> if (v > 200) v / 1000.0 else v })
    } ?: emptyList()
    val days = o.optJSONArray("days")?.map {
        WxDay(it.optString("date"), it.dOrNull("hi"), it.dOrNull("lo"), it.optInt("code", 3), it.dOrNull("precipProb"), it.dOrNull("precipSum"),
            it.optStr("sunrise"), it.optStr("sunset"), it.dOrNull("uvMax"), it.dOrNull("windMax"))
    } ?: emptyList()
    val moon = o.optJSONObject("moon")?.let { m ->
        val ph = m.optDouble("phase", 0.0).let { if (it.isNaN()) 0.0 else it }
        WxMoon(ph, m.optDouble("illum", 0.0).let { if (it.isNaN()) 0.0 else it }, m.optStr("name") ?: moonName(ph), m.optStr("nextFull"), m.optStr("nextNew"))
    }
    val nr = o.optJSONObject("nextRain")
    return WeatherFull(
        pl.optString("id", "oslo"), pl.optStr("name") ?: "Oslo", pl.dOrNull("lat"), pl.dOrNull("lon"),
        cur, today, y.dOrNull("hi"), y.dOrNull("lo"), hours, days, moon, nr?.optStr("t"), nr?.dOrNull("mm"),
        o.optStr("kind") ?: wxKind(code, cur.isDay), o.optStr("yrUrl"), o.optStr("updatedAt"), o.optBoolean("mock"),
    )
}

/** Norsk tekst for WMO-koden. */
fun wmoText(code: Int): String = when (code) {
    0 -> "Klarvær"
    1 -> "Lettskyet"
    2 -> "Delvis skyet"
    3 -> "Skyet"
    45, 48 -> "Tåke"
    51, 53, 55 -> "Yr"
    56, 57 -> "Underkjølt yr"
    61 -> "Lett regn"
    63 -> "Regn"
    65 -> "Kraftig regn"
    66, 67 -> "Underkjølt regn"
    71 -> "Lett snø"
    73 -> "Snø"
    75 -> "Kraftig snø"
    77 -> "Snøkorn"
    80, 81 -> "Regnbyger"
    82 -> "Kraftige regnbyger"
    85, 86 -> "Snøbyger"
    95 -> "Torden"
    96, 99 -> "Torden med hagl"
    else -> "Skyet"
}

/** Symbol for WMO-koden (dag eller natt). */
fun wmoIcon(code: Int, day: Boolean = true): String = when (code) {
    0 -> if (day) "☀" else "☾"
    1 -> if (day) "🌤" else "☾"
    2 -> if (day) "⛅" else "☁"
    3 -> "☁"
    45, 48 -> "🌫"
    51, 53, 55, 56, 57, 61, 63, 66, 80, 81 -> "🌦"
    65, 67, 82 -> "🌧"
    71, 73, 75, 77, 85, 86 -> "❄"
    95, 96, 99 -> "⛈"
    else -> "☁"
}

/** Himmelen bak værskjermen: klart, skyet, regn, snø, tåke eller natt. */
fun wxKind(code: Int, day: Boolean): String = when {
    !day -> "night"
    code <= 1 -> "clear"
    code in 45..48 -> "fog"
    code in 71..77 || code in 85..86 -> "snow"
    code >= 51 -> "rain"
    else -> "cloudy"
}

fun moonName(phase: Double): String = when {
    phase < 0.03 || phase > 0.97 -> "Nymåne"
    phase < 0.22 -> "Voksende månesigd"
    phase < 0.28 -> "Første kvarter"
    phase < 0.47 -> "Voksende måne"
    phase < 0.53 -> "Fullmåne"
    phase < 0.72 -> "Minkende måne"
    phase < 0.78 -> "Siste kvarter"
    else -> "Minkende månesigd"
}

/** Vindretning i grader som kompassretning. */
fun wxCompass(deg: Double?): String {
    if (deg == null) return "–"
    val dirs = listOf("N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV")
    return dirs[(((deg % 360) + 360) % 360 / 45.0 + 0.5).toInt() % 8]
}

/* ---------- Vær: egne steder ---------- */

data class WxPlace(val id: String, val name: String, val lat: Double, val lon: Double, val region: String)

fun parseWxPlaces(s: String): List<WxPlace> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("places") ?: JSONObject(t).optJSONArray("items") ?: JSONArray()
    return (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        val lat = o.optDoubleOrNull("lat") ?: return@mapNotNull null
        val lon = o.optDoubleOrNull("lon") ?: return@mapNotNull null
        WxPlace(o.optStr("id") ?: "${lat},${lon}", o.optStr("name") ?: "Sted", lat, lon, listOfNotNull(o.optStr("region"), o.optStr("country")).joinToString(", "))
    }
}

/* ---------- Vær: Yr mot Storm (ECMWF) ---------- */

data class CmpHour(val t: String, val yrTemp: Double?, val yrMm: Double?, val ecTemp: Double?, val ecMm: Double?)

data class CmpDay(val date: String, val yrHi: Double?, val yrLo: Double?, val yrMm: Double?, val ecHi: Double?, val ecLo: Double?, val ecMm: Double?, val diffHi: Double?, val agree: Int?)

data class WxCompare(val place: String, val hours: List<CmpHour>, val days: List<CmpDay>, val agreement: Int?)

fun parseWxCompare(s: String): WxCompare {
    val o = JSONObject(s)
    val place = o.optJSONObject("place")?.optStr("name") ?: o.optStr("place") ?: "Oslo"
    val ha = o.optJSONArray("hours") ?: JSONArray()
    val hours = (0 until ha.length()).mapNotNull { i ->
        val h = ha.optJSONObject(i) ?: return@mapNotNull null
        val y = h.optJSONObject("yr"); val e = h.optJSONObject("ecmwf")
        CmpHour(h.optStr("t") ?: "", y?.optDoubleOrNull("temp"), y?.optDoubleOrNull("mm"), e?.optDoubleOrNull("temp"), e?.optDoubleOrNull("mm"))
    }
    val da = o.optJSONArray("days") ?: JSONArray()
    val days = (0 until da.length()).mapNotNull { i ->
        val d = da.optJSONObject(i) ?: return@mapNotNull null
        val y = d.optJSONObject("yr"); val e = d.optJSONObject("ecmwf")
        CmpDay(
            d.optStr("date") ?: "", y?.optDoubleOrNull("hi"), y?.optDoubleOrNull("lo"), y?.optDoubleOrNull("mm"),
            e?.optDoubleOrNull("hi"), e?.optDoubleOrNull("lo"), e?.optDoubleOrNull("mm"), d.optDoubleOrNull("diffHi"),
            if (d.has("agree") && !d.isNull("agree")) d.optInt("agree") else null,
        )
    }
    return WxCompare(place, hours, days, if (o.has("agreement") && !o.isNull("agreement")) o.optInt("agreement") else null)
}

/* ---------- Vær: Yr og Pent ---------- */

/** Én side av sammenligningen for en dag. code = WMO-kode, icon = ikonnøkkel (sun, part, cloud, rain …) når serveren sender den. */
data class CmpSide(val code: Int?, val icon: String?, val max: Double?, val min: Double?, val precip: Double?)

data class CmpDay22(val date: String, val yr: CmpSide?, val pent: CmpSide?, val diff: Double?)

/** Timeverdier: tid «yyyy-MM-ddTHH» → temperatur. */
data class WxCmp22(
    val agreement: String?, val avgDiff: Double?, val days: List<CmpDay22>, val yrHours: Map<String, Double>, val pentHours: Map<String, Double>,
    /** Nedbør per time (mm) når serveren sender den. */
    val yrMm: Map<String, Double> = emptyMap(), val pentMm: Map<String, Double> = emptyMap(),
)

private fun JSONObject.d(k: String): Double? = optDoubleOrNull(k)

/** MET-symbol («partlycloudy_day») til WMO-kode, som i Vaer.dc.html. */
internal fun metSymbolToWmo(s: String): Int = when {
    s.contains("thunder") -> 95
    s.contains("heavysnow") -> 75
    s.contains("snowshowers") -> 85
    s.contains("snow") -> 73
    s.contains("sleet") -> 67
    s.contains("heavyrain") -> 65
    s.contains("rainshowers") -> 81
    s.contains("lightrain") -> 61
    s.contains("rain") -> 63
    s.contains("fog") -> 45
    s.startsWith("cloudy") -> 3
    s.contains("partlycloudy") -> 2
    s.contains("fair") -> 1
    else -> 0
}

private val ICON_KEYS = setOf("sun", "moon", "part", "cloud", "rain", "snow", "fog", "storm")

private fun sideOf(o: JSONObject?): CmpSide? {
    if (o == null) return null
    var code: Int? = null
    var icon: String? = null
    when (val v = o.opt("icon") ?: o.opt("code")) {
        is Number -> code = v.toInt()
        is String -> if (v in ICON_KEYS) icon = v else if (v.isNotBlank()) code = v.toIntOrNull() ?: metSymbolToWmo(v)
    }
    if (code == null && o.has("code") && !o.isNull("code")) code = o.optInt("code")
    return CmpSide(code, icon, o.d("max") ?: o.d("hi"), o.d("min") ?: o.d("lo"), o.d("precip") ?: o.d("mm"))
}

private fun tempOf(v: Any?): Double? = when (v) {
    is Number -> v.toDouble().takeIf { !it.isNaN() }
    is JSONObject -> v.optDoubleOrNull("temp") ?: v.optDoubleOrNull("t")
    else -> null
}

private fun mmOf(v: Any?): Double? = (v as? JSONObject)?.let { it.optDoubleOrNull("mm") ?: it.optDoubleOrNull("precip") }

private fun hourKey(t: String): String = t.take(13)

/** compare fra /weather/full (prompt 22) eller svaret fra /weather/compare (prompt 17: yr/ecmwf med hi/lo/mm). null = ingenting å vise. */
fun parseWxCmp22(o: JSONObject?): WxCmp22? {
    if (o == null) return null
    val da = o.optJSONArray("days") ?: JSONArray()
    val days = (0 until da.length()).mapNotNull { i ->
        val d = da.optJSONObject(i) ?: return@mapNotNull null
        val yr = sideOf(d.optJSONObject("yr"))
        val pent = sideOf(d.optJSONObject("pent") ?: d.optJSONObject("ecmwf") ?: d.optJSONObject("storm"))
        val diff = d.d("diff") ?: d.d("diffHi") ?: if (yr?.max != null && pent?.max != null) yr.max - pent.max else null
        CmpDay22(d.optStr("date") ?: "", yr, pent, diff)
    }
    val ha = o.optJSONArray("hours") ?: JSONArray()
    val yrH = HashMap<String, Double>()
    val pH = HashMap<String, Double>()
    val yM = HashMap<String, Double>()
    val pM = HashMap<String, Double>()
    for (i in 0 until ha.length()) {
        val h = ha.optJSONObject(i) ?: continue
        val t = h.optStr("time") ?: h.optStr("t") ?: continue
        tempOf(h.opt("yr"))?.let { yrH[hourKey(t)] = it }
        val pv = h.opt("pent") ?: h.opt("ecmwf") ?: h.opt("storm")
        tempOf(pv)?.let { pH[hourKey(t)] = it }
        mmOf(h.opt("yr"))?.let { yM[hourKey(t)] = it }
        mmOf(pv)?.let { pM[hourKey(t)] = it }
    }
    if (days.isEmpty() && pH.isEmpty()) return null
    val ag = when (val a = o.opt("agreement")) {
        is String -> a.takeIf { it in setOf("good", "mid", "bad") }
        is Number -> if (a.toInt() >= 80) "good" else if (a.toInt() >= 55) "mid" else "bad"
        else -> null
    }
    return WxCmp22(ag, o.d("avgDiff"), days, yrH, pH, yM, pM)
}
