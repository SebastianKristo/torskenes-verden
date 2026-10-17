package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject

/** world-atlas 110m (TopoJSON) når serveren ikke deler sin egen kopi. */
const val WORLD_ATLAS = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json"

/** Statistikkilder for domener. Plausible og Umami trenger et API-token, som legges inn på web. */
val DOMAIN_SOURCES = listOf("cloudflare" to "Cloudflare", "tunnel" to "Cloudflare Tunnel", "plausible" to "Plausible", "umami" to "Umami", "uptime" to "Bare oppetid og SSL")
val DOMAIN_NEEDS_TOKEN = setOf("plausible", "umami")
fun sourceName(s: String?): String = DOMAIN_SOURCES.firstOrNull { it.first == s }?.second ?: s ?: "–"

/** Et land fra world-atlas: ISO 3166-1 numerisk ID, navn og ringer som (lengdegrad, breddegrad)-par. */
class MapCountry(val id: Int, val name: String, val rings: List<DoubleArray>) {
    companion object {
        /** TopoJSON → land. Buene er delta-kodet og kvantisert (transform.scale/translate); negativ bueindeks = baklengs. */
        fun parse(json: String): List<MapCountry> = runCatching {
            val o = JSONObject(json)
            val tr = o.optJSONObject("transform")
            val sc = tr?.optJSONArray("scale")
            val mv = tr?.optJSONArray("translate")
            val quantized = sc != null && mv != null && sc.length() == 2 && mv.length() == 2
            val rawArcs = o.getJSONArray("arcs")
            val arcs: List<DoubleArray> = (0 until rawArcs.length()).map { i ->
                val a = rawArcs.getJSONArray(i)
                val out = DoubleArray(a.length() * 2)
                var x = 0.0; var y = 0.0
                for (k in 0 until a.length()) {
                    val p = a.getJSONArray(k)
                    if (quantized) {
                        x += p.getDouble(0); y += p.getDouble(1)
                        out[k * 2] = x * sc!!.getDouble(0) + mv!!.getDouble(0); out[k * 2 + 1] = y * sc.getDouble(1) + mv.getDouble(1)
                    } else { out[k * 2] = p.getDouble(0); out[k * 2 + 1] = p.getDouble(1) }
                }
                out
            }
            fun ring(idx: JSONArray): DoubleArray {
                val pts = ArrayList<Double>()
                for (k in 0 until idx.length()) {
                    val i = idx.getInt(k)
                    val j = if (i >= 0) i else i.inv()
                    if (j >= arcs.size) continue
                    val a = arcs[j]
                    val n = a.size / 2
                    val order = if (i >= 0) (0 until n) else (n - 1 downTo 0)
                    var first = true
                    for (q in order) {
                        if (first && k > 0 && pts.isNotEmpty()) { first = false; continue }
                        first = false
                        pts.add(a[q * 2]); pts.add(a[q * 2 + 1])
                    }
                }
                return pts.toDoubleArray()
            }
            val geoms = o.getJSONObject("objects").getJSONObject("countries").getJSONArray("geometries")
            (0 until geoms.length()).mapNotNull { gi ->
                val g = geoms.getJSONObject(gi)
                val id = g.opt("id")?.toString()?.toIntOrNull() ?: -1
                if (id == 10) return@mapNotNull null // Antarktis tar bare plass
                val name = g.optJSONObject("properties")?.optString("name") ?: ""
                val arcsOf = g.optJSONArray("arcs") ?: return@mapNotNull null
                val rings = ArrayList<DoubleArray>()
                when (g.optString("type")) {
                    "Polygon" -> for (r in 0 until arcsOf.length()) rings.add(ring(arcsOf.getJSONArray(r)))
                    "MultiPolygon" -> for (p in 0 until arcsOf.length()) { val poly = arcsOf.getJSONArray(p); for (r in 0 until poly.length()) rings.add(ring(poly.getJSONArray(r))) }
                }
                rings.filter { it.size > 4 }.takeIf { it.isNotEmpty() }?.let { MapCountry(id, name, it) }
            }
        }.getOrDefault(emptyList())
    }
}
