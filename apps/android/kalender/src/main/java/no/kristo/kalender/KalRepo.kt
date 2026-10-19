package no.kristo.kalender

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URLEncoder
import java.time.LocalDate

/*
 * Prompt 33: data i Kalender-appen. Serveren er sannheten; telefonen har bare en cache (filesDir/kal_cache.json) for
 * visning uten nett og for widgetene og varslene, pluss en utboks for endringer gjort uten nett.
 *   GET  /api/kalender?from=&to=          hendelsene (samme som Homelab)
 *   GET  /api/kalender/calendars          kalenderne med farge, synlighet og antall (SERVER33; 404 → fasitens seks)
 *   POST/PATCH/DELETE /api/kalender/calendars[/:id]  egne kalendere / synlighet
 *   GET  /api/kalender/weather?from=&to=  vær per dag (SERVER33; 404 → Open-Meteo direkte for Oslo)
 *   POST /api/kalender/events · PATCH/DELETE /api/kalender/events/:id
 */

data class KData(
    val events: List<KEv> = emptyList(),
    val cals: List<KCal> = KCALS,
    val wx: Map<LocalDate, KWx> = emptyMap(),
    val at: Long = 0,
    val serverCals: Boolean = false,
    val acct: String? = null,
)

object KalStore {
    private const val FILE = "kal_cache.json"
    val data = MutableStateFlow<KData?>(null)

    private fun file(ctx: Context) = File(ctx.applicationContext.filesDir, FILE)

    fun current(ctx: Context): KData = data.value ?: load(ctx).also { data.value = it }

    private fun load(ctx: Context): KData = runCatching {
        val o = JSONObject(file(ctx).readText())
        val cals = o.optJSONArray("cals")?.let { a -> (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let(::calFrom) } }?.takeIf { it.isNotEmpty() } ?: KCALS
        val evs = o.optJSONArray("events")?.let { a -> (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let(KEv::fromJson) } } ?: emptyList()
        val wx = HashMap<LocalDate, KWx>()
        o.optJSONObject("wx")?.let { w -> w.keys().forEach { k -> w.optJSONObject(k)?.let { x -> runCatching { wx[LocalDate.parse(k)] = KWx(x.optInt("c", 3), x.optInt("hi"), x.optInt("lo")) } } } }
        KData(evs, cals, wx, o.optLong("at"), o.optBoolean("serverCals"), o.optStrOrNull("acct"))
    }.getOrDefault(KData())

    fun save(ctx: Context, d: KData) {
        data.value = d
        runCatching {
            val o = JSONObject().put("at", d.at).put("serverCals", d.serverCals).put("acct", d.acct ?: JSONObject.NULL)
                .put("events", JSONArray().apply { d.events.forEach { put(it.toJson()) } })
                .put("cals", JSONArray().apply { d.cals.forEach { put(calTo(it)) } })
                .put("wx", JSONObject().apply { d.wx.forEach { (k, v) -> put(k.toString(), JSONObject().put("c", v.c).put("hi", v.hi).put("lo", v.lo)) } })
            val f = file(ctx)
            val tmp = File(f.parentFile, "$FILE.tmp")
            tmp.writeText(o.toString())
            tmp.renameTo(f)
        }
    }

    /** Utlogging eller ny konto: tøm alt. */
    fun clear(ctx: Context) { data.value = KData(); runCatching { file(ctx).delete() }; KalOutbox.clear(ctx) }

    private fun calTo(c: KCal) = JSONObject().put("id", c.id).put("n", c.n).put("c", hexOut(c.c)).put("tx", hexOut(c.tx)).put("lt", hexOut(c.lt))
        .put("writable", c.writable).put("vis", c.serverVisible).put("count", c.count ?: JSONObject.NULL).put("own", c.own).put("sid", c.serverId ?: JSONObject.NULL)
        .put("key", c.key ?: JSONObject.NULL).put("src", c.src ?: JSONObject.NULL).put("badge", c.badge ?: JSONObject.NULL).put("hm", c.hidMenu)

    private fun calFrom(o: JSONObject): KCal? = runCatching {
        KCal(o.getString("id"), o.getString("n"), hexIn(o.optString("c")) ?: 0xFF5C5850, hexIn(o.optString("tx")) ?: 0xFF3D3A33, hexIn(o.optString("lt")) ?: 0xFFD6CFC2,
            o.optBoolean("writable", true), o.optBoolean("vis", true), o.optIntOrNull("count"), o.optBoolean("own"), o.optStrOrNull("sid"),
            o.optStrOrNull("key"), o.optStrOrNull("src"), o.optStrOrNull("badge"), o.optBoolean("hm", false))
    }.getOrNull()
}

/** Valg som bare gjelder denne telefonen (fasitens state: hid, sw, swx, drem, kalapp_th, og varsler endret per hendelse). */
object KalPrefs {
    private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences("kalender_prefs", Context.MODE_PRIVATE)
    fun hidden(ctx: Context): Set<String> = p(ctx).getStringSet("hid", emptySet())?.toSet() ?: emptySet()
    fun setHidden(ctx: Context, s: Set<String>) = p(ctx).edit().putStringSet("hid", s).apply()
    fun weekNo(ctx: Context) = p(ctx).getBoolean("sw", true)
    fun setWeekNo(ctx: Context, v: Boolean) = p(ctx).edit().putBoolean("sw", v).apply()
    fun weather(ctx: Context) = p(ctx).getBoolean("swx", true)
    fun setWeather(ctx: Context, v: Boolean) = p(ctx).edit().putBoolean("swx", v).apply()
    /** Standardvarsel for nye hendelser (minutter, -1 = ingen). */
    fun defRem(ctx: Context): Int? = p(ctx).getInt("drem", 60).takeIf { it >= 0 }
    fun setDefRem(ctx: Context, v: Int?) = p(ctx).edit().putInt("drem", v ?: -1).apply()
    /** «kalapp_th»: system | light | dark. */
    fun theme(ctx: Context): String = p(ctx).getString("kalapp_th", "system") ?: "system"
    fun setTheme(ctx: Context, v: String) = p(ctx).edit().putString("kalapp_th", v).apply()
    fun view(ctx: Context): String = p(ctx).getString("view", "mnd") ?: "mnd"
    fun setView(ctx: Context, v: String) = p(ctx).edit().putString("view", v).apply()

    /** Varsel endret i hendelsesarket (gjelder også skolens hendelser, som ikke kan endres på serveren). */
    fun remOverrides(ctx: Context): Map<String, Int?> = runCatching {
        val o = JSONObject(p(ctx).getString("rem", "{}") ?: "{}")
        o.keys().asSequence().associateWith { k -> if (o.isNull(k)) null else o.optInt(k) }
    }.getOrDefault(emptyMap())
    fun setRemOverride(ctx: Context, id: String, r: Int?) {
        val o = runCatching { JSONObject(p(ctx).getString("rem", "{}") ?: "{}") }.getOrDefault(JSONObject())
        o.put(id, r ?: JSONObject.NULL)
        p(ctx).edit().putString("rem", o.toString()).apply()
    }
    fun asked(ctx: Context, k: String): Boolean = p(ctx).getBoolean("asked_$k", false)
    fun setAsked(ctx: Context, k: String) = p(ctx).edit().putBoolean("asked_$k", true).apply()
}

/** Endringer som ikke nådde serveren (uten nett). Sendes ved neste synk. */
object KalOutbox {
    private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences("kalender_outbox", Context.MODE_PRIVATE)
    fun list(ctx: Context): List<JSONObject> = runCatching { JSONArray(p(ctx).getString("ops", "[]")).let { a -> (0 until a.length()).map { a.getJSONObject(it) } } }.getOrDefault(emptyList())
    private fun put(ctx: Context, l: List<JSONObject>) = p(ctx).edit().putString("ops", JSONArray().apply { l.forEach { put(it) } }.toString()).apply()
    fun add(ctx: Context, op: JSONObject) = put(ctx, list(ctx) + op)
    fun remove(ctx: Context, pred: (JSONObject) -> Boolean) = put(ctx, list(ctx).filterNot(pred))
    fun clear(ctx: Context) = p(ctx).edit().clear().apply()
}

object KalRepo {
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    /** Kalendere for skriving: serverens id når serveren har /api/kalender/calendars, ellers privat/familie. */
    fun writeCal(d: KData, cal: String): String = if (d.serverCals) (d.cals.firstOrNull { it.id == cal }?.serverId ?: cal) else legacyWriteCal(cal)

    fun eventBody(d: KData, e: KEv): JSONObject = JSONObject().put("title", e.t).put("allDay", e.all).put("date", e.d.toString())
        .put("start", e.s?.let(::hm) ?: JSONObject.NULL).put("end", e.e?.let(::hm) ?: JSONObject.NULL)
        .put("endDate", if (e.days > 1) e.d.plusDays((e.days - 1).toLong()).toString() else JSONObject.NULL)
        .put("location", e.loc ?: "").put("calendar", writeCal(d, e.cal)).put("view", e.cal)
        .apply { if (d.serverCals) put("appCalendar", writeCal(d, e.cal)) }
        .put("reminder", remToLegacy(e.rem)).put("remindMin", e.rem ?: JSONObject.NULL)
        .apply { e.src?.let { put("glimt", JSONObject().put("text", it)); put("origin", "Glimt · Kalender-appen") } }
        .put("source", "kalender-app")

    /** Henter alt for vinduet [from, to]. Returnerer en feilmelding (null = ok). */
    suspend fun sync(ctx: Context, s: KalSession, from: LocalDate, to: LocalDate): String? {
        val api = s.api
        flush(ctx, s)
        val prev = KalStore.current(ctx).let { if (it.acct != null && it.acct != s.acct) KData() else it }
        // Kalenderne (SERVER33). 404 = eldre server: fasitens seks.
        var serverCals = prev.serverCals
        var cals = prev.cals
        try {
            val raw = api.get("/api/kalender/calendars", timeout = 8_000)
            val l = parseServerCalendars(raw)
            if (l.isNotEmpty()) { cals = l; serverCals = true }
            // Prompt 35: Innstillingene ligger i profilen (prefs). Første gang sendes telefonens valg dit i stedet.
            if (!Kal35Prefs.pushed(ctx)) Kal35Repo.pushAll(ctx, s)
            else Kal35Prefs.applyServer(ctx, runCatching { JSONObject(raw).optJSONObject("prefs") }.getOrNull())
        } catch (e: KalApiException) {
            if (e.status == 404 || e.status == 405) { cals = KCALS; serverCals = false }
            if (e.status == 401) return "Innloggingen er utløpt. Logg inn på nytt."
        }
        val calMap = cals.associateBy { it.id }
        val evs = try {
            parseServerEvents(api.get("/api/kalender?from=$from&to=$to", timeout = 15_000), calMap)
        } catch (e: KalApiException) {
            if (e.status == 401) return "Innloggingen er utløpt. Logg inn på nytt."
            if (e.status == 404) emptyList<KEv>() else return e.message ?: "Fikk ikke hentet kalenderen"
        }
        // Lokale hendelser som venter i utboksen vises fortsatt.
        val pend = prev.events.filter { it.pending }
        val all = (evs + pend.filter { p -> evs.none { it.id == p.id } })
        val wx = runCatching { weather(api, from) }.getOrNull()?.takeIf { it.isNotEmpty() } ?: prev.wx
        val d = KData(all, cals, wx, System.currentTimeMillis(), serverCals, s.acct)
        KalStore.save(ctx, d)
        return null
    }

    /** Vær 16 dager frem: serveren (brukerens sted), ellers Open-Meteo for Oslo (59,91 / 10,75) som i fasiten. */
    private suspend fun weather(api: KalApi, from: LocalDate): Map<LocalDate, KWx> {
        val t = today()
        try {
            return parseWeather(api.get("/api/kalender/weather?from=$t&to=${t.plusDays(15)}", timeout = 8_000))
        } catch (e: KalApiException) {
            if (e.status != 404 && e.status != 405) throw e
        }
        val raw = KalApi("https://api.open-meteo.com", null)
            .get("/v1/forecast?latitude=59.91&longitude=10.75&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FOslo&forecast_days=16", timeout = 8_000)
        return parseWeather(raw)
    }

    /** Ny hendelse. Optimistisk: vises med en gang, sendes nå eller ved neste synk. Returnerer hendelsen slik den ble lagret. */
    suspend fun create(ctx: Context, s: KalSession, e: KEv): KEv {
        val d = KalStore.current(ctx)
        val tmp = e.copy(pending = true)
        KalStore.save(ctx, d.copy(events = d.events + tmp))
        return try {
            val o = JSONObject(s.api.post("/api/kalender/events", eventBody(d, e)))
            val saved = (o.optJSONObject("event") ?: o).let { parseServerEvent(it, d.cals.associateBy { c -> c.id }) }
                ?.let { it.copy(cal = if (it.cal == "p" && e.cal != "p" && !d.serverCals) e.cal else it.cal, src = it.src ?: e.src, rem = e.rem ?: it.rem) } ?: e
            replace(ctx, tmp.id, saved)
            saved
        } catch (x: KalApiException) {
            if (x.status in 400..499 && x.status != 408) {
                // Serveren sa nei (f.eks. 409 «koble til Google på nytt»): fjern og vis feilen.
                remove(ctx, tmp.id)
                throw x
            }
            KalOutbox.add(ctx, JSONObject().put("op", "add").put("ev", tmp.toJson()))
            tmp
        }
    }

    suspend fun delete(ctx: Context, s: KalSession, e: KEv) {
        remove(ctx, e.id)
        if (e.pending) { KalOutbox.remove(ctx) { it.optString("op") == "add" && it.optJSONObject("ev")?.optString("id") == e.id }; return }
        try { s.api.delete("/api/kalender/events/" + enc(e.id)) } catch (x: KalApiException) {
            if (x.status == 404) return
            if (x.status in 400..499) { val d = KalStore.current(ctx); KalStore.save(ctx, d.copy(events = d.events + e)); throw x }
            KalOutbox.add(ctx, JSONObject().put("op", "del").put("id", e.id))
        }
    }

    /** Varsel endret: lagres lokalt (varslene) og på serveren når hendelsen kan endres der. */
    suspend fun setRem(ctx: Context, s: KalSession, e: KEv, r: Int?) {
        KalPrefs.setRemOverride(ctx, e.id, r)
        val d = KalStore.current(ctx)
        KalStore.save(ctx, d.copy(events = d.events.map { if (it.id == e.id) it.copy(rem = r) else it }))
        if (e.pending || !e.editable) return
        runCatching { s.api.patch("/api/kalender/events/" + enc(e.id), JSONObject().put("reminder", remToLegacy(r)).put("remindMin", r ?: JSONObject.NULL)) }
    }

    /** Synlighet for en kalender (lagres også på serveren når den har /api/kalender/calendars). */
    suspend fun setVisible(s: KalSession, d: KData, c: KCal, on: Boolean) {
        if (!d.serverCals || c.serverId == null) return
        runCatching { s.api.patch("/api/kalender/calendars/" + enc(c.serverId), JSONObject().put("visible", on)) }
    }

    /** Egen lokal kalender med farge (SERVER33). Kaster 404 på eldre server. */
    suspend fun createCalendar(s: KalSession, name: String, color: Long) {
        s.api.post("/api/kalender/calendars", JSONObject().put("name", name).put("color", hexOut(color)))
    }

    suspend fun deleteCalendar(s: KalSession, c: KCal) {
        c.serverId?.let { s.api.delete("/api/kalender/calendars/" + enc(it)) }
    }

    private fun replace(ctx: Context, id: String, e: KEv) {
        val d = KalStore.current(ctx)
        KalStore.save(ctx, d.copy(events = d.events.filter { it.id != id && it.id != e.id } + e))
    }

    private fun remove(ctx: Context, id: String) {
        val d = KalStore.current(ctx)
        KalStore.save(ctx, d.copy(events = d.events.filter { it.id != id }))
    }

    /** Sender utboksen. Stopper ved første nettfeil (prøver igjen senere). */
    suspend fun flush(ctx: Context, s: KalSession) {
        for (op in KalOutbox.list(ctx)) {
            try {
                when (op.optString("op")) {
                    "add" -> {
                        val ev = KEv.fromJson(op.getJSONObject("ev")) ?: continue
                        val d = KalStore.current(ctx)
                        val o = JSONObject(s.api.post("/api/kalender/events", eventBody(d, ev.copy(pending = false))))
                        (o.optJSONObject("event") ?: o).let { parseServerEvent(it, d.cals.associateBy { c -> c.id }) }?.let { replace(ctx, ev.id, it) }
                    }
                    "del" -> runCatching { s.api.delete("/api/kalender/events/" + enc(op.getString("id"))) }
                }
                KalOutbox.remove(ctx) { it.toString() == op.toString() }
            } catch (x: KalApiException) {
                if (x.status in 400..499) KalOutbox.remove(ctx) { it.toString() == op.toString() } else return
            }
        }
    }
}

/** Hendelsene med lokale varsel-valg lagt på (fasitens st.rem). */
fun KData.withOverrides(ctx: Context): List<KEv> {
    val o = KalPrefs.remOverrides(ctx)
    if (o.isEmpty()) return events
    return events.map { e -> if (o.containsKey(e.id)) e.copy(rem = o[e.id]) else e }
}

/** Hendelser per dag (flerdagers heldag gir FORTS. på dagene etter), sortert: heldag først, så starttid. */
fun byDay(evs: List<KEv>): Map<LocalDate, List<Pair<KEv, Boolean>>> {
    val by = HashMap<LocalDate, MutableList<Pair<KEv, Boolean>>>()
    evs.forEach { e -> for (i in 0 until e.days.coerceAtLeast(1)) by.getOrPut(e.d.plusDays(i.toLong())) { ArrayList() }.add(e to (i > 0)) }
    by.values.forEach { l -> l.sortWith(compareBy<Pair<KEv, Boolean>> { if (it.first.all) 0 else 1 }.thenBy { it.first.s ?: 0 }) }
    return by
}
