package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject

/* ---------------- Prompt 16–17: huskeliste, varsler, appnavn og -ikon, vær sammenlignet ---------------- */

/* ---------- Huskeliste (/api/tasks, delt i familien) ---------- */

data class TaskList(
    val id: String, val name: String, val color: Long,
    /** Prompt 21: eieren av listen (id og navn), personene den er delt med, og om listen er min (bare eieren kan dele og slette). */
    val owner: String? = null, val ownerName: String? = null, val members: List<TaskMember> = emptyList(), val mine: Boolean = true,
)
data class TaskItem(
    val id: String, val title: String, val list: String?, val due: String?, val assignee: String?,
    val done: Boolean, val doneAt: String?, val createdBy: String?,
)
data class TaskMember(val id: String, val name: String)
data class TasksData(val lists: List<TaskList>, val items: List<TaskItem>, val members: List<TaskMember>)

fun parseTasks(s: String): TasksData {
    val o = JSONObject(s)
    val la = o.optJSONArray("lists") ?: JSONArray()
    val lists = (0 until la.length()).mapNotNull { i ->
        val l = la.optJSONObject(i) ?: return@mapNotNull null
        parseTaskList(l)
    }
    val ia = o.optJSONArray("items") ?: JSONArray()
    val items = (0 until ia.length()).mapNotNull { i ->
        val t = ia.optJSONObject(i) ?: return@mapNotNull null
        TaskItem(
            t.optStr("id") ?: return@mapNotNull null, t.optStr("title") ?: "", t.optStr("list"), t.optStr("due")?.take(10),
            t.optStr("assignee"), t.optBoolean("done", false), t.optStr("doneAt"), t.optStr("createdBy"),
        )
    }
    val ma = o.optJSONArray("members") ?: JSONArray()
    val members = (0 until ma.length()).mapNotNull { i ->
        val m = ma.optJSONObject(i) ?: return@mapNotNull null
        TaskMember(m.optStr("id") ?: m.optStr("userId") ?: return@mapNotNull null, m.optStr("name") ?: m.optStr("username") ?: "")
    }
    return TasksData(lists, items, members)
}

/** Én liste fra /api/tasks eller /api/tasks/lists, med eier og medlemmer når serveren sender dem (eldre server: min, ikke delt). */
fun parseTaskList(l: JSONObject): TaskList? {
    val id = l.optStr("id") ?: return null
    val ow = l.optJSONObject("owner")
    val owner = ow?.let { it.optStr("id") ?: it.optStr("userId") } ?: l.optStr("owner")
    val ownerName = ow?.let { it.optStr("name") ?: it.optStr("username") } ?: l.optStr("ownerName")
    val ma = l.optJSONArray("members") ?: JSONArray()
    val members = (0 until ma.length()).mapNotNull { i ->
        val m = ma.optJSONObject(i) ?: return@mapNotNull ma.optString(i).takeIf { it.isNotBlank() }?.let { TaskMember(it, "") }
        TaskMember(m.optStr("id") ?: m.optStr("userId") ?: return@mapNotNull null, m.optStr("name") ?: m.optStr("username") ?: "")
    }
    val mine = if (l.has("mine") && !l.isNull("mine")) l.optBoolean("mine") else true
    return TaskList(id, l.optStr("name") ?: "Liste", parseHex(l.optStr("color")) ?: 0xFF6B665C, owner, ownerName, members, mine)
}

/** GET /api/tasks/lists → [..] eller {lists:[..]}. */
fun parseTaskLists(s: String): List<TaskList> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("lists") ?: JSONArray()
    return (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let(::parseTaskList) }
}

/** /api/users for vanlige brukere: bare id, navn og avatar. */
fun parseUserList(s: String): List<TaskMember> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("users") ?: it.optJSONArray("items") ?: JSONArray() }
    return (0 until a.length()).mapNotNull { i ->
        val u = a.optJSONObject(i) ?: return@mapNotNull null
        TaskMember(u.optStr("id") ?: u.optStr("userId") ?: return@mapNotNull null, u.optStr("name") ?: u.optStr("username") ?: "")
    }
}

/** Standardlistene (brukes før serveren har svart). */
val TASK_LISTS_DEFAULT = listOf(
    TaskList("hjem", "Hjem", 0xFF2F7A4F), TaskList("handel", "Handel", 0xFFB23A2A),
    TaskList("hytta", "Hytta", 0xFF2F5D8A), TaskList("jobb", "Jobb", 0xFF8A5A44),
)

private fun parseHex(s: String?): Long? {
    val h = s?.trim()?.removePrefix("#") ?: return null
    if (h.length != 6) return null
    return h.toLongOrNull(16)?.let { 0xFF000000 or it }
}

/* ---------- Varsler (/api/me/notify) ---------- */

data class NotifyPrefs(
    val on: Boolean = true, val quietFrom: String = "22:00", val quietTo: String = "07:00", val quiet: Boolean = true,
    val sound: String = "klokke", val volume: Int = 80, val groups: Map<String, Boolean> = NOTIFY_GROUPS.associate { it.first to true },
    val customSound: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject().put("on", on).put("quietOn", quiet).put("quietFrom", quietFrom).put("quietTo", quietTo)
        .put("sound", sound).put("volume", volume).put("groups", JSONObject().apply { groups.forEach { (k, v) -> put(k, v) } })
}

/** Gruppene i Innstillinger → Varsler. */
val NOTIFY_GROUPS = listOf(
    "pakker" to "Pakker", "finans" to "Finans og hjem", "familie" to "Familie", "reise" to "Reise og vær", "haptikk" to "Haptikk",
)
/** Varsellydene: fem innebygde (res/raw/varsel_<id>.wav), egen lyd og stille. */
val NOTIFY_SOUNDS = listOf(
    "klokke" to "Klokke", "pling" to "Pling", "papir" to "Papir", "dobbel" to "Dobbel", "dyp" to "Dyp", "egen" to "Egen lyd", "stille" to "Stille",
)

fun parseNotifyPrefs(s: String): NotifyPrefs {
    val o = JSONObject(s).let { it.optJSONObject("notify") ?: it }
    val g = o.optJSONObject("groups")
    return NotifyPrefs(
        on = o.optBoolean("on", true),
        quietFrom = o.optStr("quietFrom") ?: "22:00", quietTo = o.optStr("quietTo") ?: "07:00", quiet = o.optBoolean("quietOn", true),
        sound = o.optStr("sound")?.takeIf { k -> NOTIFY_SOUNDS.any { it.first == k } } ?: "klokke",
        volume = o.optInt("volume", 80).coerceIn(0, 100),
        groups = NOTIFY_GROUPS.associate { (k, _) -> k to (g?.optBoolean(k, true) ?: true) },
        customSound = o.optBoolean("customSound", false) || o.optStr("customSoundUrl") != null,
    )
}

/* ---------- Appnavn og -ikon (/api/app) ---------- */

data class AppInfo(val name: String, val icon: String)

/** Ikonene i Innstillinger → App-ikon: nøkkel (serveren), navn og alias i manifestet. */
val APP_ICONS = listOf(
    Triple("hus", "Huset med stativ", "IconHus"),
    Triple("monogram", "Papir-monogram", "IconMonogram"),
    Triple("rom", "Fire rom", "IconRom"),
)

fun parseAppInfo(s: String): AppInfo {
    val o = JSONObject(s).let { it.optJSONObject("app") ?: it }
    return AppInfo(o.optStr("name")?.take(40) ?: "Homelab", o.optStr("icon")?.takeIf { k -> APP_ICONS.any { it.first == k } } ?: "hus")
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

/* ---------- Bolig-widget på Hjem ---------- */

data class HomeBolig(val id: String, val name: String, val spent: Double, val budget: Double?, val review: Int, val nextTitle: String?, val nextAmount: Double?, val nextDate: String?)
