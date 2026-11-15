package no.kristo.finanshub

import android.graphics.Bitmap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import no.kristo.felles.nett.openSikker
import org.json.JSONObject

data class Credit41(val author: String?, val license: String?, val file: String)

/* ======================= Bakgrunn «Oslo» ======================= */

/** Frie Wikimedia Commons-bilder (Getty krever kjøpt lisens), samme liste som web/iOS. */
val OSLO41: Map<String, List<String>> = mapOf(
    "morgen" to listOf("Oslo_sett_fra_Nesoddtangen,_2020.jpg", "Oslo_from_east_IMG_7642_aerial.JPG", "Oslo_S_aerial.jpg"),
    "dag" to listOf("Oslo_Skyline,_drone.jpg", "Rodeløkka_(7._september_2018).jpg", "Holmenkollen_aerial.jpg", "2010-10-25_Oslo.jpg", "Operahuset.jpg", "Oslo_S_aerial.jpg"),
    "kveld" to listOf("Bjørvika_-_Oslo,_Norway_2020-12-23.jpg", "Oslo_sunset_-_33885192918.jpg", "Oslo_view.jpg"),
    "natt" to listOf("Oslo_at_night.jpg", "Oslo_night_skyline_2011.jpg", "Oslo_-_Bjørvika_-_2026.jpg"),
)

fun osloUrl41(file: String, w: Int = 2000): String =
    "https://commons.wikimedia.org/wiki/Special:FilePath/" + URLEncoder.encode(file, "UTF-8").replace("+", "%20") + "?width=$w"

/** Tidsrom: soloppgang−1 t til +3 t = morgen, solnedgang−2 t til +1 t = kveld, mørkt = natt (fra Vær når det finnes), ellers klokka. */
fun AppViewModel.osloSlot41(now: java.time.ZonedDateTime = java.time.ZonedDateTime.now()): String {
    val w = weatherFull
    val rise = epoch41(w?.today?.sunrise)?.takeIf { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalDate() == now.toLocalDate() }
    val set = epoch41(w?.today?.sunset)?.takeIf { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalDate() == now.toLocalDate() }
    if (rise != null && set != null) {
        val t = now.toInstant().toEpochMilli(); val h = 3_600_000L
        return when {
            t >= rise - h && t < rise + 3 * h -> "morgen"
            t >= set - 2 * h && t < set + h -> "kveld"
            t >= rise + 3 * h && t < set - 2 * h -> "dag"
            else -> "natt"
        }
    }
    val hr = now.hour
    return when (hr) { in 5..9 -> "morgen"; in 10..15 -> "dag"; in 16..19 -> "kveld"; else -> "natt" }
}

fun AppViewModel.osloKey41(): String = osloSlot41() + LocalTime.now().hour

/** Bildet for nå: timens bilde i tidsrommet (time % antall), så resten av settet, så dag-settet. Feilede hoppes over. */
internal suspend fun AppViewModel.oslo41(): Pair<Bitmap, String?>? {
    val slot = osloSlot41()
    val l = OSLO41[slot] ?: return null
    val i = LocalTime.now().hour % l.size
    val order = (l.drop(i) + l.take(i)) + (if (slot == "dag") emptyList() else OSLO41["dag"].orEmpty().filter { it !in l })
    for (f in order) for (w in listOf(2000, 1280)) {
        val b = runCatching { bgImage41(osloUrl41(f, w)) }.getOrNull() ?: continue
        p41.osloKey = osloKey41()
        p41.osloFile = f
        val c = commonsCredit41(f)
        p41.osloCredit = c
        return b to creditLine41(c)
    }
    return null
}

fun creditLine41(c: Credit41?): String? = c?.let { listOfNotNull(it.author?.let { a -> "Foto: $a" }, it.license, "Wikimedia Commons").joinToString(" · ") }

private val creditCache41 = HashMap<String, Credit41>()

/** Forfatter og lisens fra Commons (extmetadata). Lagres i minnet; feiler det, vises bare «Wikimedia Commons». */
private suspend fun commonsCredit41(file: String): Credit41 {
    creditCache41[file]?.let { return it }
    val c = runCatching {
        withContext(Dispatchers.IO) {
            val url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=" + URLEncoder.encode("File:$file", "UTF-8")
            val conn = java.net.URL(url).openSikker()
            conn.connectTimeout = 5000; conn.readTimeout = 8000
            conn.setRequestProperty("User-Agent", "FinansHub-Android (home.kristo.no)")
            val body = try { conn.inputStream.bufferedReader().use { it.readText() } } finally { conn.disconnect() }
            val pages = JSONObject(body).optJSONObject("query")?.optJSONObject("pages")
            val pg = pages?.keys()?.asSequence()?.firstOrNull()?.let { pages.optJSONObject(it) }
            val md = pg?.optJSONArray("imageinfo")?.optJSONObject(0)?.optJSONObject("extmetadata")
            fun v(k: String) = md?.optJSONObject(k)?.optString("value")?.replace(Regex("<[^>]+>"), "")?.trim()?.takeIf { it.isNotBlank() }
            Credit41(v("Artist")?.take(60), v("LicenseShortName"), file)
        }
    }.getOrElse { Credit41(null, null, file) }
    if (c.author != null || c.license != null) creditCache41[file] = c
    return c
}

fun commonsPage41(file: String): String = "https://commons.wikimedia.org/wiki/File:" + URLEncoder.encode(file, "UTF-8").replace("+", "%20")

/** Hvert minutt: ny time eller nytt tidsrom → last neste bilde (byttes først når det er lastet, aldri blankt). */
fun AppViewModel.osloTick41() {
    if (photoKind != "oslo") return
    val k = osloKey41()
    if (p41.osloKey != null && p41.osloKey != k) loadPhoto()
}

/* ======================= Bakgrunn: Google Photos-album ======================= */

data class Gphoto46(val configured: Boolean, val url: String?, val count: Int, val rowText: String?, val error: String?, val mobile: String?, val nextAt: String?)

private val GP_RE46 = Regex("""^https://(photos\.app\.goo\.gl/[A-Za-z0-9_-]+|photos\.google\.com/share/[^\s]+)$""")

fun gphotoValid46(u: String): Boolean = GP_RE46.matches(u.trim())

private fun parseGphoto46(raw: String?): Gphoto46? {
    val o = raw?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return null
    val cur = o.optJSONObject("current")
    return Gphoto46(o.optBoolean("configured", false), o.s43("url"), o.optInt("count"), o.s43("rowText"), o.s43("error"), cur?.s43("mobile", "large"), o.s43("nextChangeAt"))
}

/** Bildet som gjelder nå (samme for alle enheter: deterministisk etter time og dag på serveren). Planlegger neste bytte. */
internal suspend fun AppViewModel.gphotoPhoto46(): Bitmap? {
    val raw = runCatching { api46 { hlGet("/bg/gphoto", timeout = 12_000) } }.getOrNull()
    val g = parseGphoto46(raw) ?: return null
    p46.gp = g
    val url = g.mobile ?: return null
    val bmp = if (url.startsWith("/")) image(url) else null // bare serverens egne, cachede bilder (aldri hotlinking)
    p46.gpJob?.cancel()
    val next = g.nextAt?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }
    if (next != null) p46.gpJob = launchJob46 { delay((next - System.currentTimeMillis()).coerceIn(60_000L, 3_600_000L) + 2_000L); if (photoKind == "gphoto") loadPhoto() }
    return bmp
}

fun AppViewModel.loadGphoto46() = launch46 { p46.gp = parseGphoto46(runCatching { api46 { hlGet("/bg/gphoto") } }.getOrNull()) }

fun AppViewModel.useGphoto46(url: String) {
    val u = url.trim()
    if (!gphotoValid46(u)) { p46.gpErr = "Må være en delt album-lenke fra Google Photos"; Haptics.error(); return }
    p46.gpErr = null
    p46.gpBusy = true
    launch46 {
        try {
            val raw = api46 { request("POST", "/bg/gphoto", JSONObject().put("url", u), prefix = Api.HOMELAB, read = 90_000) }
            p46.gp = parseGphoto46(raw)
            p46.gpSheet = false
            setPhotoKind("gphoto")
            runCatching { api46 { hlPut("/me/layout", JSONObject().put("papir_bg_gphoto", u)) } }
        } catch (e: ApiException) {
            p46.gpErr = when { e.status == 404 -> "Serveren støtter ikke Google Photos-album ennå. Oppdater Homelab."; e.status == 400 -> "Må være en delt album-lenke fra Google Photos"; else -> e.message ?: "Fikk ikke hentet albumet" }
        } finally { p46.gpBusy = false }
    }
}

fun AppViewModel.removeGphoto46() = launch46 {
    runCatching { api46 { hlDelete("/bg/gphoto") } }
    p46.gp = null; p46.gpSheet = false
    if (photoKind == "gphoto") setPhotoKind("oslo")
}

fun AppViewModel.retryGphoto46() = launch46 {
    runCatching { api46 { request("POST", "/bg/gphoto/refresh", JSONObject(), prefix = Api.HOMELAB, read = 90_000) } }
    loadPhoto()
}

/* ---------------- Fotovindu (GET /api/photo-window) ---------------- */

data class PhotoWindow(val kind: String, val url: String?, val credit: String?, val gradient: List<Long>, val fallbacks: List<String> = emptyList(), val symbol: String? = null)

/** Hex-fargene i en CSS-gradient («linear-gradient(170deg,#4a5a6a,#2a3440)»). */
fun gradientColors(css: String?): List<Long> =
    if (css == null) emptyList() else Regex("#([0-9a-fA-F]{6})").findAll(css).map { 0xFF000000 or it.groupValues[1].toLong(16) }.toList()

fun parsePhotoWindow(s: String): PhotoWindow {
    val o = JSONObject(s)
    return PhotoWindow(o.optString("kind"), o.optStr("url"), o.optStr("credit"), gradientColors(o.optStr("gradient")), o.optJSONArray("fallbacks").strings(), o.optStr("symbol"))
}

data class BgCredit(val text: String?, val url: String?, val author: String?, val source: String?) {
    /** Kort linje nederst i fotovinduet, f.eks. «Foto: Ola Nordmann · Unsplash». */
    val line: String? get() = text ?: listOfNotNull(author?.let { "Foto: $it" }, source).joinToString(" · ").ifBlank { null }
}

data class BgInfo(
    val type: String,
    val imageUrl: String?,
    val fallbacks: List<String>,
    val credit: BgCredit?,
    /** «dark» = mørkt bilde (lys tekst), «light» = lyst bilde (mørk tekst). */
    val themeHint: String,
    val colors: List<Long>,
    val weatherKind: String?,
    val isDay: Boolean?,
    val planet: String?,
    /** «rain», «snow» eller null. */
    val particles: String?,
)

fun parseBackground(s: String): BgInfo {
    val o = JSONObject(s)
    val cr = o.optJSONObject("credit")
    val credit = when {
        cr != null -> BgCredit(cr.optStr("text"), cr.optStr("url"), cr.optStr("author"), cr.optStr("source"))
        o.optStr("credit") != null -> BgCredit(o.optStr("credit"), null, null, null)
        else -> null
    }
    val colors = o.optJSONArray("colors")?.let { a -> (0 until a.length()).mapNotNull { i -> gradientColors(a.optString(i)).firstOrNull() } }
        ?.takeIf { it.size >= 2 } ?: gradientColors(o.optStr("gradient"))
    val w = o.optJSONObject("weather")
    return BgInfo(
        type = o.optString("type", "cur"),
        imageUrl = o.optStr("image_url") ?: o.optStr("url"),
        fallbacks = o.optJSONArray("fallbacks").strings(),
        credit = credit,
        themeHint = o.optStr("theme_hint") ?: "dark",
        colors = colors,
        weatherKind = w?.optStr("kind"),
        isDay = w?.let { if (it.has("isDay") && !it.isNull("isDay")) it.optBoolean("isDay") else null },
        planet = o.optStr("planet"),
        particles = o.optStr("particles")?.takeIf { it == "rain" || it == "snow" },
    )
}

/** Forhåndsvisningene i Innstillinger → Bakgrunn (GET /api/background/previews). */
fun parseBgPreviews(s: String): Map<String, BgInfo> {
    val o = JSONObject(s)
    val out = mutableMapOf<String, BgInfo>()
    for (k in listOf("weather", "planets", "oslo", "custom")) {
        val x = o.optJSONObject(k) ?: continue
        runCatching { out[k] = parseBackground(x.put("type", k).toString()) }
    }
    return out
}

/** Bakgrunnsinnstillingene fra /api/me/layout (synkes mellom web og app). */
data class BgSettings(
    val type: String?, val planet: String?, val rotate: String?, val blur: Int?, val dim: Int?, val wifiOnly: Boolean?, val animate: Boolean?,
)

fun parseBgSettings(raw: String): BgSettings {
    val o = JSONObject(raw)
    fun int(k: String) = if (o.has(k) && !o.isNull(k)) o.optInt(k) else null
    fun bool(k: String) = if (o.has(k) && !o.isNull(k)) o.optBoolean(k) else null
    return BgSettings(o.optStr("bgType"), o.optStr("bgPlanet"), o.optStr("bgRotate"), int("bgBlur"), int("bgDim"), bool("bgWifiOnly"), bool("bgAnimate"))
}

val BG_KINDS = setOf("cur", "oslo", "weather", "planets", "custom", "none")

val BG_TYPES =listOf("weather" to "Vær", "planets" to "Planeter", "oslo" to "Oslo", "custom" to "Eget bilde", "none" to "Ingen")

val BG_PLANETS = listOf("auto" to "Bytt automatisk", "earth" to "Jorda", "moon" to "Månen", "jupiter" to "Jupiter", "mars" to "Mars", "saturn" to "Saturn")
