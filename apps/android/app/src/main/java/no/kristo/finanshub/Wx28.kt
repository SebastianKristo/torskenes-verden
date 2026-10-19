package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject

/*
 * Prompt 28 (ANDROID28-A): svaret fra stedssøket GET /api/weather/places?q= (SERVER28):
 * [{name, sub:'Fylke/region, Land', lat, lon, country, source}] (eller {results|places|items:[…]}).
 */

/**
 * Treffene som WxPlace (region = undertekst «Fylke/region, Land»). null når svaret ikke er et søkesvar – en eldre server
 * ignorerer q og gir de lagrede stedene (uten sub/source) – eller er tomt; da bruker klienten /weather/search som reserve.
 */
fun parseWxSearch28(s: String): List<WxPlace>? {
    val t = s.trim()
    val root: Any = runCatching { if (t.startsWith("[")) JSONArray(t) else JSONObject(t) }.getOrNull() ?: return null
    val wrapped = root is JSONObject && root.has("results")
    val a: JSONArray = when (root) {
        is JSONArray -> root
        is JSONObject -> root.optJSONArray("results") ?: root.optJSONArray("places") ?: root.optJSONArray("items") ?: return null
        else -> return null
    }
    val items = (0 until a.length()).mapNotNull { a.optJSONObject(it) }
    if (items.isEmpty()) return if (wrapped) emptyList() else null
    if (!wrapped && items.none { it.has("sub") || it.has("source") }) return null
    return items.mapNotNull { o ->
        val lat = o.optDoubleOrNull("lat") ?: return@mapNotNull null
        val lon = o.optDoubleOrNull("lon") ?: return@mapNotNull null
        val sub = o.optStr("sub") ?: listOfNotNull(o.optStr("region"), o.optStr("country")).joinToString(", ")
        WxPlace(o.optStr("id") ?: "$lat,$lon", o.optStr("name") ?: "Sted", lat, lon, sub)
    }.take(10)
}
