package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tan

/*
 * Prompt 51 (ANDFEAT51): tema per bruker, synket mellom enheter, og automatisk tema – WEBX51 `GET/PUT /api/me/theme51`.
 *  - Appens valg (Papir · lys / mørk / følg systemet) speiles til serveren som mode light/dark/system; «Automatisk» (mode auto)
 *    bytter selv etter solnedgang (by:'sun', posisjon fra serveren eller Oslo) eller faste klokkeslett (by:'time').
 *  - Siste skriving vinner: updatedAt (ms) lagres lokalt; serverens tema tas bare når det er nyere. 409 fra serveren → ta serverens.
 *  - Liquid Glass er per enhet (som før) og sendes som dark.
 *  - Auto regnes lokalt (soloppgang/solnedgang med NOAA-formelen), så det virker uten nett; serverens sun/next brukes når de finnes.
 *  MainActivity bruker Theme51.paperMode(vm.paperMode) i FinansTheme.
 */
object Theme51 {
    var auto by mutableStateOf(false)
        private set
    var by by mutableStateOf("sun")
        private set
    var lightAt by mutableStateOf("07:00")
        private set
    var darkAt by mutableStateOf("21:00")
        private set
    var lat = 59.91
        private set
    var lon = 10.75
        private set
    var place by mutableStateOf("Oslo")
        private set
    /** Mørkt nå (auto). Oppdateres av tick(). */
    var dark by mutableStateOf(false)
        private set
    /** Siste svar fra serveren (vises på siden: neste bytte, sol). */
    var server by mutableStateOf<JSONObject?>(null)
    var updatedAt = 0L
        private set
    @Volatile internal var applying = false
    private var prefs: android.content.SharedPreferences? = null

    fun init(ctx: Context) {
        if (prefs != null) return
        val p = ctx.applicationContext.getSharedPreferences("theme51", Context.MODE_PRIVATE)
        prefs = p
        auto = p.getBoolean("auto", false)
        by = p.getString("by", "sun") ?: "sun"
        lightAt = p.getString("lightAt", "07:00") ?: "07:00"
        darkAt = p.getString("darkAt", "21:00") ?: "21:00"
        lat = p.getFloat("lat", 59.91f).toDouble(); lon = p.getFloat("lon", 10.75f).toDouble()
        place = p.getString("place", "Oslo") ?: "Oslo"
        updatedAt = p.getLong("updatedAt", 0L)
        tick()
    }

    private fun save() {
        prefs?.edit()?.putBoolean("auto", auto)?.putString("by", by)?.putString("lightAt", lightAt)?.putString("darkAt", darkAt)
            ?.putFloat("lat", lat.toFloat())?.putFloat("lon", lon.toFloat())?.putString("place", place)?.putLong("updatedAt", updatedAt)?.apply()
    }

    /** Det FinansTheme skal bruke: auto → lys/mørk etter klokka, ellers appens eget valg. */
    fun paperMode(appMode: String): String = if (auto && appMode != "glass") (if (dark) "mork" else "lys") else appMode

    internal fun setLocal(auto: Boolean, by: String = this.by, lightAt: String = this.lightAt, darkAt: String = this.darkAt, at: Long = System.currentTimeMillis()) {
        this.auto = auto; this.by = by; this.lightAt = lightAt; this.darkAt = darkAt; updatedAt = at
        save(); tick()
    }

    internal fun setPlace(la: Double, lo: Double, name: String) { lat = la; lon = lo; place = name; save(); tick() }
    internal fun markSynced(at: Long) { updatedAt = at; save() }

    /** Regner ut om det er mørkt nå (kalles hvert minutt mens appen er åpen). */
    fun tick(now: Instant = Instant.now()) {
        if (!auto) return
        val z = ZoneId.of("Europe/Oslo")
        val d = if (by == "time") {
            val t = now.atZone(z).toLocalTime()
            val l = runCatching { LocalTime.parse(lightAt) }.getOrDefault(LocalTime.of(7, 0))
            val k = runCatching { LocalTime.parse(darkAt) }.getOrDefault(LocalTime.of(21, 0))
            if (l < k) t < l || t >= k else t >= k && t < l
        } else {
            val s = sun(now.atZone(z).toLocalDate(), lat, lon)
            if (s == null) false // midnattssol: lyst hele døgnet
            else {
                val rise = s.first
                val set = s.second
                if (rise == null || set == null) true // mørketid
                else now < rise || now >= set
            }
        }
        if (d != dark) dark = d
    }

    /** Soloppgang og solnedgang (instant) for datoen; null ved midnattssol (lyst hele døgnet) og (null, null) ved mørketid. */
    internal fun sun(date: LocalDate, lat: Double, lon: Double): Pair<Instant?, Instant?>? {
        val g = 2 * Math.PI / 365.0 * (date.dayOfYear - 1)
        val eq = 229.18 * (0.000075 + 0.001868 * cos(g) - 0.032077 * sin(g) - 0.014615 * cos(2 * g) - 0.040849 * sin(2 * g))
        val decl = 0.006918 - 0.399912 * cos(g) + 0.070257 * sin(g) - 0.006758 * cos(2 * g) + 0.000907 * sin(2 * g) - 0.002697 * cos(3 * g) + 0.00148 * sin(3 * g)
        val la = Math.toRadians(lat)
        val x = cos(Math.toRadians(90.833)) / (cos(la) * cos(decl)) - tan(la) * tan(decl)
        if (x < -1) return null // midnattssol
        if (x > 1) return Pair(null, null) // mørketid
        val ha = Math.toDegrees(acos(x))
        val rise = 720 - 4 * (lon + ha) - eq
        val set = 720 - 4 * (lon - ha) - eq
        val mid = date.atStartOfDay(ZoneId.of("UTC")).toInstant()
        return Pair(mid.plusSeconds((rise * 60).toLong()), mid.plusSeconds((set * 60).toLong()))
    }

    /** App-valget → serverens mode. */
    fun modeFor(appMode: String): String = when (appMode) { "lys" -> "light"; "mork", "glass" -> "dark"; else -> "system" }
}

/** Henter temaet fra serveren og bruker det hvis det er nyere enn det lokale. */
fun AppViewModel.syncTheme51() = launch51 {
    Theme51.init(appCtx51)
    val o = try { JSONObject(api51 { hlGet("/me/theme51", timeout = 6000) }) } catch (e: ApiException) { return@launch51 }
    applyTheme51(o)
}

internal fun AppViewModel.applyTheme51(o: JSONObject) {
    Theme51.server = o
    o.optJSONObject("auto")?.optJSONObject("place")?.let { pl ->
        val la = pl.optDouble("lat"); val lo = pl.optDouble("lon")
        if (!la.isNaN() && !lo.isNaN()) Theme51.setPlace(la, lo, pl.optString("name").ifBlank { "Oslo" })
    }
    val at = o.optLong("updatedAt", 0L)
    if (at <= Theme51.updatedAt) return
    val mode = o.optString("mode")
    val a = o.optJSONObject("auto")
    Theme51.applying = true
    try {
        when (mode) {
            "auto" -> Theme51.setLocal(true, a?.optString("by")?.takeIf { it == "time" || it == "sun" } ?: Theme51.by,
                a?.optString("lightAt")?.takeIf { it.matches(Regex("^\\d{2}:\\d{2}$")) } ?: Theme51.lightAt,
                a?.optString("darkAt")?.takeIf { it.matches(Regex("^\\d{2}:\\d{2}$")) } ?: Theme51.darkAt, at)
            "light", "dark", "system" -> {
                Theme51.setLocal(false, at = at)
                val want = when (mode) { "light" -> "lys"; "dark" -> "mork"; else -> "auto" }
                // Liquid Glass er per enhet: står den på og serveren sier mørk, beholdes den.
                if (!(paperMode == "glass" && mode == "dark") && paperMode != want) setPaperMode(want)
            }
        }
    } finally { Theme51.applying = false }
}

/** Sender temaet til serveren (siste skriving vinner). 409 → serverens tema er nyere og tas i bruk. */
fun AppViewModel.pushTheme51(mode: String, auto: JSONObject? = null) {
    if (Theme51.applying || !loggedIn) return
    val at = System.currentTimeMillis()
    val body = JSONObject().put("mode", mode).put("updatedAt", at)
    if (auto != null) body.put("auto", auto)
    if (mode != "auto") Theme51.setLocal(false, at = at) else Theme51.markSynced(at)
    launch51 {
        try {
            val o = JSONObject(api51 { hlPut("/me/theme51", body) })
            Theme51.server = o
            Theme51.markSynced(o.optLong("updatedAt", at))
        } catch (e: ApiException) {
            if (e.status == 409) runCatching { syncTheme51() }
        }
    }
}

/** Appens eget valg ble endret (Innstillinger → Utseende): auto av og speil til serveren. Kalles fra setPaperMode. */
fun AppViewModel.themeChanged51(appMode: String) {
    if (Theme51.applying) return
    pushTheme51(Theme51.modeFor(appMode))
}

/** «Automatisk»: etter sol eller klokkeslett. */
fun AppViewModel.setAutoTheme51(by: String, lightAt: String = Theme51.lightAt, darkAt: String = Theme51.darkAt) {
    Theme51.setLocal(true, by, lightAt, darkAt)
    val a = JSONObject().put("by", by)
    if (by == "time") a.put("lightAt", lightAt).put("darkAt", darkAt)
    pushTheme51("auto", a)
}
