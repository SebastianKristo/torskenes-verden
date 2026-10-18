package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Prompt 20: kartfliser via homelab (/api/config/map og /tiles), posisjonskortet på Hjem (/api/family/positions),
 * fargede og flyttbare Finans-fliser og logoregisteret (/finans/api/logos/registry).
 */

/* ---------- Kartfliser ---------- */

/** GET /api/config/map → {tiles:{voyager:'/tiles/voyager/{z}/{x}/{y}{r}.png', …}, attribution, default, maxZoom}. */
data class MapConfig(val tiles: Map<String, String>, val attribution: String?, val defaultStyle: String, val maxZoom: Int)

/** Fliskilden kartet bruker: navn (cache-nøkkel), URL-mal med {s} {z} {x} {y} {r}, og om app-tokenet skal sendes. */
data class MapTiles(val name: String, val template: String, val auth: Boolean, val attribution: String, val maxZoom: Int, val retina: Boolean)

fun parseMapConfig(s: String): MapConfig {
    val o = JSONObject(s)
    val t = o.optJSONObject("tiles")
    val tiles = mutableMapOf<String, String>()
    t?.keys()?.forEach { k -> t.optStr(k)?.let { tiles[k] = it } }
    return MapConfig(tiles, o.optStr("attribution"), o.optStr("default") ?: "voyager", o.optIntOrNull("maxZoom")?.coerceIn(10, 22) ?: 19)
}

private const val CARTO_ATTR = "© OpenStreetMap-bidragsytere © CARTO"

/**
 * Hvilken kilde kartet skal bruke. Ny server: homelab-proxyen (/tiles) med app-token. Eldre server uten /api/config/map
 * (404): CARTO direkte, aldri tile.openstreetmap.org (OSM blokkerer apper med 403).
 */
fun mapTilesFor(cfg: MapConfig?, missing: Boolean, base: String, style: String, retina: Boolean): MapTiles {
    val r = if (retina) "2x" else "1x"
    if (missing || base.isBlank()) {
        val path = when (style) { "dark" -> "dark_all"; "light" -> "light_all"; else -> "rastertiles/voyager" }
        return MapTiles("carto-$style-$r", "https://{s}.basemaps.cartocdn.com/$path/{z}/{x}/{y}{r}.png", false, CARTO_ATTR, 19, retina)
    }
    val tpl = cfg?.tiles?.get(style) ?: cfg?.tiles?.get(cfg.defaultStyle) ?: "/tiles/$style/{z}/{x}/{y}{r}.png"
    val full = if (tpl.startsWith("/")) base.trimEnd('/') + tpl else tpl
    val own = full.startsWith(base.trimEnd('/'))
    return MapTiles("homelab-$style-$r", full, own, cfg?.attribution ?: CARTO_ATTR, cfg?.maxZoom ?: 19, retina)
}

/** Gyldig punkt på kartet (osmdroid tåler ikke NaN eller breddegrader utenfor Web Mercator). */
fun validLatLon(lat: Double, lon: Double): Boolean = lat.isFinite() && lon.isFinite() && lat in -85.05..85.05 && lon in -180.0..180.0

/* ---------- Posisjonskortet ---------- */

/** Én person på posisjonskortet. status: «fresh» (< 15 min), «stale» eller «off». */
data class PosCard(
    val id: String, val name: String, val color: Long, val photo: String?, val initials: String,
    val line2: String, val status: String, val self: Boolean,
)

/** Fargene som brukes når Familie ikke har en egen farge for personen (stabil per id). */
val POS_COLORS = listOf(0xFFB23A2A, 0xFF2F5D8A, 0xFF2F7A4F, 0xFFC9A227, 0xFF5B4A8A, 0xFFE07A5F, 0xFF2A8A8A, 0xFF7A3B69)

fun posColorFor(id: String): Long = POS_COLORS[Math.floorMod(id.hashCode(), POS_COLORS.size)]

/** To bokstaver: «Du», «In» (Ingrid), «På» (Pål). */
fun posInitials(name: String): String {
    val n = name.trim()
    if (n.isEmpty()) return "?"
    val first = n.split(' ').first()
    return first.take(2).lowercase().replaceFirstChar { it.titlecase(Locale("nb")) }
}

fun parsePositions(s: String): List<PosCard> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("positions") ?: JSONObject(t).optJSONArray("items") ?: JSONArray()
    val seen = mutableSetOf<String>()
    val out = (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        val id = o.optStr("id") ?: o.optStr("userId") ?: "$i"
        if (!seen.add(id)) return@mapNotNull null
        val self = o.optBoolean("self", false)
        val name = if (self) "Du" else o.optStr("navn") ?: o.optStr("name") ?: "Person"
        val status = (o.optStr("status") ?: "off").let { if (it in setOf("fresh", "stale", "off")) it else "off" }
        val line2 = o.optStr("linje2")?.takeIf { it != "Ukjent sted" }
            ?: listOfNotNull(o.optStr("sone"), o.optStr("sted")).firstOrNull()
            ?: lastSeen(o.optStr("oppdatert")) ?: "Deler ikke posisjon"
        PosCard(id, name, o.optStr("farge")?.let(::color) ?: o.optStr("color")?.let(::color) ?: posColorFor(id), o.optStr("bilde"),
            o.optStr("initialer") ?: posInitials(name), line2, status, self)
    }
    // «Du» først, og bare én gang.
    return out.filter { it.self }.take(1) + out.filter { !it.self }
}

/** «Sist sett 14:32» (i dag) eller «Sist sett 12.10.». */
fun lastSeen(iso: String?): String? {
    val t = runCatching { Instant.parse(iso!!) }.getOrNull() ?: return null
    val z = t.atZone(ZoneId.systemDefault())
    val today = java.time.LocalDate.now(ZoneId.systemDefault())
    return "Sist sett " + if (z.toLocalDate() == today) z.format(DateTimeFormatter.ofPattern("HH:mm")) else z.format(DateTimeFormatter.ofPattern("d.M."))
}

private fun activityShort(a: String?): String? = when (a) {
    "walking", "går" -> "Går"; "running" -> "Løper"; "cycling", "sykler" -> "Sykler"; "driving", "i bil" -> "I bil"; else -> null
}

/** Eldre server uten /api/family/positions: kortet bygges fra /api/family. Deg selv først som «Du», uten duplikat. */
fun positionsFromFamily(f: Family, now: Instant = Instant.now()): List<PosCard> {
    val selfId = f.me?.userId
    val seen = mutableSetOf<String>()
    val ordered = f.members.filter { it.userId == selfId } + f.members.filter { it.userId != selfId }
    return ordered.mapNotNull { m ->
        if (!seen.add(m.userId)) return@mapNotNull null
        val self = m.userId == selfId
        val l = m.last
        val age = l?.ts?.let { runCatching { Duration.between(Instant.parse(it), now).toMinutes() }.getOrNull() }
        val status = when {
            m.sharing != "on" || l == null -> "off"
            age != null && age < 15 -> "fresh"
            else -> "stale"
        }
        val zone = if (l == null) null else f.zones.firstOrNull { z -> distM(l.lat, l.lon, z.lat, z.lon) <= z.radius }?.name
        val line2 = when {
            m.sharing != "on" && l?.ts != null -> lastSeen(l.ts) ?: "Deler ikke posisjon"
            m.sharing != "on" || l == null -> "Deler ikke posisjon"
            zone != null -> zone
            activityShort(l.activity) != null -> listOfNotNull(activityShort(l.activity), l.place).joinToString(" · ")
            l.place != null -> l.place
            else -> lastSeen(l.ts) ?: "Deler ikke posisjon"
        }
        val name = if (self) "Du" else m.name.split(' ').first()
        PosCard(m.userId, name, posColorFor(m.userId), m.avatarUrl, posInitials(name), line2, status, self)
    }
}

/** Avstand i meter (haversine), så modellene ikke trenger android.location. */
fun distM(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val r = 6_371_000.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ---------- Finans-flisene: farge per flis og rekkefølge ---------- */

/** Ikonfarge per flis (tonet bakgrunn = samme farge med lav alfa). */
val FM_COLORS: Map<String, Long> = mapOf(
    "budsjett" to 0xFFD9822B, "kvitt" to 0xFFB23A2A, "faste" to 0xFF6B4FA0, "kontoer" to 0xFF2F5D8A,
    "aksjer" to 0xFF2F7A4F, "rapp" to 0xFFB8892A, "abo" to 0xFFC2557A, "boliger" to 0xFF2A8A8A,
    "fimport" to 0xFF4A4FA8, "finn" to 0xFF0063FB, "sok" to 0xFF7A3B69, "innst" to 0xFF6F6A60, "liste" to 0xFF5A5246,
)

val FM_DEFAULT_ORDER = listOf("sok", "liste", "finn", "budsjett", "kvitt", "faste", "kontoer", "aksjer", "rapp", "abo", "boliger", "fimport", "innst")

/** Lagret rekkefølge + nye fliser bakerst; ukjente nøkler fjernes. */
fun normalizeFmOrder(saved: List<String>): List<String> = saved.filter { it in FM_DEFAULT_ORDER }.distinct() + FM_DEFAULT_ORDER.filter { it !in saved }

/* ---------- Logoregisteret ---------- */

data class LogoRegItem(val id: String, val name: String, val domain: String?, val alias: List<String>, val category: String?, val color: Long?, val hasFile: Boolean)

fun parseLogoRegistry(s: String): List<LogoRegItem> {
    val o = JSONObject(s)
    val a = o.optJSONArray("items") ?: JSONArray()
    return (0 until a.length()).mapNotNull { i ->
        val x = a.optJSONObject(i) ?: return@mapNotNull null
        val id = x.optStr("id") ?: return@mapNotNull null
        LogoRegItem(id, x.optStr("navn") ?: id, x.optStr("domene"), x.optJSONArray("alias").strings().filter { it.isNotBlank() },
            x.optStr("kategori"), x.optStr("farge")?.let(::color), x.optBoolean("hasFile", false))
    }
}

/** Normalisert nøkkel for oppslag på navn: små bokstaver, æøå/ü forenklet, bare bokstaver og tall. */
fun logoKey(s: String): String = s.lowercase()
    .replace("æ", "ae").replace("ø", "o").replace("å", "a").replace("ü", "u").replace("ö", "o").replace("ä", "a").replace("é", "e")
    .replace(Regex("^(vipps\\*|klarna\\*|iz \\*|sumup \\*|paypal \\*|zettle_\\*|varekjop |visa |kortkjop )"), "")
    .replace(Regex("[^a-z0-9]"), "")

/** Oppslag: domene først, deretter navn/alias (eksakt, så prefiks). */
class LogoIndex(items: List<LogoRegItem>) {
    private val byDomain = HashMap<String, LogoRegItem>()
    private val byKey = HashMap<String, LogoRegItem>()
    private val keys: List<Pair<String, LogoRegItem>>

    init {
        for (it in items) {
            it.domain?.lowercase()?.removePrefix("www.")?.let { d -> byDomain.putIfAbsent(d, it) }
            (listOf(it.name, it.id) + it.alias).map(::logoKey).filter { k -> k.length >= 2 }.forEach { k -> byKey.putIfAbsent(k, it) }
        }
        keys = byKey.entries.map { it.key to it.value }.filter { it.first.length >= 3 }.sortedByDescending { it.first.length }
    }

    fun find(domain: String?, name: String?): LogoRegItem? {
        domain?.trim()?.lowercase()?.removePrefix("www.")?.takeIf { it.isNotBlank() }?.let { d -> byDomain[d]?.let { return it } }
        val k = name?.let(::logoKey)?.takeIf { it.length >= 2 } ?: return null
        byKey[k]?.let { return it }
        return keys.firstOrNull { (key, _) -> k.startsWith(key) }?.second
    }
}

/** Lokal nøkkel for rekkefølgen på Finans-flisene (samme navn som i PWA-en). */
const val FM_ORDER_KEY = "papir_fm_order"
