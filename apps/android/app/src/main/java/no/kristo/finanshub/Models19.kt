package no.kristo.finanshub

import org.json.JSONObject

/*
 * Prompt 19: dynamiske bakgrunner fra GET /api/background (vær fra MET, planeter fra NASA, Oslo fra Unsplash/Pexels
 * eller egne bilder). Klienten legger på blur, demping, scrim og partikler selv.
 */

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
val BG_PLANETS = listOf("auto" to "Bytt automatisk", "earth" to "Jorda", "moon" to "Månen", "jupiter" to "Jupiter", "mars" to "Mars")
