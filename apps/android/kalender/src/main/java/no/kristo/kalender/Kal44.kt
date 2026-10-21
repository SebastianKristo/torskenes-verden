package no.kristo.kalender

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.LocalDate

/*
 * Prompt 44 (KAL44): Kalender for Android – utlogging av seg selv, innlogging via Homelab, raske data, Rediger, adresse,
 * deltakere og Media-kalenderen. Spesifikasjon: prompts/prompt-44-pakke/claude-code-kalender-*.md.
 *
 * Årsaken til «jeg blir ofte logget ut»:
 *  1. Serveren gir hvert Kalender-token en enhet (app + device), og et nytt token for samme app + enhet trekker tilbake det
 *     gamle (server/auth41.js). POST /api/auth/token ble sendt uten «device», så serveren brukte «iPhone» – innlogging med
 *     Homelab på Android logget ut Kalender på iPhone/iPad, og omvendt. Nå: eget, stabilt navn (Kal44.device, «Min Android 3F2A»).
 *  2. Ethvert 401 i synken tømte økten med en gang (også 401 fra feil adresse). Nå: én fornyelse om gangen (Mutex) – samme
 *     token mot de andre adressene, så et nytt token fra Homelab-appen (ContentProvider), så refresh-token når serveren har
 *     det. Bare når alt sier nei logges man ut. Tidsavbrudd, 5xx og ingen nett gir aldri utlogging.
 */

/** En deltaker: bruker i appen (userId) eller e-post. status: invited | accepted | declined | tentative | tom (ikke sendt). */
data class KAtt44(val userId: String? = null, val email: String? = null, val name: String = "", val status: String = "") {
    val id: String get() = (userId ?: "") + "|" + (email ?: "")
    val label: String get() = when (status) {
        "invited", "needs-action", "sent" -> "Invitert"
        "accepted", "yes" -> "Ja"
        "declined", "no" -> "Nei"
        "tentative", "maybe" -> "Kanskje"
        else -> "Ikke sendt"
    }

    fun toJson(): JSONObject = JSONObject().put("name", name).put("status", status.ifBlank { "invited" })
        .apply { userId?.let { put("userId", it) }; email?.let { put("email", it) } }

    companion object {
        fun fromJson(o: JSONObject): KAtt44 = KAtt44(o.optStrOrNull("userId"), o.optStrOrNull("email"), o.optStrOrNull("name") ?: "", o.optStrOrNull("status") ?: "")
    }
}

/** Prompt 44-feltene på en hendelse: Media-status, deltakere, gjentakelse og versjon (etag). */
data class KX44(
    val media: Boolean = false, val mStatus: String = "", val mText: String = "", val link: String = "", val code: String = "",
    val episode: String = "", val movie: Boolean = false, val att: List<KAtt44> = emptyList(), val rec: Boolean = false, val etag: String? = null,
) {
    fun toJson(): JSONObject = JSONObject().put("media", media).put("mStatus", mStatus).put("mText", mText).put("link", link).put("code", code)
        .put("episode", episode).put("movie", movie).put("rec", rec).put("etag", etag ?: JSONObject.NULL)
        .put("att", JSONArray().apply { att.forEach { put(it.toJson()) } })

    val mediaStatus: String get() = mText.ifBlank {
        when (mStatus) { "ok", "downloaded" -> "Lastet ned"; "dl", "downloading" -> "Lastes ned"; "missing" -> "Mangler"; else -> "Kommer" }
    }

    companion object {
        fun fromJson(o: JSONObject?): KX44? = o?.let { x ->
            runCatching {
                val a = x.optJSONArray("att")
                KX44(x.optBoolean("media"), x.optString("mStatus"), x.optString("mText"), x.optString("link"), x.optString("code"),
                    x.optString("episode"), x.optBoolean("movie"), a?.let { arr -> (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let(KAtt44::fromJson) } } ?: emptyList(),
                    x.optBoolean("rec"), x.optStrOrNull("etag"))
            }.getOrNull()
        }

        /** Fra serverens hendelse (null når ingen av feltene finnes). */
        fun parse(o: JSONObject, cal: String): KX44? {
            val media = o.optStrOrNull("source") == "media" || o.optStrOrNull("type") == "media" || cal == "media"
            val a = o.optJSONArray("attendees")
            val att = a?.let { arr -> (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let(KAtt44::fromJson) } } ?: emptyList()
            val rep = o.optStrOrNull("repeat")
            val rec = (rep != null && rep != "none") || o.optBoolean("recurring") || o.optStrOrNull("recurringEventId") != null
            val etag = o.optStrOrNull("etag")
            if (!media && att.isEmpty() && !rec && etag == null) return null
            return KX44(media, o.optStrOrNull("status") ?: "", o.optStrOrNull("statusText") ?: "", o.optStrOrNull("deepLink") ?: "", o.optStrOrNull("code") ?: "",
                o.optStrOrNull("episodeTitle") ?: "", o.optStrOrNull("kind") == "movie", att, rec, etag)
        }
    }
}

/** Adresseforslag. */
data class KAddr44(val street: String, val place: String, val lat: Double?, val lon: Double?) {
    val full: String get() = if (place.isBlank()) street else "$street, $place"
}

/** Bruker i appen (brukerlisten). */
data class KUser44(val id: String, val name: String, val color: Long, val email: String)

object Kal44 {
    enum class Rec { RENEWED, REVOKED, OFFLINE }

    private val gate = Mutex()
    @Volatile private var revokedAt = 0L

    /* ---------- Enhetsnavn ---------- */

    /** «Min Android 3F2A» – stabilt per installasjon (serveren erstatter bare tokenet med samme navn). */
    fun device(ctx: Context): String {
        val p = ctx.getSharedPreferences("kalender_prefs", Context.MODE_PRIVATE)
        val id = p.getString("k44_dev", null)?.takeIf { it.length == 4 } ?: run {
            val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            val n = (1..4).map { chars[(Math.random() * chars.length).toInt().coerceIn(0, chars.length - 1)] }.joinToString("")
            p.edit().putString("k44_dev", n).apply()
            n
        }
        return "Min Android $id"
    }

    /* ---------- Én fornyelse om gangen ---------- */

    /**
     * Etter 401: prøv å reparere innloggingen. Andre kall som får 401 samtidig venter på samme lås og får svaret
     * (tokenet er da allerede byttet). → (resultat, ny økt)
     */
    suspend fun recover(ctx: Context, failed: KalSession): Pair<Rec, KalSession?> = gate.withLock {
        val cur = KalAuth.session(ctx)
        if (cur != null && cur.token != failed.token) return@withLock Rec.RENEWED to cur
        if (System.currentTimeMillis() - revokedAt < 20_000) return@withLock Rec.REVOKED to null
        var net = false
        // 1. Feil adresse? Samme token mot de andre adressene.
        for (b in Kal41.candidates(ctx, listOf(failed.server))) {
            try {
                KalApi(b, failed.token).get("/api/kalender/calendars", timeout = 8_000)
                val s = failed.copy(server = b)
                KalAuth.save(ctx, s)
                return@withLock Rec.RENEWED to s
            } catch (e: KalApiException) {
                if (e.status == 404 || e.status == 405) { val s = failed.copy(server = b); KalAuth.save(ctx, s); return@withLock Rec.RENEWED to s }
                if (e.status == 0) net = true
            }
        }
        // 2. Homelab-appen på samme telefon lager et nytt token (uten app-bytte).
        if (KalAuth.homelabInstalled(ctx)) {
            val (s2, _) = runCatching { Kal41.continueAs(ctx) }.getOrDefault(null to null)
            if (s2 != null) { KalAuth.save(ctx, s2); return@withLock Rec.RENEWED to s2 }
        }
        // 3. Refresh-token (POST /api/auth/refresh), når serveren har gitt et.
        val rt = Kal41.refreshToken(ctx)
        if (!rt.isNullOrBlank()) {
            try {
                val body = JSONObject().put("refresh_token", rt).put("refresh", rt).put("client", Kal41.CLIENT).put("device", device(ctx))
                val o = JSONObject(KalApi(failed.server, null).post("/api/auth/refresh", body, read = 15_000))
                val tok = o.optStrOrNull("token")
                if (tok != null) {
                    o.optStrOrNull("refresh")?.let { Kal41.saveRefresh(ctx, it) }
                    val s = failed.copy(token = tok)
                    KalAuth.save(ctx, s)
                    return@withLock Rec.RENEWED to s
                }
            } catch (e: KalApiException) {
                if (e.status == 0) net = true
                else if (e.status == 404 || e.status == 405) net = true // ingen fornyelse på serveren: ikke et svar om innloggingen
            }
        }
        if (net) Rec.OFFLINE to null else { revokedAt = System.currentTimeMillis(); Rec.REVOKED to null }
    }

    /* ---------- Logg (Docker-loggen) ---------- */

    /** auth.handoff.* og cal.firstFrame / cal.syncDone: POST /api/apps/kalender/log (best effort, 404 tåles). */
    suspend fun log(ctx: Context, event: String, info: Map<String, String> = emptyMap()) {
        android.util.Log.i("kal44", "$event $info")
        val s = KalAuth.session(ctx) ?: return
        runCatching {
            val b = JSONObject().put("event", event).put("app", "kalender").put("device", "Android").put("at", System.currentTimeMillis() / 1000.0)
            info.forEach { (k, v) -> b.put(k, v) }
            KalApi(s.server, s.token).post("/api/apps/kalender/log", b, read = 6_000)
        }
    }

    /* ---------- Brukerlisten, adresser, invitasjon, Rediger ---------- */

    private val PAL = longArrayOf(0xFF7A5AD6, 0xFF2F6B4A, 0xFFA0671A, 0xFF2B5D8A, 0xFFC2477A, 0xFF3D7F8A)

    /** GET /api/users/directory → (brukerne utenom meg, min e-post). */
    suspend fun directory(s: KalSession): Pair<List<KUser44>, String> {
        val raw = runCatching { s.api.get("/api/users/directory", timeout = 10_000) }.getOrNull() ?: return emptyList<KUser44>() to ""
        val t = raw.trim()
        val obj = if (t.startsWith("{")) runCatching { JSONObject(t) }.getOrNull() else null
        val arr = if (t.startsWith("[")) JSONArray(t) else obj?.optJSONArray("users") ?: JSONArray()
        var me = obj?.optJSONObject("me")?.optStrOrNull("email") ?: ""
        val out = ArrayList<KUser44>()
        for (i in 0 until arr.length()) {
            val u = arr.optJSONObject(i) ?: continue
            val id = u.optStrOrNull("id") ?: continue
            if (u.optBoolean("me") || u.optBoolean("self") || u.optBoolean("current")) { me = u.optStrOrNull("email") ?: me; continue }
            val name = u.str("name", "displayName", "username") ?: id
            out += KUser44(id, name, hexIn(u.optStrOrNull("color")) ?: PAL[i % PAL.size], u.optStrOrNull("email") ?: "")
        }
        return out to me
    }

    /** Serverens proxy (GET /api/geo/address?q=, cache), ellers Kartverket direkte. Maks 6. */
    suspend fun addresses(s: KalSession?, q: String): List<KAddr44> {
        val v = q.trim()
        if (v.length < 3) return emptyList()
        if (s != null) {
            val raw = runCatching { s.api.get("/api/geo/address?q=" + URLEncoder.encode(v, "UTF-8"), timeout = 6_000) }.getOrNull()
            if (raw != null) {
                val t = raw.trim()
                val arr = if (t.startsWith("[")) JSONArray(t) else runCatching { JSONObject(t) }.getOrNull()?.let { it.optJSONArray("results") ?: it.optJSONArray("addresses") } ?: JSONArray()
                val list = (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let(::fromServer) }
                if (list.isNotEmpty()) return list.take(6)
            }
        }
        return kartverket(v)
    }

    private fun num(o: JSONObject, k: String): Double? = if (!o.has(k) || o.isNull(k)) null else o.opt(k).let { x -> when (x) { is Number -> x.toDouble(); is String -> x.toDoubleOrNull(); else -> null } }

    private fun fromServer(o: JSONObject): KAddr44? {
        var street = o.str("street", "label") ?: return null
        var place = listOfNotNull(o.optStrOrNull("postcode"), o.optStrOrNull("city")).joinToString(" ")
        if (place.isBlank() && street.contains(", ")) { val p = street.split(", "); street = p.first(); place = p.drop(1).joinToString(", ") }
        return KAddr44(street, place, num(o, "lat"), num(o, "lon"))
    }

    private suspend fun kartverket(v: String): List<KAddr44> = withContext(Dispatchers.IO) {
        runCatching {
            val c = URL("https://ws.geonorge.no/adresser/v1/sok?sok=" + URLEncoder.encode(v, "UTF-8") + "&fuzzy=true&treffPerSide=6&utkoordsys=4258").openConnection() as HttpURLConnection
            c.connectTimeout = 6_000; c.readTimeout = 6_000
            c.setRequestProperty("User-Agent", "Kalender (Homelab)")
            try {
                val o = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
                val a = o.optJSONArray("adresser") ?: JSONArray()
                (0 until minOf(6, a.length())).mapNotNull { i ->
                    val x = a.optJSONObject(i) ?: return@mapNotNull null
                    val street = x.optStrOrNull("adressetekst") ?: return@mapNotNull null
                    val ps = x.optStrOrNull("poststed") ?: ""
                    val city = if (ps.isEmpty()) "" else ps.take(1) + ps.drop(1).lowercase()
                    val p = x.optJSONObject("representasjonspunkt")
                    KAddr44(street, listOfNotNull(x.optStrOrNull("postnummer"), city.ifBlank { null }).joinToString(" "), p?.let { num(it, "lat") }, p?.let { num(it, "lon") })
                }
            } finally { c.disconnect() }
        }.getOrDefault(emptyList())
    }

    /** POST /api/kalender/events/:id/invite → antall sendt (0 = ikke støttet). */
    suspend fun invite(s: KalSession, id: String, att: List<KAtt44>): Int {
        if (att.isEmpty()) return 0
        val b = JSONObject().put("attendees", JSONArray().apply { att.forEach { put(it.toJson()) } })
        return runCatching { JSONObject(s.api.post("/api/kalender/events/" + URLEncoder.encode(id, "UTF-8") + "/invite", b, read = 25_000)).optInt("sent", att.size) }.getOrDefault(0)
    }

    fun validEmail(v: String): Boolean = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(v)

    /** Skrivebeskyttet i Kalender: helligdager, trekk, Media og bursdager fra kontakter. */
    fun readOnly(e: KEv): Boolean = e.ab != null || e.x44?.media == true || e.cal == "h" || e.cal == "hd" || e.cal == "media" ||
        e.id.startsWith("hd") || e.id.startsWith("media-")

    /** PATCH-kroppen for Rediger. */
    fun patchBody(e: KEv, writeCal: String, scope: String?, force: Boolean): JSONObject = JSONObject().put("title", e.t).put("date", e.d.toString()).put("allDay", e.all)
        .put("start", e.s?.let(::hm) ?: JSONObject.NULL).put("end", e.e?.let(::hm) ?: JSONObject.NULL).put("location", e.loc ?: "")
        .put("calendar", writeCal).put("appCalendar", writeCal).put("view", e.cal).put("reminder", remToLegacy(e.rem)).put("remindMin", e.rem ?: JSONObject.NULL)
        .put("geo", if (e.lat != null && e.lon != null) JSONObject().put("lat", e.lat).put("lon", e.lon) else JSONObject.NULL)
        .put("attendees", JSONArray().apply { (e.x44?.att ?: emptyList()).forEach { put(it.toJson()) } })
        .apply { scope?.let { put("scope", it) }; e.x44?.etag?.let { if (!force) put("etag", it) }; if (force) put("force", true) }

    /** Ny hendelse på en dag: neste halvtime i dag, ellers 09:00 (eller klokkeslettet man trykket på). */
    fun startFor(d: LocalDate, at: Int?): Int = at ?: if (d == today()) minOf(23 * 60, ((nowMin() + 1 + 29) / 30) * 30) else 9 * 60
}

/*
 * Prompt 44: klokkeslett uten «kl.» (claude-code-kalender-glimt-klokkeslett.md). Skriver om 1600 · kl1600 · 16h · 16t · 16-17 og
 * «frisør 16» (frittstående 6–23 når det ikke finnes annen tid) til 16:00 før parseQuick. Året i «25. okt 2026» røres ikke.
 */
object KalTime44 {
    private const val MON = "jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des"
    private val IC = setOf(RegexOption.IGNORE_CASE)
    private fun pad(n: Int) = n.toString().padStart(2, '0')

    fun normalize(raw: String): String {
        var s = " $raw "
        s = Regex("\\b(kl\\.?|klokka|klokken)\\s*([01]\\d|2[0-3])([0-5]\\d)\\b", IC).replace(s) { m -> "kl " + m.groupValues[2] + ":" + m.groupValues[3] }
        s = interval(s)
        s = four(s)
        s = suffix(s)
        if (!hasTime(s)) s = bare(s)
        return s.trim()
    }

    fun hasTime(s: String): Boolean {
        if (Regex("\\b\\d{1,2}:\\d{2}\\b").containsMatchIn(s)) return true
        if (Regex("\\b(kl\\.?|klokka|klokken)\\s*\\d", IC).containsMatchIn(s)) return true
        return Regex("\\b(\\d{1,2})\\.(\\d{2})\\b").findAll(s).any { val b = it.groupValues[2].toInt(); b in 13..59 }
    }

    private fun interval(s0: String): String {
        var s = s0
        Regex("(^|[^\\d.:/])(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})(?:[.:](\\d{2}))?(?![\\d.:/])").findAll(s0).toList().asReversed().forEach { m ->
            val a = m.groupValues[2].toInt(); val b = m.groupValues[3].toInt()
            if (a > 23 || b > 23 || b <= a) return@forEach
            s = s.replaceRange(m.range, m.groupValues[1] + pad(a) + ":00-" + pad(b) + ":" + m.groupValues[4].ifEmpty { "00" })
        }
        return s
    }

    private fun four(s0: String): String {
        var s = s0
        Regex("(^|[^\\d.:/,])([01]\\d|2[0-3])([0-5]\\d)(?![\\d.:/])").findAll(s0).toList().asReversed().forEach { m ->
            if (Regex("($MON)[a-zæøå]*\\.?\\s*$", IC).containsMatchIn(s.substring(0, m.range.first + m.groupValues[1].length))) return@forEach
            s = s.replaceRange(m.range, m.groupValues[1] + m.groupValues[2] + ":" + m.groupValues[3])
        }
        return s
    }

    private fun suffix(s0: String): String {
        var s = s0
        Regex("(^|[^\\d.:/])(\\d{1,2})\\s?([ht])(?![a-zæøå\\d])", IC).findAll(s0).toList().asReversed().forEach { m ->
            val a = m.groupValues[2].toInt()
            if (a > 23) return@forEach
            if (Regex("\\bi\\s*$", IC).containsMatchIn(s.substring(0, m.range.first + m.groupValues[1].length))) return@forEach
            s = s.replaceRange(m.range, m.groupValues[1] + pad(a) + ":00")
        }
        return s
    }

    private fun bare(s: String): String {
        for (m in Regex("(^|\\s)(\\d{1,2})(?=[\\s,.!?]*$|\\s)").findAll(s)) {
            val a = m.groupValues[2].toInt()
            if (a < 6 || a > 23) continue
            val loc = m.range.first + m.groupValues[1].length
            val before = s.substring(0, loc)
            val after = s.substring(loc + m.groupValues[2].length)
            if (Regex("\\b(den|i|om|varsle|varsel|påminn|nr|uke|rom)\\s*$", IC).containsMatchIn(before)) continue
            if (Regex("^\\s*\\.?\\s*($MON|min|minutter|timer|time|dag|dager|uke|uker|år|kr|%)", IC).containsMatchIn(after)) continue
            if (Regex("^[.:/]\\d").containsMatchIn(after)) continue
            return s.substring(0, loc) + "kl $a" + after
        }
        return s
    }

    /** Kjente typer gir varighet («frisør» 45 min). */
    fun typeDur(lower: String): Int? = listOf("frisør" to 45, "legetime" to 30, "lege" to 30, "fysio" to 45, "tannlege" to 60, "massasje" to 60)
        .firstOrNull { lower.contains(it.first) }?.second
}
