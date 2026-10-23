package no.kristo.kalender

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate

/*
 * Prompt 35 (KALAND35): felles for Kalender-appen (fasit: Kalender App.dc.html → ask()/dayOf(), calApply(), genRows/notRows).
 *  - parseDay35(): felles dag-tolkning («i morgen?», «imorgen», «i morra», «tomorrow», «overmorgen», «i går», ukedag, dato).
 *  - Kal35Prefs: Innstillinger (Uken starter, Åpne i, Standard varighet, Tidslinje starter, varsler), lokale kalenderfarger og
 *    «Skjul fra menyen» (brukes når serveren ikke kan lagre dem ennå), synk mot PUT /api/kalender/calendars/prefs.
 *  - Kal35Repo: PATCH farge/hidMenu, iCal-abonnement og Home Assistant (SERVER35, «Felles API» i kontrakten).
 */

/* ---------------- Dag-tolkning ---------------- */

/** Små bokstaver, uten ? ! , ; « » " (og . / : som ikke står mellom tall), ett mellomrom, og mellomrom foran og bak. */
fun norm35(q: String): String {
    var s = q.lowercase().replace('\n', ' ').replace(Regex("[?!,;«»\"“”]"), " ").replace("'", "")
    s = s.replace(Regex("(?<!\\d)[.:]|[.:](?!\\d)"), " ")
    return " " + s.replace(Regex("\\s+"), " ").trim() + " "
}

private val MX35 = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")

/**
 * Dagen et spørsmål handler om, eller null. Godtar råtekst eller norm35-tekst.
 * overmorgen/overimorgen → +2 · i morgen/imorgen/i morra/imorgo/tomorrow → +1 · i dag/idag/i kveld/i natt/today/tonight → 0 ·
 * i går → −1 · (neste) fredag · 25.10 / 25.10.27 · 25. okt.
 */
fun parseDay35(q: String, T: LocalDate = today()): LocalDate? {
    val ql = if (q.startsWith(" ") && q.endsWith(" ")) q else norm35(q)
    if (Regex(" (i )?(overmorgen|overimorgen|over i morgen) | day after tomorrow ").containsMatchIn(ql)) return T.plusDays(2)
    if (Regex(" (i ?morgen|i ?morra|imorgo|tomorrow) ").containsMatchIn(ql)) return T.plusDays(1)
    if (Regex(" (i ?går|igår|yesterday) ").containsMatchIn(ql)) return T.minusDays(1)
    if (Regex(" (i ?dag|i ?kveld|i ?natt|today|tonight) ").containsMatchIn(ql)) return T
    Regex("(neste\\s+)?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag)").find(ql)?.let { m ->
        var df = ((WD.indexOf(m.groupValues[2]) - T.jsDay + 7) % 7).let { if (it == 0) 7 else it }
        if (m.groupValues[1].isNotEmpty() && df < 7) df += 7
        return T.plusDays(df.toLong())
    }
    Regex("(?<!\\d)(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?(?!\\d)").find(ql)?.let { m ->
        val y = m.groupValues[3].toIntOrNull()?.let { if (it < 100) 2000 + it else it } ?: T.year
        return runCatching { LocalDate.of(y, m.groupValues[2].toInt(), m.groupValues[1].toInt()) }.getOrNull()
    }
    Regex("(?<!\\d)(\\d{1,2})\\.? (jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)").find(ql)?.let { m ->
        return runCatching { LocalDate.of(T.year, MX35.indexOf(m.groupValues[2]) + 1, m.groupValues[1].toInt()) }.getOrNull()
    }
    return null
}

/* ---------------- Uke ---------------- */

/** Første dag i uka etter «Uken starter» (mandag / søndag). */
fun wkStart35(d: LocalDate, sun: Boolean): LocalDate = if (sun) d.minusDays((d.jsDay).toLong()) else mon(d)

/** Ukenummer (ISO 8601) for uka som starter med d0 etter innstillingen: søndag-start teller med mandagen etter. */
fun wkNo35(d: LocalDate, sun: Boolean): Int = isoW(if (sun) d.plusDays(1) else d)

/* ---------------- Farger ---------------- */

/** Fargevelgeren (12 farger, fasitens SWC). */
val SWC35: List<Long> = listOf(
    0xFFB23A2A, 0xFFE8794A, 0xFFA8661A, 0xFFC9A227, 0xFF2F7A4F, 0xFF3D7F8A, 0xFF2B5D8A, 0xFF5B4FC4, 0xFF8A3FA0, 0xFFC2477A, 0xFF6B665C, 0xFF1B1A17,
)

/** mixC(c, t, k): c blandet med t (k = andel av t). */
fun mix35(c: Long, t: Long, k: Float): Long {
    fun ch(x: Long, sh: Int) = ((x shr sh) and 0xFF).toInt()
    fun m(sh: Int) = Math.round(ch(c, sh) * (1 - k) + ch(t, sh) * k).coerceIn(0, 255).toLong()
    return 0xFF000000L or (m(16) shl 16) or (m(8) shl 8) or m(0)
}

/** Kalender med ny farge: tekstfarger regnes ut (tx = 28 % mot svart, lt = 45 % mot hvitt). Fasitens egne seks beholder sine. */
fun KCal.withColor35(c: Long): KCal {
    val base = KCALS.firstOrNull { it.c == c && (it.id == id || it.id == key) }
    return copy(c = c, tx = base?.tx ?: mix35(c, 0xFF000000, .28f), lt = base?.lt ?: mix35(c, 0xFFFFFFFF, .45f))
}

/** Kalenderne med lokale valg lagt på (farge og «Skjul fra menyen» som ikke er lagret på serveren ennå). */
fun cals35(ctx: Context, l: List<KCal>): List<KCal> {
    val col = Kal35Prefs.colors(ctx)
    val hm = Kal35Prefs.hidMenu(ctx)
    if (col.isEmpty() && hm.isEmpty()) return l
    return l.map { c ->
        var x = c
        col[c.id]?.let { x = x.withColor35(it) }
        hm[c.id]?.let { x = x.copy(hidMenu = it) }
        x
    }
}

/** Kalendere som ikke skal vises (slått av, eller skjult fra menyen). Brukes av widgetene og varslene. */
fun hiddenAll35(ctx: Context): Set<String> {
    val l = cals35(ctx, KalStore.current(ctx).cals)
    return KalPrefs.hidden(ctx) + l.filter { it.hidMenu }.map { it.id }
}

/* ---------------- Innstillinger ---------------- */

object Kal35Prefs {
    private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences("kalender_prefs", Context.MODE_PRIVATE)

    /** «Uken starter»: mon | sun. */
    fun weekStart(ctx: Context): String = p(ctx).getString("p35_ws", "mon") ?: "mon"
    fun sunStart(ctx: Context): Boolean = weekStart(ctx) == "sun"
    /** «Åpne i»: mnd | uke | 3d | dag | liste. */
    fun openView(ctx: Context): String = p(ctx).getString("p35_ov", "mnd") ?: "mnd"
    /** «Standard varighet» i minutter (30 / 60 / 90 / 120). */
    fun defDur(ctx: Context): Int = p(ctx).getInt("p35_dd", 60)
    /** «Tidslinje starter»: now | 06 | 08. */
    fun tlStart(ctx: Context): String = p(ctx).getString("p35_tl", "now") ?: "now"
    fun notifyBirthdays(ctx: Context) = p(ctx).getBoolean("p35_nbd", true)
    fun notifyDeadlines(ctx: Context) = p(ctx).getBoolean("p35_nfr", true)
    fun notifyBrief(ctx: Context) = p(ctx).getBoolean("p35_nbr", true)
    fun travelTime(ctx: Context) = p(ctx).getBoolean("p35_ntv", false)

    fun setStr(ctx: Context, k: String, v: String) = p(ctx).edit().putString(k, v).apply()
    fun setInt(ctx: Context, k: String, v: Int) = p(ctx).edit().putInt(k, v).apply()
    fun setBool(ctx: Context, k: String, v: Boolean) = p(ctx).edit().putBoolean(k, v).apply()

    /** Lokale kalenderfarger {id: farge} (til serveren har lagret dem). */
    fun colors(ctx: Context): Map<String, Long> = runCatching {
        val o = JSONObject(p(ctx).getString("p35_col", "{}") ?: "{}")
        o.keys().asSequence().mapNotNull { k -> hexIn(o.optString(k))?.let { k to it } }.toMap()
    }.getOrDefault(emptyMap())
    fun setColor(ctx: Context, id: String, c: Long?) {
        val o = runCatching { JSONObject(p(ctx).getString("p35_col", "{}") ?: "{}") }.getOrDefault(JSONObject())
        if (c == null) o.remove(id) else o.put(id, hexOut(c))
        p(ctx).edit().putString("p35_col", o.toString()).apply()
    }

    /** Lokale «Skjul fra menyen» {id: true|false} (til serveren har lagret dem). */
    fun hidMenu(ctx: Context): Map<String, Boolean> = runCatching {
        val o = JSONObject(p(ctx).getString("p35_hm", "{}") ?: "{}")
        o.keys().asSequence().associateWith { o.optBoolean(it) }
    }.getOrDefault(emptyMap())
    fun setHidMenu(ctx: Context, id: String, v: Boolean?) {
        val o = runCatching { JSONObject(p(ctx).getString("p35_hm", "{}") ?: "{}") }.getOrDefault(JSONObject())
        if (v == null) o.remove(id) else o.put(id, v)
        p(ctx).edit().putString("p35_hm", o.toString()).apply()
    }

    /** Nøkler serveren ikke tar imot ennå (400): de lagres bare her, og serverens verdi overstyrer dem ikke. */
    fun localOnly(ctx: Context): Set<String> = p(ctx).getStringSet("p35_local", emptySet())?.toSet() ?: emptySet()
    fun markLocal(ctx: Context, k: String, on: Boolean) {
        val s = localOnly(ctx)
        p(ctx).edit().putStringSet("p35_local", if (on) s + k else s - k).apply()
    }

    /** Første synk med prompt 35: telefonens valg sendes til profilen i stedet for å hentes. */
    fun pushed(ctx: Context) = p(ctx).getBoolean("p35_pushed", false)
    fun setPushed(ctx: Context) = p(ctx).edit().putBoolean("p35_pushed", true).apply()

    /** Telefonens valg i serverens format (PUT /api/kalender/calendars/prefs). */
    fun all(ctx: Context): Map<String, Any> = mapOf(
        "weekStart" to weekStart(ctx), "openView" to openView(ctx), "defaultDuration" to defDur(ctx), "timelineStart" to tlStart(ctx),
        "notifyBirthdays" to notifyBirthdays(ctx), "notifyDeadlines" to notifyDeadlines(ctx), "notifyBrief" to notifyBrief(ctx), "travelTime" to travelTime(ctx),
        "weekNumbers" to KalPrefs.weekNo(ctx), "weather" to KalPrefs.weather(ctx), "theme" to KalPrefs.theme(ctx), "defaultReminder" to remToPref(KalPrefs.defRem(ctx)),
    )

    fun remToPref(r: Int?): String = when (r) { null -> "none"; 10 -> "10m"; 30 -> "30m"; 60 -> "1h"; 1440 -> "1d"; else -> if (r >= 1440) "1d" else if (r >= 60) "1h" else "30m" }
    private fun remFromPref(s: String): Int? = when (s) { "none" -> null; "10m" -> 10; "30m" -> 30; "1h" -> 60; "1d" -> 1440; else -> 60 }

    /** Profilens valg (prefs i GET /api/kalender/calendars) → telefonen. Ukjente/manglende felt hoppes over. */
    fun applyServer(ctx: Context, prefs: JSONObject?) {
        if (prefs == null) return
        val skip = localOnly(ctx)
        fun has(k: String) = prefs.has(k) && !prefs.isNull(k) && k !in skip
        if (has("weekStart")) prefs.optString("weekStart").takeIf { it == "mon" || it == "sun" }?.let { setStr(ctx, "p35_ws", it) }
        if (has("openView")) prefs.optString("openView").takeIf { it in setOf("mnd", "uke", "3d", "dag", "liste") }?.let { setStr(ctx, "p35_ov", it) }
        if (has("defaultDuration")) prefs.optInt("defaultDuration", 60).takeIf { it in setOf(30, 60, 90, 120) }?.let { setInt(ctx, "p35_dd", it) }
        if (has("timelineStart")) prefs.optString("timelineStart").takeIf { it in setOf("now", "06", "08") }?.let { setStr(ctx, "p35_tl", it) }
        if (has("notifyBirthdays")) setBool(ctx, "p35_nbd", prefs.optBoolean("notifyBirthdays", true))
        if (has("notifyDeadlines")) setBool(ctx, "p35_nfr", prefs.optBoolean("notifyDeadlines", true))
        if (has("notifyBrief")) setBool(ctx, "p35_nbr", prefs.optBoolean("notifyBrief", true))
        if (has("travelTime")) setBool(ctx, "p35_ntv", prefs.optBoolean("travelTime", false))
        if (has("weekNumbers")) KalPrefs.setWeekNo(ctx, prefs.optBoolean("weekNumbers", true))
        if (has("weather")) KalPrefs.setWeather(ctx, prefs.optBoolean("weather", true))
        if (has("theme")) prefs.optString("theme").takeIf { it in setOf("system", "light", "dark") }?.let { KalPrefs.setTheme(ctx, it) }
        if (has("defaultReminder")) KalPrefs.setDefRem(ctx, remFromPref(prefs.optString("defaultReminder")))
        // Prompt 46: standardkalenderen (samme som web, Homelab og Glimt).
        if (prefs.has("defaultCalendar") && !prefs.isNull("defaultCalendar")) prefs.optString("defaultCalendar").takeIf { it.isNotBlank() }?.let { Kal46Prefs.setDefCal(ctx, it) }
    }
}

/* ---------------- Server ---------------- */

/** Én Home Assistant-kalender (GET /api/kalender/ha/calendars). */
data class KHa35(val id: String, val name: String, val added: Boolean)

class KHaList35(val connected: Boolean, val entities: List<KHa35>, val error: String? = null)

object Kal35Repo {
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    /** Ett valg til profilen. Serveren uten feltet (400/404) → valget blir lokalt. */
    suspend fun putPref(ctx: Context, s: KalSession, k: String, v: Any) {
        try {
            s.api.request("PUT", "/api/kalender/calendars/prefs", JSONObject().put(k, v))
            Kal35Prefs.markLocal(ctx, k, false)
        } catch (e: KalApiException) {
            if (e.status in 400..499) Kal35Prefs.markLocal(ctx, k, true)
        }
    }

    /** Første gang: alle telefonens valg til profilen (én nøkkel per kall, så eldre servere tar imot de de kjenner). */
    suspend fun pushAll(ctx: Context, s: KalSession) {
        Kal35Prefs.all(ctx).forEach { (k, v) -> putPref(ctx, s, k, v) }
        Kal35Prefs.setPushed(ctx)
    }

    /** PATCH /api/kalender/calendars/:id {color?|hidMenu?}. true = lagret på serveren. */
    suspend fun patchCal(s: KalSession, c: KCal, body: JSONObject): Boolean {
        val sid = c.serverId ?: return false
        return try { s.api.patch("/api/kalender/calendars/" + enc(sid), body); true } catch (e: KalApiException) { false }
    }

    /** POST /api/kalender/calendars/ical {url, name, color} → 201 {calendar}. webcal:// gjøres om til https:// på serveren. */
    suspend fun addIcal(s: KalSession, url: String, name: String, color: Long) {
        s.api.post("/api/kalender/calendars/ical", JSONObject().put("url", url.trim()).put("name", name.trim()).put("color", hexOut(color)))
    }

    /** GET /api/kalender/ha/calendars → {connected, entities:[{entity_id, name, added}]}. */
    suspend fun haList(s: KalSession): KHaList35 = try {
        val o = JSONObject(s.api.get("/api/kalender/ha/calendars", timeout = 10_000))
        val a = o.optJSONArray("entities") ?: o.optJSONArray("calendars") ?: JSONArray()
        val l = (0 until a.length()).mapNotNull { i ->
            val x = a.optJSONObject(i) ?: return@mapNotNull null
            val id = x.str("entity_id", "id") ?: return@mapNotNull null
            KHa35(id, x.str("name", "friendly_name") ?: id.removePrefix("calendar."), x.optBoolean("added", false))
        }
        KHaList35(o.optBoolean("connected", l.isNotEmpty()), l)
    } catch (e: KalApiException) {
        KHaList35(false, emptyList(), if (e.status == 404) "Serveren støtter ikke Home Assistant-kalendere ennå. Oppdater Homelab." else e.message)
    }

    /** POST /api/kalender/calendars/ha {entities:[…]} → {calendars}. Farger fordeles fra startfargen (som i fasiten). */
    suspend fun addHa(s: KalSession, ids: List<String>, color: Long) {
        val i0 = SWC35.indexOf(color).coerceAtLeast(0)
        val colors = JSONObject().apply { ids.forEachIndexed { ix, id -> put(id, hexOut(SWC35[(i0 + ix * 2) % SWC35.size])) } }
        s.api.post("/api/kalender/calendars/ha", JSONObject().put("entities", JSONArray(ids)).put("colors", colors))
    }
}

/** Navnet gjettes fra domenet i iCal-lenken («https://www.fotball.no/…» → «Fotball»). */
fun icalName35(url: String): String {
    val host = Regex("//([^/]+)").find(url)?.groupValues?.get(1) ?: return ""
    return cap(host.removePrefix("www.").split('.').firstOrNull().orEmpty())
}

fun icalOk35(url: String): Boolean = Regex("^(webcal|https?)://\\S+", RegexOption.IGNORE_CASE).containsMatchIn(url.trim())

/** «+ Legg til kalender»-panelet: fane (ics | ha | acc), iCal-lenke og navn, farge, Home Assistant-lista og valgte entiteter. */
data class KAdd35(
    val tab: String = "ics", val url: String = "", val name: String = "", val c: Long = SWC35[6],
    val ha: KHaList35? = null, val sel: List<String> = emptyList(), val haBusy: Boolean = false, val busy: Boolean = false,
)
