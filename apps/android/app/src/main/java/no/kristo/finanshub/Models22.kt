package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject

/*
 * Prompt 22: «Yr og Pent» på værsiden (compare i GET /api/weather/full, ellers GET /api/weather/compare),
 * Huskeliste ↔ Home Assistant To-do (GET /api/tasks/ha) og sporingsstatus (siste hendelse, feil, tidslinje).
 */

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

/* ---------- Huskeliste ↔ Home Assistant To-do ---------- */

data class HaEntity(val id: String, val name: String)
data class TasksHa(
    val enabled: Boolean, val status: String, val syncedAt: String?, val error: String?,
    val entities: List<HaEntity>, val maps: Map<String, String>,
)

fun parseTasksHa(s: String): TasksHa {
    val o = JSONObject(s)
    val ents = o.optJSONArray("entities")?.map { e -> HaEntity(e.optStr("entity_id") ?: e.optStr("id") ?: "", e.optStr("name") ?: e.optStr("entity_id") ?: "") }
        ?.filter { it.id.isNotBlank() } ?: emptyList()
    val maps = HashMap<String, String>()
    o.optJSONArray("maps")?.map { m -> (m.optStr("listId") ?: "") to (m.optStr("entityId") ?: "") }?.forEach { (l, e) -> if (l.isNotBlank() && e.isNotBlank()) maps[l] = e }
    return TasksHa(o.optBoolean("enabled"), o.optStr("status") ?: if (o.optBoolean("enabled")) "connecting" else "off", o.optStr("syncedAt"), o.optStr("error"), ents, maps)
}

/* ---------- Sporing: siste hendelse, feil og tidslinje ---------- */

data class TrkLastEvent(val text: String, val place: String?, val time: String?)
data class TrkUpdateError(val text: String, val retryAt: String?)
data class TrkPickup(val name: String, val deadline: String?)
/** Ett steg i tidslinjen: navn, om det er nådd, og tidspunktet (ISO) når det finnes. */
data class TrkStep(val label: String, val done: Boolean, val at: String?)

internal fun parseTrkExtras(o: JSONObject): Triple<TrkLastEvent?, TrkUpdateError?, TrkPickup?> {
    val le = o.optJSONObject("lastEvent")?.let { e -> e.optStr("text")?.let { TrkLastEvent(it, e.optStr("place") ?: e.optStr("location"), e.optStr("time") ?: e.optStr("ts")) } }
    val ue = o.optJSONObject("updateError")?.let { e -> e.optStr("text")?.let { TrkUpdateError(it, e.optStr("retryAt")) } }
        ?: o.optStr("updateError")?.let { TrkUpdateError(it, null) }
    val pk = o.optJSONObject("pickup")?.let { e -> e.optStr("name")?.let { TrkPickup(it, e.optStr("deadline")) } }
    return Triple(le, ue, pk)
}

/** steps som objekter ({label|name|text, done|reached, at|time}) gir faktisk status per steg. Strenger: bare navn. */
internal fun parseTrkSteps(a: JSONArray?): List<TrkStep> {
    if (a == null) return emptyList()
    return (0 until a.length()).mapNotNull { i ->
        when (val v = a.opt(i)) {
            is JSONObject -> TrkStep(v.optStr("label") ?: v.optStr("name") ?: v.optStr("text") ?: "", v.optBoolean("done", v.optBoolean("reached", false)),
                v.optStr("at") ?: v.optStr("time") ?: v.optStr("ts"))
            else -> null
        }
    }
}
