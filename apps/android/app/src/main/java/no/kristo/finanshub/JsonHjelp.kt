package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

/* ---------------- JSON-hjelpere ---------------- */

internal fun s34(o: JSONObject?, vararg k: String): String? {
    if (o == null) return null
    for (key in k) {
        if (!o.has(key) || o.isNull(key)) continue
        val v = o.opt(key)
        if (v is JSONObject || v is JSONArray) continue
        val t = v.toString()
        if (t.isNotBlank() && t != "null") return t
    }
    return null
}

internal fun n34(o: JSONObject?, vararg k: String): Double? {
    if (o == null) return null
    for (key in k) {
        if (!o.has(key) || o.isNull(key)) continue
        when (val v = o.opt(key)) {
            is Number -> return v.toDouble()
            is String -> v.replace(',', '.').replace(Regex("[^0-9.+-]"), "").toDoubleOrNull()?.let { return it }
        }
    }
    return null
}

internal fun b34(o: JSONObject?, vararg k: String): Boolean? {
    if (o == null) return null
    for (key in k) {
        if (!o.has(key) || o.isNull(key)) continue
        when (val v = o.opt(key)) {
            is Boolean -> return v
            is Number -> return v.toInt() != 0
            is String -> return v == "true" || v == "1" || v == "on"
        }
    }
    return null
}

internal fun objs34(a: JSONArray?): List<JSONObject> = (0 until (a?.length() ?: 0)).mapNotNull { a!!.optJSONObject(it) }

internal fun arr34(o: JSONObject?, vararg k: String): JSONArray? {
    if (o == null) return null
    for (key in k) o.optJSONArray(key)?.let { return it }
    return null
}

/** Et svar som er enten {key:[…]} eller […]. */
internal fun list34(raw: String, vararg k: String): List<JSONObject> {
    val t = raw.trim()
    if (t.startsWith("[")) return objs34(JSONArray(t))
    val o = JSONObject(t)
    return objs34(arr34(o, *k))
}

internal fun enc34(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

internal val OSLO34: ZoneId = ZoneId.of("Europe/Oslo")

internal fun hexColor34(s: String?): Long? {
    val h = s?.trim()?.removePrefix("#") ?: return null
    return when (h.length) {
        6 -> h.toLongOrNull(16)?.let { 0xFF000000 or it }
        8 -> h.toLongOrNull(16)
        else -> null
    }
}

internal val OSLO37: ZoneId = ZoneId.of("Europe/Oslo")

internal fun JSONObject.s37(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

internal fun JSONObject.b37(k: String): Boolean? = if (!has(k) || isNull(k)) null else optBoolean(k)

internal fun JSONObject.d37(k: String): Double? = if (!has(k) || isNull(k)) null else optDouble(k).takeIf { !it.isNaN() }

internal fun strs37(a: JSONArray?): List<String> = (0 until (a?.length() ?: 0)).mapNotNull { i -> a!!.optString(i).takeIf { it.isNotBlank() && it != "null" } }

internal fun hex37(v: String?): Long? {
    val h = v?.trim()?.removePrefix("#") ?: return null
    return when (h.length) { 6 -> h.toLongOrNull(16)?.let { 0xFF000000L or it }; 8 -> h.toLongOrNull(16); else -> null }
}

fun hexOf37(c: Long): String = "#" + java.lang.Long.toHexString(c and 0xFFFFFFL).padStart(6, '0')

/* ---------------- Felles: tidspunkt som ms, sekunder eller ISO-tekst ---------------- */

internal fun anyTime(v: Any?): Instant? = when (v) {
    is Number -> v.toDouble().let { x -> if (x > 1e11) Instant.ofEpochMilli(x.toLong()) else if (x > 1e8) Instant.ofEpochSecond(x.toLong()) else null }
    is String -> v.trim().takeIf { it.isNotEmpty() }?.let { s ->
        s.toDoubleOrNull()?.let { anyTime(it) }
            ?: runCatching { OffsetDateTime.parse(s).toInstant() }.getOrNull()
            ?: runCatching { Instant.parse(s) }.getOrNull()
            ?: runCatching { LocalDate.parse(s.take(10)).atStartOfDay(ZoneId.systemDefault()).toInstant() }.getOrNull()
    }
    else -> null
}

internal fun fmtTime(t: Instant?, pattern: String): String =
    t?.let { DateTimeFormatter.ofPattern(pattern, Locale.forLanguageTag("nb-NO")).withZone(ZoneId.systemDefault()).format(it) } ?: ""

internal fun JSONObject.timeAt(k: String): Instant? = if (!has(k) || isNull(k)) null else anyTime(opt(k))

/** «#fff», «#ffffff» eller «ffffff» som ARGB. null når teksten ikke er en farge. */
fun hexColor(hex: String?): Long? {
    val h = hex?.trim()?.removePrefix("#") ?: return null
    val six = when (h.length) {
        3 -> h.map { "$it$it" }.joinToString("")
        6 -> h
        8 -> h.takeLast(6)
        else -> return null
    }
    return six.toLongOrNull(16)?.let { 0xFF000000 or it }
}
