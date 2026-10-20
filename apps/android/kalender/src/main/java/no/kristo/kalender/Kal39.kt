package no.kristo.kalender

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.LocalDate
import java.time.OffsetDateTime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/*
 * Prompt 39 (KAL39): fire kalendere – Personlig · Bursdager · Skole · Helligdager (fasit: Kalendere Oppsett.dc.html 1a–1d,
 * Kalender App.dc.html CALS/CNORM/HOLI). SERVER39 sender de fire + egne med key/source/sourceLabel/badge/notify/showInBrief/…
 * og rydder 12 → 4 én gang (migration:{done, from, to, undoUntil}). Eldre servere: appen slår sammen lokalt
 * (Jobb/Familie/Helse → Personlig, Studie/Timeplan/Prøver → Skole, Google-«Sebastian…» → Personlig, dupliserte Bursdager)
 * og beregner norske helligdager selv (bevegelige fra påsken, ingen nett). Ingenting slettes – hendelsene vises bare i den nye.
 */

/** Kilde, merke og valg for én kalender (mangler på eldre servere – fylles ut lokalt). */
data class KInfo39(
    val role: String = "", val source: String = "", val sourceLabel: String = "", val badge: String = "",
    val notify: Boolean? = null, val brief: Boolean? = null, val fag: Boolean? = null,
    val url: String = "", val interval: String = "", val lastFetched: String = "", val status: String = "",
    val country: String = "", val localHolidays: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject().put("role", role).put("source", source).put("sourceLabel", sourceLabel).put("badge", badge)
        .put("notify", notify ?: JSONObject.NULL).put("brief", brief ?: JSONObject.NULL).put("fag", fag ?: JSONObject.NULL)
        .put("url", url).put("interval", interval).put("lastFetched", lastFetched).put("status", status).put("country", country)
        .put("localHolidays", localHolidays)

    companion object {
        private fun JSONObject.optB(k: String): Boolean? = if (!has(k) || isNull(k)) null else opt(k) as? Boolean

        fun fromJson(o: JSONObject?): KInfo39? = o?.let {
            KInfo39(it.optString("role"), it.optString("source"), it.optString("sourceLabel"), it.optString("badge"),
                it.optB("notify"), it.optB("brief"), it.optB("fag"), it.optString("url"), it.optString("interval"),
                it.optString("lastFetched"), it.optString("status"), it.optString("country"), it.optBoolean("localHolidays", false))
        }

        /** Feltene fra GET /api/kalender/calendars (tåler at alle mangler). */
        fun fromServer(o: JSONObject): KInfo39 {
            if (o.has("sourceLabel") || o.has("showInBrief")) Kal39.sawServerFields = true
            val key = o.optStrOrNull("key").orEmpty()
            val role = if (key in Kal39.ROLES && o.optStrOrNull("sourceLabel") != null) key else ""
            val fag = when (val v = o.opt("subjectColors")) { is Boolean -> v; is JSONObject -> true; else -> null }
            return KInfo39(
                role = role, source = o.optStrOrNull("source")?.lowercase().orEmpty(), sourceLabel = o.optStrOrNull("sourceLabel").orEmpty(),
                badge = o.optStrOrNull("badge")?.uppercase().orEmpty(), notify = o.optB("notify"), brief = o.optB("showInBrief"), fag = fag,
                url = o.optStrOrNull("url").orEmpty(), interval = o.optStrOrNull("interval").orEmpty(), lastFetched = o.optStrOrNull("lastFetched").orEmpty(),
                status = o.optStrOrNull("status").orEmpty(), country = o.optStrOrNull("country").orEmpty(),
            )
        }
    }
}

data class KMig39(val done: Boolean = false, val from: Int = 0, val to: Int = 0, val undoUntil: String = "") {
    val canUndo: Boolean get() = done && undoUntil.isNotEmpty() &&
        (runCatching { OffsetDateTime.parse(undoUntil).toInstant().toEpochMilli() > System.currentTimeMillis() }.getOrDefault(false))
}

/** Forhåndsvisning av en iCal-adresse før den lagres. */
data class KIcs39(val name: String = "", val count: Int = 0, val subjects: List<String> = emptyList(), val error: String? = null)

/** Én Google-kalender i «Hvilken kalender er hva?». role = p | b | x (ikke bruk). */
data class KGMapCal39(val googleId: String, val name: String, val color: Long, val access: String, val role: String)

data class KGMap39(
    val connected: Boolean = false, val email: String = "", val calendars: List<KGMapCal39> = emptyList(),
    val schoolUrl: String = "", val schoolStatus: String = "", val country: String = "NO", val error: String? = null, val legacy: Boolean = false,
) {
    fun names(r: String): List<String> = calendars.filter { it.role == r }.map { it.name }
}

object Kal39 {
    val ROLES = listOf("p", "b", "s", "h")
    val NAMES = mapOf("p" to "Personlig", "b" to "Bursdager", "s" to "Skole", "h" to "Helligdager")
    val COLORS = mapOf("p" to 0xFFB23A2AL, "b" to 0xFF8A3FA0L, "s" to 0xFF2F7A4FL, "h" to 0xFFA39D90L)
    /** De ti fargene i Rediger (1b). */
    val PALETTE: List<Long> = listOf(0xFFB23A2A, 0xFFE8794A, 0xFFA8661A, 0xFF2F7A4F, 0xFF3D7F8A, 0xFF2B5D8A, 0xFF5B4FC4, 0xFF8A3FA0, 0xFFC2477A, 0xFF6B665C)
    val INTERVALS = listOf("15m" to "15 min", "1h" to "Hver time", "6h" to "Hver 6. time", "1d" to "Daglig")
    val COUNTRIES = listOf("NO" to "Norge", "SE" to "Sverige", "DK" to "Danmark")

    /* ---------- Tilstand fra siste GET /api/kalender/calendars ---------- */
    @Volatile var alias: Map<String, String> = emptyMap()
    @Volatile var roleIds: Map<String, String> = mapOf("p" to "p", "b" to "b", "s" to "s", "h" to "h")
    @Volatile var localHolidays: Boolean = true
    @Volatile var serverKnows: Boolean = false
    @Volatile var migration: KMig39 = KMig39()
    @Volatile var mergedFrom: Int = 0
    @Volatile internal var sawServerFields: Boolean = false

    /* ---------- Roller ---------- */

    fun roleOf(raw: String?): String = when (raw?.trim()?.lowercase().orEmpty()) {
        "p", "personlig", "privat", "jobb", "work", "j", "familie", "f", "helse", "health", "trials", "primary" -> "p"
        "b", "bursdager", "bursdag", "birthdays", "birthday" -> "b"
        "s", "studie", "skole", "timeplan", "prover", "prøver", "canvas", "study", "school", "studie 40" -> "s"
        "h", "hd", "helligdager", "helligdag", "holidays", "holiday" -> "h"
        else -> ""
    }

    fun role(c: KCal): String {
        c.p39?.role?.takeIf { it.isNotEmpty() }?.let { return it }
        val src = c.p39?.source?.takeIf { it.isNotEmpty() } ?: c.src.orEmpty()
        val n = c.n.lowercase()
        if (src == "own" || src == "ha" || (c.own && src != "google")) return ""
        if (src == "google") return when { "bursdag" in n || "birthday" in n -> "b"; "helligdag" in n || "holiday" in n -> "h"; else -> "p" }
        if (src == "ical" || src == "url") return when {
            "skole" in n || "timeplan" in n || "studie" in n || "tp.uio" in n -> "s"
            "helligdag" in n -> "h"
            else -> ""
        }
        // Navnet før id-en: gamle buffere hadde «h» = Helse.
        if (n in setOf("personlig", "jobb", "familie", "helse")) return "p"
        if (n == "bursdager") return "b"
        if (n in setOf("studie", "skole", "timeplan", "prøver", "studie 40")) return "s"
        if ("helligdag" in n) return "h"
        return roleOf(c.serverId ?: c.id)
    }

    private fun rank(c: KCal, r: String): Int = when {
        c.p39?.role == r && c.p39?.localHolidays != true -> 0
        c.id.lowercase() in (mapOf("p" to setOf("personlig", "p"), "b" to setOf("bursdager", "b"), "s" to setOf("skole", "studie", "s"), "h" to setOf("helligdager", "h", "hd"))[r] ?: emptySet()) -> 1
        c.src == "builtin" -> 2
        else -> 3
    }

    fun readMigration(root: JSONObject?) {
        val saw = sawServerFields
        sawServerFields = false
        serverKnows = saw || root?.has("migration") == true
        val m = root?.optJSONObject("migration") ?: return
        migration = KMig39(m.optBoolean("done", false), m.optInt("from", 0), m.optInt("to", 0), m.optStrOrNull("undoUntil").orEmpty())
    }

    /** Hele lista → de fire (+ egne), uten duplikater, med Helligdager når serveren ikke har den. */
    fun normalize(list: List<KCal>, root: JSONObject?): List<KCal> {
        if (root != null) readMigration(root)
        if (list.isEmpty()) return list
        val newAlias = HashMap<String, String>()
        val newRole = HashMap<String, String>()
        val byRole = LinkedHashMap<String, KCal>()
        for (r in ROLES) {
            val group = list.withIndex().filter { role(it.value) == r }.sortedWith(compareBy({ rank(it.value, r) }, { it.index })).map { it.value }
            if (group.isEmpty()) continue
            var target = group[0]
            var cnt = target.count ?: 0
            for (x in group.drop(1)) { newAlias[x.id] = target.id; cnt += x.count ?: 0 }
            target = fill(target.copy(count = if (target.count == null && cnt == 0) null else cnt), r)
            byRole[r] = target
            newRole[r] = target.id
        }
        val others = list.filter { role(it).isEmpty() }.map { fill(it, "") }
        val out = ArrayList<KCal>()
        ROLES.forEach { r -> byRole[r]?.let { out += it } }
        if (byRole["h"] == null) { out += holidayCal(); newRole["h"] = "h"; localHolidays = true } else localHolidays = byRole["h"]?.p39?.localHolidays == true
        out += others
        if (!serverKnows && list.size > out.size) mergedFrom = list.size
        alias = newAlias
        ROLES.forEach { r -> if (newRole[r] == null) newRole[r] = r }
        roleIds = newRole
        return out.distinctBy { it.id }
    }

    private fun fill(c: KCal, r: String): KCal {
        var i = c.p39 ?: KInfo39()
        if (i.source.isEmpty()) i = i.copy(source = c.src.orEmpty())
        var x = c
        if (r.isNotEmpty()) {
            i = i.copy(role = r)
            if (!serverKnows) {
                val n = x.n.lowercase()
                if (r == "s" && n in setOf("studie", "studie 40", "timeplan", "prøver")) x = x.copy(n = "Skole")
                if (r == "p" && n in setOf("jobb", "familie", "helse")) x = x.copy(n = "Personlig")
            }
            if (i.badge.isEmpty()) i = i.copy(badge = when (r) { "h" -> "INNEBYGD"; "s" -> "URL"; else -> "GOOGLE" })
            if (i.sourceLabel.isEmpty()) i = i.copy(sourceLabel = when (r) {
                "p" -> "Google"
                "b" -> "Bursdager fra kontakter"
                "s" -> if (i.url.isEmpty()) "Abonnement" else host(i.url)
                else -> countryName(i.country)
            })
            if (r == "b") x = x.copy(writable = false)
        } else if (i.badge.isEmpty()) {
            i = i.copy(badge = when (i.source) { "google" -> "GOOGLE"; "ical", "url" -> "URL"; "ha" -> "HA"; "builtin" -> "INNEBYGD"; else -> "EGEN" })
        }
        if (i.sourceLabel.isEmpty()) i = i.copy(sourceLabel = when (i.source) {
            "ha" -> "Home Assistant"
            "ical", "url" -> if (i.url.isEmpty()) "Abonnement" else host(i.url)
            "google" -> "Google"
            else -> "Egen kalender"
        })
        return x.copy(p39 = i)
    }

    fun holidayCal(): KCal = KCal(
        "h", "Helligdager", 0xFFA39D90, 0xFF5A554C, 0xFFC9C2B4, writable = false, count = holidays(today(), today().plusDays(29), "h").size,
        key = "h", src = "builtin", p39 = KInfo39(role = "h", source = "builtin", sourceLabel = "Norge", badge = "INNEBYGD", notify = false, country = "NO", localHolidays = true),
    )

    /* ---------- Hendelser ---------- */

    /** Id-en i lista for en lagret id, sammenslått kalender eller kortnøkkel. */
    fun resolve(id: String, cals: List<KCal>): String {
        if (cals.any { it.id == id }) return id
        alias[id]?.let { return it }
        val r = roleOf(id)
        if (r.isNotEmpty()) cals.firstOrNull { role(it) == r }?.let { return it.id }
        return id
    }

    fun notifyOff(cals: List<KCal>): Set<String> = cals.filter { it.p39?.notify == false }.map { it.id }.toSet()

    /** Påskedag (gregoriansk, anonym algoritme). */
    fun easter(y: Int): LocalDate {
        val a = y % 19; val b = y / 100; val c = y % 100; val d = b / 4; val e = b % 4; val f = (b + 8) / 25; val g = (b - f + 1) / 3
        val h = (19 * a + b - d - g + 15) % 30; val i = c / 4; val k = c % 4; val l = (32 + 2 * e + 2 * i - h - k) % 7; val m = (a + 11 * h + 22 * l) / 451
        return LocalDate.of(y, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1)
    }

    /** Årets fridager (true) og merkedager (false). */
    fun year(y: Int): List<Triple<LocalDate, String, Boolean>> {
        val e = easter(y)
        return listOf(
            Triple(LocalDate.of(y, 1, 1), "1. nyttårsdag", true), Triple(e.minusDays(7), "Palmesøndag", false),
            Triple(e.minusDays(3), "Skjærtorsdag", true), Triple(e.minusDays(2), "Langfredag", true), Triple(e, "1. påskedag", true),
            Triple(e.plusDays(1), "2. påskedag", true), Triple(LocalDate.of(y, 5, 1), "Arbeidernes dag", true), Triple(LocalDate.of(y, 5, 17), "Grunnlovsdag", true),
            Triple(e.plusDays(39), "Kristi himmelfartsdag", true), Triple(e.plusDays(49), "1. pinsedag", true), Triple(e.plusDays(50), "2. pinsedag", true),
            Triple(LocalDate.of(y, 12, 24), "Julaften", false), Triple(LocalDate.of(y, 12, 25), "1. juledag", true), Triple(LocalDate.of(y, 12, 26), "2. juledag", true),
            Triple(LocalDate.of(y, 12, 31), "Nyttårsaften", false),
        ).sortedBy { it.first }
    }

    fun holidays(from: LocalDate, to: LocalDate, cal: String): List<KEv> {
        if (to.isBefore(from) || to.year - from.year > 4) return emptyList()
        return (from.year..to.year).flatMap { y -> year(y) }.filter { !it.first.isBefore(from) && !it.first.isAfter(to) }
            .map { (d, n, fri) -> KEv("hd-$d", n, cal, d, null, null, kind = if (fri) "fri" else "merkedag", editable = false) }
    }

    /** Innebygde helligdager når serveren ikke har kalenderen (og ikke har sendt noen). */
    fun mergeHolidays(evs: List<KEv>, from: LocalDate, to: LocalDate): List<KEv> {
        if (!localHolidays) return evs
        val h = roleIds["h"] ?: "h"
        if (evs.any { it.cal == h }) return evs
        return evs + holidays(from, to, h)
    }

    /* ---------- Tekster ---------- */

    fun host(url: String): String {
        val i = url.indexOf("//")
        if (i < 0) return url
        return url.substring(i + 2).substringBefore('/').removePrefix("www.")
    }
    fun countryName(code: String): String { val c = code.ifEmpty { "NO" }.uppercase(); return COUNTRIES.firstOrNull { it.first == c }?.second ?: c }
    fun intervalName(v: String): String = INTERVALS.firstOrNull { it.first == v }?.second ?: if (v.isEmpty()) "Hver time" else v
    fun kicker(c: KCal): String = when (c.p39?.badge) { "GOOGLE" -> "GOOGLE KALENDER"; "URL" -> "ABONNEMENT"; "INNEBYGD" -> "INNEBYGD"; "HA" -> "HOME ASSISTANT"; else -> "EGEN KALENDER" }
    fun notifyText(c: KCal): String = when (role(c)) { "b" -> "Kl. 09:00 samme dag"; "h" -> "Av som standard"; else -> "15 min før" }
    fun canRemove(c: KCal): Boolean = when (role(c)) { "p" -> false; "h" -> c.p39?.localHolidays != true; else -> true }
    fun shortTime(iso: String): String = runCatching {
        val t = OffsetDateTime.parse(iso).atZoneSameInstant(OSLO)
        val hm = hm(t.hour * 60 + t.minute)
        if (t.toLocalDate() == today()) hm else "${t.dayOfMonth}. ${MS[t.monthValue - 1]} $hm"
    }.getOrDefault(iso)
    fun validIcs(s: String): Boolean { val t = s.trim().lowercase(); return (t.startsWith("webcal://") || t.startsWith("https://") || t.startsWith("http://")) && t.length > 12 }

    /** «IN1000 – forelesning» → «IN1000», «Matematikk R2» → «Matematikk». */
    fun fag(title: String): String {
        Regex("[A-ZÆØÅ]{2,6}[0-9]{3,4}").find(title)?.let { return it.value }
        val first = title.split(' ', '-', '–', ':', ',').firstOrNull { it.isNotBlank() }.orEmpty()
        return if (first.length >= 3) first else ""
    }
}

/* ---------- Server ---------- */

object Kal39Repo {
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    /** PATCH /api/kalender/calendars/:id. → feilmelding (null = ok). */
    suspend fun save(s: KalSession, id: String, body: JSONObject): String? = try {
        s.api.patch("/api/kalender/calendars/" + enc(id), body); null
    } catch (e: KalApiException) { e.message ?: "Kunne ikke lagre" }

    suspend fun undoMigration(s: KalSession): String? = try {
        s.api.post("/api/kalender/calendars/migration/undo"); null
    } catch (e: KalApiException) { if (e.status == 404) "Serveren kan ikke angre oppryddingen." else e.message }

    suspend fun refresh(s: KalSession, id: String): String? = try {
        s.api.post("/api/kalender/calendars/ical/" + enc(id) + "/refresh"); null
    } catch (e: KalApiException) {
        if (e.status == 404 || e.status == 405) try { s.api.post("/api/kalender/calendars/" + enc(id) + "/refresh"); null }
        catch (e2: KalApiException) { if (e2.status == 404) "Serveren kan ikke oppdatere denne kalenderen ennå." else e2.message }
        else e.message
    }

    /** Henter iCal-adressen én gang: navn, antall og fag. */
    suspend fun preview(raw: String): KIcs39 = withContext(Dispatchers.IO) {
        if (!Kal39.validIcs(raw)) return@withContext KIcs39(error = "Lim inn en webcal:// eller https://-adresse (…ics).")
        var u = raw.trim()
        if (u.lowercase().startsWith("webcal://")) u = "https://" + u.substring(9)
        try {
            val c = (URL(u).openConnection() as HttpURLConnection).apply { connectTimeout = 10_000; readTimeout = 20_000 }
            val code = c.responseCode
            val text = if (code < 400) c.inputStream.bufferedReader().use { it.readText() } else ""
            c.disconnect()
            if (!text.contains("BEGIN:VCALENDAR")) return@withContext KIcs39(error = "Adressen ga ingen kalender (iCal).")
            var name = ""
            var n = 0
            val subj = ArrayList<String>()
            text.lineSequence().forEach { l0 ->
                val l = l0.trimEnd('\r')
                when {
                    l.startsWith("X-WR-CALNAME:") -> name = l.substring(13).trim()
                    l.startsWith("BEGIN:VEVENT") -> n++
                    l.startsWith("SUMMARY") && l.contains(':') -> { val f = Kal39.fag(l.substringAfter(':').trim()); if (f.isNotEmpty() && f !in subj && subj.size < 8) subj += f }
                }
            }
            KIcs39(name.ifEmpty { cap(Kal39.host(u).substringBefore('.')) }, n, subj)
        } catch (e: Exception) { KIcs39(error = "Fikk ikke hentet adressen. Sjekk at den er riktig.") }
    }

    fun parseMap(body: String): KGMap39 {
        val o = JSONObject(body)
        val seen = HashSet<String>()
        val a = o.optJSONArray("calendars") ?: JSONArray()
        val l = (0 until a.length()).mapNotNull { i ->
            val c = a.optJSONObject(i) ?: return@mapNotNull null
            val gid = c.str("googleId", "id") ?: return@mapNotNull null
            if (!seen.add(gid)) return@mapNotNull null
            val r = (c.optStrOrNull("role") ?: c.optStrOrNull("suggested"))?.takeIf { it == "p" || it == "b" } ?: "x"
            KGMapCal39(gid, c.str("name") ?: gid, hexIn(c.optStrOrNull("color")) ?: 0xFF6B665C, c.optStrOrNull("access").orEmpty(), r)
        }
        val sc = o.optJSONObject("school")
        return KGMap39(o.optBoolean("connected", false), o.optStrOrNull("email").orEmpty(), l, sc?.optStrOrNull("url").orEmpty(), sc?.optStrOrNull("status").orEmpty(),
            o.optJSONObject("holidays")?.optStrOrNull("country") ?: "NO")
    }

    /** GET /api/kalender/google/mapping. 404: bygges fra prompt 36-oversikten (bare visning). */
    suspend fun fetchMap(s: KalSession): KGMap39 = try {
        parseMap(s.api.get("/api/kalender/google/mapping", timeout = 15_000))
    } catch (e: KalApiException) {
        if (e.status == 404 || e.status == 405) legacyMap(s) else KGMap39(error = e.message)
    } catch (e: Exception) { KGMap39(error = e.message ?: "Fikk ikke hentet Google-kalenderne") }

    private suspend fun legacyMap(s: KalSession): KGMap39 = try {
        val o = JSONObject(s.api.get("/api/kalender/calendars/google", timeout = 15_000))
        val a = o.optJSONArray("calendars") ?: JSONArray()
        val l = (0 until a.length()).mapNotNull { i ->
            val c = a.optJSONObject(i) ?: return@mapNotNull null
            val gid = c.str("googleId", "id") ?: return@mapNotNull null
            val n = c.str("name") ?: gid
            val prim = c.optBoolean("primary", false) || c.optBoolean("main", false)
            val r = if ("bursdag" in n.lowercase()) "b" else if ((prim || c.optStrOrNull("access") == "owner") && "helligdag" !in n.lowercase()) "p" else "x"
            val acc = if (prim) "primær · eier" else if (c.optStrOrNull("access") == "owner") "eier" else if (c.optBoolean("writable", false)) "kan redigere" else "kan se"
            KGMapCal39(gid, n, hexIn(c.optStrOrNull("color")) ?: 0xFF6B665C, acc, r)
        }
        KGMap39(o.optBoolean("connected", false), o.optStrOrNull("email").orEmpty(), l, legacy = true)
    } catch (e: KalApiException) { KGMap39(error = if (e.status == 404) "Serveren støtter ikke Google-kalendere ennå. Oppdater Homelab." else e.message, legacy = true) }

    /** PUT {map:{googleId: 'p'|'b'|null}} → full synk i bakgrunnen. → feilmelding (null = ok). */
    suspend fun saveMap(s: KalSession, m: KGMap39): String? {
        if (m.legacy) return "Homelab-serveren må oppdateres for å lagre koblingen."
        val map = JSONObject()
        m.calendars.forEach { map.put(it.googleId, if (it.role == "x") JSONObject.NULL else it.role) }
        return try { s.api.request("PUT", "/api/kalender/google/mapping", JSONObject().put("map", map)); null }
        catch (e: KalApiException) { if (e.status == 404) "Homelab-serveren må oppdateres for å lagre koblingen." else e.message }
    }
}
