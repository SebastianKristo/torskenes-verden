package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject

/* ---------------- Prompt 16: fanelinje, ikonfarger, steder for vær, avganger og Familie ---------------- */

/** En fane i Papir-hovedlinja (layout.tabBar.items): id fra kjente faner, eget navn og ikon (tegn). */
data class TabItem(val id: String, val label: String, val icon: String) {
    // Prompt 25: ikonet lagres med SF Symbol-navnet (som iOS og web bruker), ikke tegnet appen tegner med.
    fun toJson(): JSONObject = JSONObject().put("id", id).put("label", label).put("icon", tabIconName25(icon))
}

/** Fanene hovedlinja kan ha (ID-ene serveren godtar i layout.tabBar), med standardnavn og -ikon. «Mer» står alltid sist. */
val MAIN_TABS: List<TabItem> = listOf(
    TabItem("finans", "Finans", "kr"),
    TabItem("mat", "Mat", "◐"),
    TabItem("domener", "Domener", "◎"),
    TabItem("sporing", "Sporing", "▣"),
    TabItem("familie", "Familie", "◉"),
    TabItem("avganger", "Avganger", "⇄"),
    TabItem("vaer", "Vær", "☀"),
    TabItem("nyheter", "Nyheter", "▤"),
    TabItem("aksjer", "Aksjer", "↗"),
    TabItem("boliger", "Boliger", "⌂"),
    TabItem("abonnementer", "Abonnementer", "↻"),
    TabItem("media", "Media", "♪"),
    TabItem("chat", "Chat", "✦"),
    // Prompt 40 (claude-code-fanelinje-alle-sider.md): alt fra Mer kan legges i fanelinja (samme nøkler som HNAV_ALL i fasiten).
    TabItem("huske", "Gjøremål", "☑"),
    TabItem("kalender", "Kalender", "▦"),
    TabItem("bursdag", "Bursdager", "✿"),
    TabItem("brief", "Now Brief", "✧"),
    TabItem("rss", "Nyhetsleser", "≣"),
    TabItem("bibel", "Bibel", "✝"),
    TabItem("nordlys", "Nordlys", "≈"),
    TabItem("innst", "Innstillinger", "⚙"),
    TabItem("sok", "Søk", "⌕"),
    TabItem("mer", "Mer", "⋯"),
)
/** Standard når brukeren ikke har endret linja: fjerde fane er Domener, eller Sporing når pakker er på vei. */
val MAIN_TABS_DEFAULT = listOf("finans", "mat", "domener", "sok", "mer")
/** Ikonene brukeren kan velge mellom for en fane. */
val TAB_ICONS = listOf("kr", "◐", "◎", "▣", "◉", "⇄", "☀", "▤", "↗", "⌂", "↻", "♪", "⌕", "⋯", "★", "♥", "✉", "⚑", "◆")

/** Fargetema for ikonene i Innstillinger: hver rad har sin farge fra paletten. */
val ICON_THEMES: List<Pair<String, String>> = listOf(
    "standard" to "Standard", "varm" to "Varm", "kjolig" to "Kjølig", "mono" to "Mono", "fargerik" to "Fargerik",
)
fun iconPalette(theme: String): List<Long> = when (theme) {
    "varm" -> listOf(0xFFB23A2A, 0xFFD9822B, 0xFFC9A227, 0xFF9C4A2F, 0xFFE07A5F, 0xFF8A5A44)
    "kjolig" -> listOf(0xFF2F5D8A, 0xFF3FA7D6, 0xFF4F7C6F, 0xFF5B4A8A, 0xFF2E8B8B, 0xFF6C7A88)
    "mono" -> listOf(0xFF1B1A17, 0xFF3A3830, 0xFF55524A, 0xFF6B665C, 0xFF8F897C, 0xFF2A2821)
    "fargerik" -> listOf(0xFFE05A7A, 0xFF4A8FE0, 0xFF3FBF8A, 0xFFE0B33A, 0xFF9A7BE0, 0xFFE8833A)
    else -> listOf(0xFFB23A2A, 0xFF2F7A4F, 0xFF2F5D8A, 0xFFC9A227, 0xFF5B4A8A, 0xFF8A5A44)
}

data class Layout16(val tabBar: List<TabItem>, val iconTheme: String?)

fun parseLayout16(s: String): Layout16 {
    val o = JSONObject(s)
    // tabBar er null til brukeren endrer linja; da brukes standarden (med automatisk fjerde fane).
    val items = o.optJSONObject("tabBar")?.optJSONArray("items") ?: o.optJSONArray("tabBar")
    val list = mutableListOf<TabItem>()
    if (items != null) for (i in 0 until items.length()) {
        val t = items.optJSONObject(i) ?: continue
        val id = t.optStr("id") ?: continue
        val def = MAIN_TABS.firstOrNull { it.id == id } ?: continue
        // Prompt 25: ikonet kan være et navn fra iOS/web («creditcard», «fork.knife»). Før ble det kuttet til 3 tegn («cre»)
        // og tegnet som tekst. Nå oversettes det til appens ikon, eller fanens standardikon.
        list += TabItem(id, (t.optStr("label") ?: def.label).take(18), tabGlyph25(id, t.optStr("icon")))
    }
    return Layout16(list.distinctBy { it.id }.take(6), o.optStr("iconTheme")?.takeIf { k -> ICON_THEMES.any { it.first == k } })
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

/* ---------- Avganger (Ruter / Entur) ---------- */

data class StopRef(val id: String, val name: String, val locality: String = "", val modes: List<String> = emptyList()) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("name", name)
}

data class Dep(
    val line: String, val to: String, val mode: String?, val color: Long?, val textColor: Long?,
    val aimed: String?, val expected: String?, val minutes: Int?, val realtime: Boolean, val platform: String?,
    val cancelled: Boolean, val situation: String?,
    /** Prompt 21: stoppene fra valgt holdeplass til endestasjonen (Entur serviceJourney.estimatedCalls). Tom på eldre server. */
    val stops: List<DepStop> = emptyList(),
    /** Forsinkelse i minutter (expected − aimed). */
    val delayMin: Int? = null,
    /** «i rute» eller «N min forsinket» fra serveren. */
    val status: String? = null,
    val ruterUrl: String? = null,
)

/** Ett stopp på turen: navn, plattform og tidspunkt (klokkeslett «19:04» eller ISO). */
data class DepStop(val name: String, val platform: String?, val time: String?, val aimed: String?, val expected: String?)

data class StopDeps(val stop: StopRef, val departures: List<Dep>)

fun parseStopList(s: String): List<StopRef> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("stops") ?: it.optJSONArray("items") ?: JSONArray() }
    return (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        StopRef(o.optStr("id") ?: return@mapNotNull null, o.optStr("name") ?: "Holdeplass", o.optStr("locality") ?: "", o.optJSONArray("modes").strings())
    }
}

private fun parseDep(o: JSONObject): Dep {
    val sa = o.optJSONArray("stops") ?: JSONArray()
    val stops = (0 until sa.length()).mapNotNull { i ->
        val x = sa.optJSONObject(i) ?: return@mapNotNull sa.optString(i).takeIf { it.isNotBlank() }?.let { DepStop(it, null, null, null, null) }
        DepStop(x.optStr("name") ?: return@mapNotNull null, x.optStr("platform"), x.optStr("time"), x.optStr("aimed"), x.optStr("expected"))
    }
    return Dep(
        o.optStr("line") ?: o.optStr("publicCode") ?: "?", o.optStr("to") ?: o.optStr("destination") ?: "", o.optStr("mode"),
        o.optStr("color")?.let(::color), o.optStr("textColor")?.let(::color), o.optStr("aimed"), o.optStr("expected"),
        o.optIntOrNull("minutes") ?: o.optIntOrNull("min"), o.optBoolean("realtime", false), o.optStr("platform") ?: o.optStr("quay"),
        o.optBoolean("cancelled", false), o.optStr("situation"),
        stops, o.optIntOrNull("delayMin"), o.optStr("status"), o.optStr("ruterUrl"),
    )
}

fun parseStopDeps(s: String): StopDeps {
    val o = JSONObject(s)
    val st = o.optJSONObject("stop")
    val deps = o.optJSONArray("departures") ?: JSONArray()
    return StopDeps(
        StopRef(st?.optStr("id") ?: "", st?.optStr("name") ?: "Holdeplass"),
        (0 until deps.length()).mapNotNull { i -> deps.optJSONObject(i)?.let(::parseDep) },
    )
}

/* ---------- Familie og kart ---------- */

data class FamPos(
    val lat: Double, val lon: Double, val acc: Double?, val speed: Double?, val heading: Double?, val ts: String?,
    val battery: Int?, val charging: Boolean?, val activity: String?, val place: String?,
    /** Telefonen som sendte posisjonen (f.eks. «Pixel 8»), når serveren har den. */
    val device: String? = null,
)
data class FamHealthDay(val date: String, val steps: Int?, val sleepMin: Int?, val activeKcal: Int?, val restingHr: Int?)
data class FamHealth(val steps: Int?, val restingHr: Int?, val hr: Int?, val sleepMin: Int?, val activeKcal: Int?, val week: List<FamHealthDay>, val updatedAt: String?)
data class FamMember(
    val userId: String, val name: String, val username: String, val avatarUrl: String?,
    val sharing: String, val precision: String, val last: FamPos?, val health: FamHealth?,
    /** Prompt 22: bildet seeren har valgt for personen (ellers avataren), og personens farge fra serveren. */
    val photoUrl: String? = null, val color: Long? = null,
    /** Prompt 24: én person = én oppføring. Enhetene (devices), valgt kilde (null = automatisk) og antall enheter. */
    val devices: List<FamDevice> = emptyList(), val sourceDevice: String? = null, val deviceCount: Int = 0,
)
data class FamZone(
    val id: String, val name: String, val lat: Double, val lon: Double, val radius: Double, val color: Long, val notify: Map<String, Pair<Boolean, Boolean>>,
    /** Prompt 21 (brukerskille): delt med familien (av som standard), hvem som lagde sonen, og om den er min (bare eieren kan endre). */
    val shared: Boolean = false, val owner: String? = null, val mine: Boolean = true, val ownerName: String? = null,
    /** Prompt 22: ikonnøkkel (home, work, school …). Null på eldre server: standard etter navn. */
    val icon: String? = null,
)
data class FamEvent(val id: String, val userId: String, val zoneId: String, val zoneName: String?, val kind: String, val ts: String?)
data class FamMe(val userId: String, val sharing: String, val precision: String, val shareHealth: Map<String, Boolean>)
data class Family(val me: FamMe?, val members: List<FamMember>, val zones: List<FamZone>, val events: List<FamEvent>)
data class TrackPt(val lat: Double, val lon: Double, val ts: String?, val speed: Double?)

/** Helsefeltene brukeren kan velge å dele (Health Connect). */
val HEALTH_KEYS = listOf("steps" to "Skritt", "restingHr" to "Hvilepuls", "hr" to "Puls", "sleep" to "Søvn", "activeKcal" to "Aktive kalorier", "week" to "Siste 7 dager")

/** Tidspunkt som ISO-tekst, også når serveren sender millisekunder eller sekunder. */
internal fun JSONObject.tsIso(k: String): String? {
    if (!has(k) || isNull(k)) return null
    val v = opt(k)
    if (v is Number) { val n = v.toLong(); return java.time.Instant.ofEpochMilli(if (n < 100_000_000_000L) n * 1000 else n).toString() }
    return optStr(k)
}

private fun parseHealth(h: JSONObject?): FamHealth? {
    if (h == null) return null
    // {today: {...}, week, updatedAt}; eldre format har tallene rett i objektet.
    val o = h.optJSONObject("today") ?: h
    val w = h.optJSONArray("week") ?: JSONArray()
    return FamHealth(
        o.optIntOrNull("steps"), o.optIntOrNull("restingHr"), o.optIntOrNull("hr"), o.optIntOrNull("sleepMin"), o.optIntOrNull("activeKcal"),
        (0 until w.length()).mapNotNull { i ->
            val d = w.optJSONObject(i) ?: return@mapNotNull null
            FamHealthDay(d.optStr("date") ?: "", d.optIntOrNull("steps"), d.optIntOrNull("sleepMin"), d.optIntOrNull("activeKcal"), d.optIntOrNull("restingHr"))
        },
        h.tsIso("updatedAt"),
    )
}

private fun parsePos(o: JSONObject?): FamPos? {
    if (o == null) return null
    val lat = o.optDoubleOrNull("lat") ?: return null
    val lon = o.optDoubleOrNull("lon") ?: return null
    return FamPos(lat, lon, o.optDoubleOrNull("acc"), o.optDoubleOrNull("speed"), o.optDoubleOrNull("heading"), o.tsIso("ts"),
        o.optIntOrNull("battery"), o.optBoolOrNull("charging"), o.optStr("activity"), o.optStr("place"), o.optStr("device") ?: o.optStr("model"))
}

fun parseFamEvents(a: JSONArray?): List<FamEvent> = if (a == null) emptyList() else (0 until a.length()).mapNotNull { i ->
    val e = a.optJSONObject(i) ?: return@mapNotNull null
    FamEvent(e.optStr("id") ?: "$i", e.optStr("userId") ?: "", e.optStr("zoneId") ?: "", e.optStr("zoneName") ?: e.optStr("zone"), e.optStr("kind") ?: "enter", e.tsIso("ts"))
}

fun parseFamily(s: String): Family {
    val o = JSONObject(s)
    val me = o.optJSONObject("me")?.let { m ->
        val sh = m.optJSONObject("shareHealth")
        FamMe(m.optStr("userId") ?: "", m.optStr("sharing") ?: "off", m.optStr("precision") ?: "exact",
            HEALTH_KEYS.associate { (k, _) -> k to (sh?.optBoolean(k, false) ?: false) })
    }
    val ms = o.optJSONArray("members") ?: JSONArray()
    val members = (0 until ms.length()).mapNotNull { i ->
        val m = ms.optJSONObject(i) ?: return@mapNotNull null
        FamMember(m.optStr("userId") ?: "$i", m.optStr("name") ?: m.optStr("username") ?: "Person", m.optStr("username") ?: "", m.optStr("avatarUrl"),
            m.optStr("sharing") ?: "off", m.optStr("precision") ?: "exact", parsePos(m.optJSONObject("last")), parseHealth(m.optJSONObject("health")),
            photoUrl = m.optStr("photoUrl"), color = m.optStr("color")?.takeIf { it.matches(Regex("#[0-9a-fA-F]{6}")) }?.let(::color),
            devices = parseFamDevices24(m), sourceDevice = parseFamSource24(m), deviceCount = m.optInt("deviceCount", 0))
    }.let(::dedupeFamily24)
    val zs = o.optJSONArray("zones") ?: JSONArray()
    val zones = (0 until zs.length()).mapNotNull { i ->
        val z = zs.optJSONObject(i) ?: return@mapNotNull null
        val notify = mutableMapOf<String, Pair<Boolean, Boolean>>()
        z.optJSONObject("notify")?.let { n -> n.keys().forEach { k -> n.optJSONObject(k)?.let { v -> notify[k] = v.optBoolean("enter") to v.optBoolean("leave") } } }
        val owner = z.optStr("owner") ?: z.optStr("createdBy") ?: z.optStr("created_by")
        val mine = if (z.has("mine") && !z.isNull("mine")) z.optBoolean("mine") else (owner == null || owner == me?.userId)
        FamZone(z.optStr("id") ?: "$i", z.optStr("name") ?: "Sone", z.optDouble("lat", 0.0), z.optDouble("lon", 0.0), z.optDouble("radius", 150.0),
            z.optStr("color")?.let(::color) ?: 0xFFB23A2A, notify,
            shared = z.optBoolean("shared", false) || z.optInt("shared", 0) == 1, owner = owner, mine = mine, ownerName = z.optStr("ownerName"),
            icon = z.optStr("icon"))
    }
    return Family(me, members, zones, parseFamEvents(o.optJSONArray("events")))
}

fun parseTrack(s: String): List<TrackPt> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("points") ?: JSONArray()
    return (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        TrackPt(o.optDoubleOrNull("lat") ?: return@mapNotNull null, o.optDoubleOrNull("lon") ?: return@mapNotNull null, o.tsIso("ts"), o.optDoubleOrNull("speed"))
    }
}

/** Norsk tekst for aktiviteten fra mobilen. */
fun activityText(a: String?): String = when (a) {
    "still" -> "I ro"; "walking" -> "Går"; "running" -> "Løper"; "cycling" -> "Sykler"; "driving" -> "Kjører"; null, "" -> "Ukjent"; else -> a
}

/* ---------- Boliger: kommende forfall og kvitteringer (GET /folders/:id, nyere server) ---------- */

data class FolderUpcoming(val kind: String, val title: String, val sub: String?, val amount: Double?, val date: String?, val days: Int?, val color: Long?)
data class FolderReceipt(val entryId: Int?, val receiptId: Int?, val description: String, val date: String, val amount: Double, val pending: Boolean, val category: String?, val thumbUrl: String?, val fileUrl: String?)
data class FolderExtra(val upcoming: List<FolderUpcoming>, val receipts: List<FolderReceipt>)

fun parseFolderExtra(s: String): FolderExtra {
    val o = JSONObject(s)
    val up = o.optJSONArray("upcoming") ?: JSONArray()
    val rc = o.optJSONArray("receipts") ?: JSONArray()
    return FolderExtra(
        (0 until up.length()).mapNotNull { i ->
            val u = up.optJSONObject(i) ?: return@mapNotNull null
            FolderUpcoming(u.optStr("kind") ?: "bill", u.optStr("title") ?: "", u.optStr("sub"), u.optDoubleOrNull("amount"), u.optStr("date"), u.optIntOrNull("days"), u.optStr("color")?.let(::color))
        },
        (0 until rc.length()).mapNotNull { i ->
            val r = rc.optJSONObject(i) ?: return@mapNotNull null
            FolderReceipt(r.optIntOrNull("entryId"), r.optIntOrNull("receiptId"), r.optStr("description") ?: "Kvittering", r.optStr("date") ?: "", r.num("amount"),
                r.optBoolean("pending", false), r.optStr("category"), r.optStr("thumbUrl"), r.optStr("fileUrl"))
        },
    )
}
