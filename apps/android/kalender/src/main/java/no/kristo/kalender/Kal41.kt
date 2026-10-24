package no.kristo.kalender

import android.app.Application
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.LocalDate
import kotlin.math.sin

/*
 * Prompt 41: Kalender (Android)
 *  1. Innlogging uten serveradresse (claude-code-kalender-logg-inn-homelab.md + claude-code-innlogging-uten-server.md):
 *     • «Fortsett som …»: Homelabs signatur-beskyttede ContentProvider (no.kristo.finanshub.kalender) – metoden «continue41»
 *       sier hvem som er innlogget og adressene, «exchange41» gjør POST /api/auth/device-exchange i Homelab og gir eget token.
 *       Eldre Homelab: «companion» (prompt 33).
 *     • «Logg inn med Homelab-appen» (PKCE): state + code_verifier lagres kryptert FØR app-byttet, så åpnes
 *       https://<server>/app-auth?client=kalender&redirect=kalender://auth&state=…&cc=… (App Link, bare ikke-nettleser),
 *       ellers homelab://app-auth?… . Svaret kommer som kalender://auth?code=…&state=…(&server=…) → POST /api/auth/token.
 *     • Brukernavn og passord: adressen finnes selv (Homelab, forrige økt, /api/me/server, https://os.smarthjemexperten.no – prompt 47).
 *  2. Bursdagskort i hendelsesarket (claude-code-kalender-bursdag-hendelse.md).
 *  3. Søk med Glimt (Ollama) og testvarsel (claude-code-kalender-glimt-sok-testvarsel.md).
 */

object Kal41 {
    /** Prompt 47 (claude-code-standard-serveradresser.md): standard ekstern og lokal adresse. */
    const val DEFAULT_BASE = "https://os.smarthjemexperten.no"
    const val DEFAULT_LOCAL = "http://10.69.1.39:3000"
    const val CLIENT = "kalender"
    const val REDIRECT = "kalender://auth"
    const val TIMEOUT_MS = 60_000L

    private fun prefs(ctx: Context): SharedPreferences = runCatching {
        EncryptedSharedPreferences.create(
            "kalender_auth41", MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), ctx.applicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }.getOrElse { ctx.applicationContext.getSharedPreferences("kalender_auth41_plain", Context.MODE_PRIVATE) }

    internal fun plain(ctx: Context): SharedPreferences = ctx.applicationContext.getSharedPreferences("kalender_prefs", Context.MODE_PRIVATE)

    /* ---------- PKCE ---------- */

    private fun b64(b: ByteArray): String = Base64.encodeToString(b, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    fun random(n: Int): String = ByteArray(n).also { SecureRandom().nextBytes(it) }.let(::b64)
    fun challenge(verifier: String): String = b64(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))

    data class Pending(val state: String, val verifier: String, val at: Long, val base: String)

    /**
     * Prompt 44: «Åpne Homelab igjen» lagde ny state hver gang – godkjente man forespørselen som allerede lå i Homelab, passet
     * svaret ikke. Nå gjenbrukes en fersk forespørsel (< 5 min), og de tre siste huskes (svar på hvilken som helst godtas).
     */
    fun begin(ctx: Context, base: String): Pending {
        val now = System.currentTimeMillis()
        val list = pendingList(ctx).filter { now - it.at < 900_000 }
        list.lastOrNull()?.let { if (now - it.at < 300_000 && it.base == base) return it }
        val p = Pending(random(18), random(32), now, base)
        val keep = (list + p).takeLast(3)
        val arr = JSONArray().apply { keep.forEach { put(JSONObject().put("s", it.state).put("v", it.verifier).put("at", it.at).put("b", it.base)) } }
        prefs(ctx).edit().putString("p44", arr.toString()).putString("p_state", p.state).putString("p_verifier", p.verifier).putLong("p_at", p.at).putString("p_base", p.base).commit()
        return p
    }

    fun pendingList(ctx: Context): List<Pending> {
        val raw = prefs(ctx).getString("p44", null)
        if (raw != null) runCatching {
            val a = JSONArray(raw)
            return (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { o -> Pending(o.getString("s"), o.getString("v"), o.optLong("at"), o.optString("b")) } }
        }
        return listOfNotNull(pending(ctx))
    }

    fun refreshToken(ctx: Context): String? = prefs(ctx).getString("refresh", null)
    fun saveRefresh(ctx: Context, v: String) { prefs(ctx).edit().putString("refresh", v).apply() }

    fun pending(ctx: Context): Pending? {
        val p = prefs(ctx)
        val st = p.getString("p_state", null) ?: return null
        val v = p.getString("p_verifier", null) ?: return null
        return Pending(st, v, p.getLong("p_at", 0L), p.getString("p_base", "") ?: "")
    }

    fun clearPending(ctx: Context) { prefs(ctx).edit().remove("p_state").remove("p_verifier").remove("p_at").remove("p_base").remove("p44").apply() }

    fun query(p: Pending): String = "client=$CLIENT&redirect=" + Uri.encode(REDIRECT) + "&state=" + Uri.encode(p.state) +
        "&cc=" + Uri.encode(challenge(p.verifier)) + "&cc_method=S256"

    fun appLink(p: Pending): Uri = Uri.parse("https://home.kristo.no/app-auth?" + query(p))
    fun schemeLink(p: Pending): Uri = Uri.parse("homelab://app-auth?" + query(p))
    fun webLink(p: Pending, base: String): Uri = Uri.parse(base.trimEnd('/') + "/app-auth?" + query(p))

    /* ---------- Adresser ---------- */

    fun manual(ctx: Context): String = plain(ctx).getString("k41_manual", "") ?: ""
    fun setManual(ctx: Context, s: String) { plain(ctx).edit().putString("k41_manual", s).apply() }
    // Prompt 47: uten lagrede adresser (ny installasjon, eldre server) gjelder standardverdiene.
    fun local(ctx: Context): List<String> = (plain(ctx).getString("k41_local", "") ?: "").split('\n').filter { it.startsWith("http") }
        .ifEmpty { listOf(Kal47Srv.stdLocal(ctx)) }
    fun external(ctx: Context): String = (plain(ctx).getString("k41_external", "") ?: "").ifBlank { Kal47Srv.stdExternal(ctx) }
    fun auto(ctx: Context): Boolean = plain(ctx).getBoolean("k41_auto", true)
    fun now(ctx: Context): String = plain(ctx).getString("k41_now", "") ?: ""

    fun candidates(ctx: Context, extra: List<String> = emptyList()): List<String> {
        val raw = ArrayList<String>()
        manual(ctx).takeIf { it.isNotBlank() }?.let { raw += it }
        raw += extra
        KalAuth.session(ctx)?.server?.let { raw += it }
        raw += local(ctx); raw += external(ctx)
        raw += KalAuth.lastServer(ctx)
        raw += DEFAULT_BASE
        // Prompt 47: standard lokal adresse til slutt (5G: ekstern først; hjemme velger syncServers() lokal).
        raw += DEFAULT_LOCAL
        return raw.map { it.trim().trimEnd('/') }.filter { it.startsWith("http://") || it.startsWith("https://") }.distinct()
    }

    /** Svarer serveren i det hele tatt (alle HTTP-svar teller)? */
    suspend fun reachable(base: String, timeoutMs: Int): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val c = URL(base.trimEnd('/') + "/api/discovery").openConnection() as HttpURLConnection
            c.connectTimeout = timeoutMs; c.readTimeout = timeoutMs
            try { c.responseCode > 0 } finally { c.disconnect() }
        }.getOrDefault(false)
    }

    suspend fun firstReachable(list: List<String>): String? {
        for (b in list) if (reachable(b, 5000)) return b
        return null
    }

    /* ---------- Kall ---------- */

    private fun sessionOf(o: JSONObject, base: String, via: String): KalSession {
        val token = o.optString("token").takeIf { it.isNotBlank() } ?: throw KalApiException("Uventet svar fra Homelab.", 502)
        val u = o.optJSONObject("user")
        val uname = u?.optString("username")?.takeIf { it.isNotBlank() } ?: o.optString("user").takeIf { u == null && it.isNotBlank() } ?: ""
        val name = u?.optString("name")?.takeIf { it.isNotBlank() } ?: uname
        return KalSession(base, token, uname, name, via)
    }

    /** kalender://auth?code&state → tokens. */
    suspend fun exchange(ctx: Context, code: String, state: String, server: String?): KalSession {
        val all = pendingList(ctx)
        if (all.isEmpty()) throw KalApiException("Innloggingen er utløpt. Prøv igjen.", -1)
        val p = all.lastOrNull { it.state == state } ?: throw KalApiException("Svaret fra Homelab passet ikke (state). Prøv igjen.", -1)
        // Prompt 44: koden fra Homelab er selv gyldig i 60 s (serveren sjekker). Appens grense på 90 s fra trykket ga feil når man
        // brukte lenger tid i Homelab (Face ID / innlogging der først). Nå: 15 min.
        if (System.currentTimeMillis() - p.at > 900_000) { clearPending(ctx); throw KalApiException("Innloggingen er utløpt. Prøv igjen.", -1) }
        val bases = (listOfNotNull(server?.takeIf { it.startsWith("http") }, p.base.takeIf { it.isNotBlank() }) + candidates(ctx)).map { it.trimEnd('/') }.distinct().take(4)
        // Prompt 44: eget enhetsnavn – uten «device» ga serveren «iPhone», og innlogging her logget ut Kalender på iPhone/iPad.
        val body = JSONObject().put("code", code).put("code_verifier", p.verifier).put("client", CLIENT).put("redirect", REDIRECT).put("device", Kal44.device(ctx))
        var last: KalApiException = KalApiException("Får ikke kontakt med Homelab.", 0)
        for (b in bases) {
            try {
                val o = JSONObject(KalApi(b, null).post("/api/auth/token", body, read = 20_000))
                clearPending(ctx)
                o.optString("refresh").takeIf { it.isNotBlank() }?.let { prefs(ctx).edit().putString("refresh", it).apply() }
                return sessionOf(o, b, "homelab")
            } catch (e: KalApiException) {
                last = e
                if (e.status != 0) break
            }
        }
        clearPending(ctx)
        throw last
    }

    /** «Fortsett som»: hvem er innlogget i Homelab (uten å lage token). null = ikke innlogget / gammel Homelab. */
    suspend fun who(ctx: Context): Bundle? = withContext(Dispatchers.IO) {
        if (!KalAuth.homelabInstalled(ctx)) return@withContext null
        val b = runCatching { ctx.contentResolver.call(Uri.parse("content://${KalAuth.HOMELAB_AUTH}"), "continue41", null, Bundle()) }.getOrNull()
        if (b == null || b.getString("error") != null) null else b
    }

    /** «Fortsett som»: Homelab bytter enhets-tokenet mot et eget Kalender-token (exchange41); reserve: companion. */
    suspend fun continueAs(ctx: Context): Pair<KalSession?, String?> = withContext(Dispatchers.IO) {
        val b = try {
            ctx.contentResolver.call(Uri.parse("content://${KalAuth.HOMELAB_AUTH}"), "exchange41", "Kalender (Android · ${KalApi.device})", Bundle().apply { putString("app", CLIENT) })
        } catch (e: SecurityException) {
            return@withContext null to "Homelab-appen er signert med en annen nøkkel. Logg inn med brukernavn og passord."
        } catch (e: Exception) { null }
        if (b == null) return@withContext KalAuth.fromHomelab(ctx)
        b.getString("error")?.let { return@withContext null to it }
        val server = b.getString("server")?.takeIf { it.isNotBlank() } ?: return@withContext null to "Logg inn i Homelab-appen først."
        val token = b.getString("token")?.takeIf { it.isNotBlank() } ?: return@withContext null to "Homelab-appen ga ikke noe token."
        b.getString("refresh")?.takeIf { it.isNotBlank() }?.let { prefs(ctx).edit().putString("refresh", it).apply() }
        b.getString("local")?.takeIf { it.isNotBlank() }?.let { l -> plain(ctx).edit().putString("k41_local", l).putString("k41_external", server).apply() }
        val u = b.getString("username").orEmpty()
        KalSession(server, token, u, b.getString("name")?.takeIf { it.isNotBlank() } ?: u, "homelab") to null
    }

    fun message(e: KalApiException): String = when {
        e.status == 0 -> "Får ikke kontakt med Homelab."
        e.status == -1 -> e.message ?: "Prøv igjen."
        e.status == 401 || e.status == 403 -> "Innloggingen ble avvist i Homelab."
        e.status == 404 -> "Homelab-serveren kjenner ikke denne innloggingen ennå (404). Oppdater serveren, eller bruk brukernavn og passord."
        else -> (e.message ?: "Feil") + " (HTTP ${e.status})"
    }

    /** Lokal/ekstern adresse fra serveren (GET /api/me/server, ellers /api/discovery). Bytt automatisk: lokal når den svarer < 1,5 s. */
    suspend fun syncServers(ctx: Context): KalSession? {
        val s = KalAuth.session(ctx) ?: return null
        val loc = ArrayList<String>(); var ext = ""; var au = true; var found = false
        runCatching {
            val o = JSONObject(s.api.get("/api/me/server", timeout = 8000))
            o.opt("local")?.let { v -> if (v is String && v.isNotBlank()) loc += v; if (v is JSONArray) for (i in 0 until v.length()) loc += v.optString(i) }
            ext = o.optString("external"); au = o.optBoolean("auto", true); found = loc.isNotEmpty() || ext.isNotBlank()
            Kal47Srv.noteServer(ctx, o)
        }
        if (!found) runCatching {
            val o = JSONObject(s.api.get("/api/discovery", timeout = 8000))
            o.opt("local")?.let { v -> if (v is String && v.isNotBlank()) loc += v; if (v is JSONArray) for (i in 0 until v.length()) loc += v.optString(i) }
            ext = o.optString("external"); found = loc.isNotEmpty() || ext.isNotBlank()
        }
        if (!found) return null
        // Prompt 47: adressene ble endret i Innstillinger → Server mot en server uten synk – behold dem.
        if (Kal47Srv.localOnly(ctx)) return null
        // Prompt 46: containerens egen adresse (Docker-nett 172.16/12, loopback) kan aldri nås fra telefonen – forkastes.
        val cl = loc.map { it.trim().trimEnd('/') }.filter { it.startsWith("http") && !Kal46Srv.isContainerIp(Kal46Srv.host(it)) }
        var useLocal = false
        if (au || ext.isBlank()) for (l in cl) {
            val t0 = System.currentTimeMillis()
            // Prompt 47: lokal når den svarer innen 1,5 s (før 300 ms).
            if (reachable(l, 1500) && (System.currentTimeMillis() - t0 < 1500 || ext.isBlank())) { useLocal = true; break }
        }
        plain(ctx).edit().putString("k41_local", cl.joinToString("\n")).putString("k41_external", ext.trimEnd('/')).putBoolean("k41_auto", au)
            .putString("k41_now", if (useLocal) "Lokal" else "Ekstern").apply()
        val target = if (useLocal) cl.firstOrNull() else ext.trimEnd('/').takeIf { it.startsWith("http") }
        if (target == null || target == s.server) return null
        val n = s.copy(server = target)
        KalAuth.save(ctx, n)
        return n
    }

    /** «Lokal: 10.69.1.39:3000 · ekstern: os.smarthjemexperten.no · nå: Lokal · hentes fra Homelab» */
    fun summary(ctx: Context): String {
        val parts = ArrayList<String>()
        local(ctx).firstOrNull()?.let { parts += "Lokal: " + it.substringAfter("://") }
        external(ctx).takeIf { it.isNotBlank() }?.let { parts += (if (parts.isEmpty()) "Ekstern: " else "ekstern: ") + it.substringAfter("://") }
        if (parts.isEmpty()) KalAuth.session(ctx)?.server?.let { parts += it.substringAfter("://") }
        now(ctx).takeIf { it.isNotBlank() && auto(ctx) }?.let { parts += "nå: $it" }
        parts += "hentes fra Homelab"
        return parts.joinToString(" · ")
    }

    fun forget(ctx: Context) { prefs(ctx).edit().clear().apply() }

    /* ---------- Bursdager ---------- */

    data class BdPerson(val id: Int, val name: String, val year: Int?, val photo: String, val phone: String, val via: String)

    fun isBirthday(e: KEv, calName: String): Boolean =
        e.kind == "bursdag" || e.cal == "b" || calName.lowercase().contains("bursdag") || e.t.lowercase().contains("bursdag")

    fun bdName(t: String): String {
        var s = t.trim()
        s = s.replace(Regex("""\s+har\s+bursdag\s*[!.]*$""", RegexOption.IGNORE_CASE), "")
        s = s.replace(Regex("""s?\s+bursdag\s*[!.]*$""", RegexOption.IGNORE_CASE), "")
        s = s.replace(Regex("""^bursdag\s*[:·–-]?\s*""", RegexOption.IGNORE_CASE), "")
        s = s.replace(Regex("""\s+\(?\d{1,3}\s*år\)?$""", RegexOption.IGNORE_CASE), "").trim()
        return s.ifBlank { t }
    }

    fun listTitle(e: KEv, calName: String): String = if (isBirthday(e, calName)) "🎂 " + bdName(e.t) else e.t

    fun parsePeople(body: String): List<BdPerson> = runCatching {
        val any = org.json.JSONTokener(body).nextValue()
        val arr = when (any) { is JSONObject -> any.optJSONArray("items") ?: any.optJSONArray("people") ?: JSONArray(); is JSONArray -> any; else -> JSONArray() }
        (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val n = o.optString("name").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            BdPerson(o.optInt("id"), n, if (o.isNull("year")) null else o.optInt("year").takeIf { it > 1900 },
                o.optString("photoUrl").ifBlank { o.optString("avatarUrl").takeIf { it != "null" } ?: "" },
                o.optString("phone").takeIf { it != "null" } ?: "", (o.optString("congratsVia").ifBlank { o.optString("via") }).lowercase())
        }
    }.getOrDefault(emptyList())

    fun match(n: String, list: List<BdPerson>): BdPerson? {
        val low = n.lowercase(); if (low.isBlank()) return null
        return list.firstOrNull { it.name.lowercase() == low } ?: list.firstOrNull { low.startsWith(it.name.lowercase()) }
            ?: list.firstOrNull { it.name.lowercase().substringBefore(' ') == low }
    }

    fun counter(d: LocalDate): Triple<String, String, String> {
        val n = daysBetween(today(), d)
        return when {
            n == 0 -> Triple("BURSDAG I DAG", "I dag", "")
            n < 0 -> Triple("BURSDAG", "${-n}", if (n == -1) "dag siden" else "dager siden")
            else -> Triple("BURSDAG", "$n", if (n == 1) "dag igjen" else "dager igjen")
        }
    }

    fun bdSub(d: LocalDate, year: Int?): String {
        val date = cap(WD[d.jsDay]) + " " + d.dayOfMonth + ". " + MN[d.monthValue - 1]
        val age = year?.let { d.year - it }?.takeIf { it in 1..129 }
        return if (age != null) "Fyller $age · $date" else date
    }

    fun rr(i: Int): Double { val v = (sin(i * 91.7) * 43758.5) % 1.0; return (v + 1.0) % 1.0 }

    /** Bilde fra Bursdager (relativ sti hentes med app-tokenet). */
    suspend fun bytes(s: KalSession, url: String): ByteArray? = withContext(Dispatchers.IO) {
        runCatching {
            val full = if (url.startsWith("/")) s.server.trimEnd('/') + url else url
            val c = URL(full).openConnection() as HttpURLConnection
            c.connectTimeout = 10_000; c.readTimeout = 15_000
            if (url.startsWith("/") || full.startsWith(s.server)) c.setRequestProperty("Authorization", "Bearer " + s.token)
            try { if (c.responseCode in 200..299) c.inputStream.use { it.readBytes() } else null } finally { c.disconnect() }
        }.getOrNull()
    }

    fun firstPhoto(body: String): String? = runCatching {
        val any = org.json.JSONTokener(body).nextValue()
        val arr = when (any) { is JSONObject -> any.optJSONArray("photos") ?: any.optJSONArray("items") ?: JSONArray(); is JSONArray -> any; else -> JSONArray() }
        (0 until arr.length()).firstNotNullOfOrNull { i -> arr.optJSONObject(i)?.let { o -> o.optString("url").ifBlank { o.optString("src") }.takeIf { it.isNotBlank() } } }
    }.getOrNull()

    fun fromGoogle(e: KEv): Boolean = e.id.startsWith("g-") || e.id.startsWith("gc")

    /* ---------- Glimt-søk ---------- */

    fun line(e: KEv, calName: String): String =
        e.id + " | " + e.d + " (" + WS[e.d.jsDay] + ") | " + (if (e.all) "hele dagen" else hm(e.s ?: 0) + "–" + hm(e.e ?: ((e.s ?: 0) + 60))) + " | " + e.t +
            (e.loc?.let { " | $it" } ?: "") + " | " + calName

    /** POST /api/kalender/glimt/search {q, today, events} → {text, events:[{id}]}; reserve /api/calendar/ask. null = ikke tilgjengelig. */
    suspend fun remoteSearch(s: KalSession, q: String, lines: List<String>): Pair<String, List<String>>? {
        val body = JSONObject().put("q", q).put("today", today().toString()).put("events", JSONArray(lines)).put("engine", "auto").put("local", true)
        val res = runCatching { s.api.post("/api/kalender/glimt/search", body, read = 20_000) }.getOrNull()
            ?: runCatching { s.api.post("/api/calendar/ask", body, read = 20_000) }.getOrNull() ?: return null
        val o = runCatching { JSONObject(res) }.getOrNull() ?: return null
        val text = o.optString("text").ifBlank { o.optString("answer") }.trim()
        val ids = ArrayList<String>()
        o.optJSONArray("events")?.let { a -> for (i in 0 until a.length()) { val x = a.opt(i); if (x is JSONObject) x.optString("id").takeIf { it.isNotBlank() }?.let(ids::add) else if (x is String) ids += x } }
        o.optJSONArray("ids")?.let { a -> for (i in 0 until a.length()) ids += a.optString(i) }
        return text to ids
    }

    fun localSearch(q: String, list: List<KEv>): Pair<String, List<KEv>> {
        val stop = setOf("når", "hva", "har", "jeg", "neste", "skjer", "den", "det", "som", "med", "for", "var", "sist", "hvilke", "hvor", "min", "mine")
        val w = q.lowercase().split(Regex("""[^\p{L}\p{N}]+""")).filter { it.length > 2 && it !in stop }
        val T = today()
        val hit = list.filter { e -> !e.d.isBefore(T) && w.any { x -> (e.t + " " + (e.loc ?: "")).lowercase().contains(x) } }
        return if (hit.isEmpty()) "Fant ingen hendelser som passer." to emptyList() else "Fant ${hit.size} hendelser som passer. Første er ${hit[0].t}." to hit.take(6)
    }

    /* ---------- Testvarsel ---------- */

    const val TEST_TITLE = "Kalender · test"
    const val TEST_BODY = "Tannlege kl. 17:30 · om 15 min. Varsler virker."

    fun notificationsOn(ctx: Context): Boolean {
        if (!KalNotify.canPost(ctx)) return false
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return true
        return nm.areNotificationsEnabled()
    }

    fun postTest(ctx: Context) {
        KalNotify.channels(ctx)
        val n = NotificationCompat.Builder(ctx, KalNotify.CH_EVENTS)
            .setSmallIcon(R.drawable.ic_kal_notif).setColor(0xFFB23A2A.toInt())
            .setContentTitle(TEST_TITLE).setContentText(TEST_BODY).setStyle(NotificationCompat.BigTextStyle().bigText(TEST_BODY))
            .setCategory(NotificationCompat.CATEGORY_EVENT).setPriority(NotificationCompat.PRIORITY_HIGH).setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true).setContentIntent(KalNotify.openIntent(ctx, "kalender://", 4141)).build()
        runCatching { NotificationManagerCompat.from(ctx).notify("test41", 1, n) }
    }

    fun appNotificationSettings(ctx: Context): Intent =
        if (Build.VERSION.SDK_INT >= 26) Intent("android.settings.APP_NOTIFICATION_SETTINGS").putExtra("android.provider.extra.APP_PACKAGE", ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        else Intent("android.settings.APPLICATION_DETAILS_SETTINGS", Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}

/** Korutine i KalVm sin viewModelScope (brukes av K41State). */
fun KalVm.viewModelScope41(block: suspend CoroutineScope.() -> Unit): Job = viewModelScope.launch(block = block)

/** Tilstanden for prompt 41 (eies av KalVm, som k39). */
class K41State(private val vm: KalVm) {
    private val ctx: Application get() = vm.getApplication()

    /* Innlogging: start | wait | err | pw */
    var phase by mutableStateOf("start")
    var err by mutableStateOf("")
    var step by mutableStateOf(0)
    var offerServer by mutableStateOf(false)
    var serverOpen by mutableStateOf(false)
    var serverText by mutableStateOf(Kal41.manual(vm.getApplication()))
    var webOffer by mutableStateOf(false)
    var whoName by mutableStateOf<String?>(null)
    /** Prompt 51: ny enhet venter på godkjenning (fase «approve51»). pollKey vises aldri. */
    var approval51 by mutableStateOf<Kal51Approval?>(null)
    private var waitJob: Job? = null
    private var waitId = 0
    /** Prompt 44: samme svar to ganger (onCreate + onNewIntent) skal ikke gi «koden er allerede brukt». */
    private var lastCode44 = ""
    private var returnJob44: Job? = null

    /* Bursdager, Glimt-søk og testvarsel */
    var people by mutableStateOf<List<Kal41.BdPerson>>(emptyList())
    private var peopleAt = 0L
    var aiOn by mutableStateOf(false)
    var aiBusy by mutableStateOf(false)
    var aiText by mutableStateOf("")
    var aiHits by mutableStateOf<List<KEv>>(emptyList())
    var aiLocal by mutableStateOf(false)
    private var aiJob: Job? = null
    var banner by mutableStateOf(false)
    var denied by mutableStateOf(false)
    var pushText by mutableStateOf("")

    /* ---------- Innlogging ---------- */

    fun loadWho() {
        vm.viewModelScope41 {
            val b = Kal41.who(ctx)
            whoName = b?.let { (it.getString("name")?.takeIf { n -> n.isNotBlank() } ?: it.getString("username")?.takeIf { n -> n.isNotBlank() }) ?: "Homelab-kontoen" }
        }
    }

    fun quick() {
        Hap.tick(); phase = "wait"; step = 3; err = ""
        vm.viewModelScope41 {
            val (s, e) = Kal41.continueAs(ctx)
            if (s != null) done(s) else fail(e ?: "Fikk ikke svar fra Homelab-appen.", false)
        }
    }

    fun viaApp() {
        Hap.tick(); err = ""; webOffer = false; step = 0; phase = "wait"
        val id = ++waitId
        waitJob?.cancel()
        waitJob = vm.viewModelScope41 {
            val c = Kal41.candidates(ctx, listOfNotNull(KalAuth.lastServer(ctx).takeIf { it.isNotBlank() }))
            val base = Kal41.firstReachable(c.take(3)) ?: c.firstOrNull() ?: Kal41.DEFAULT_BASE
            if (id != waitId) return@viewModelScope41
            val p = Kal41.begin(ctx, base)
            if (open(p)) step = 1 else { webOffer = true; fail("Fant ikke Homelab-appen. Logg inn med brukernavn og passord, eller installer Homelab.", false); return@viewModelScope41 }
            delay(Kal41.TIMEOUT_MS)
            if (phase == "wait" && id == waitId && step < 2) fail("Homelab svarte ikke. Sjekk at Homelab er innlogget, og prøv igjen.", false)
        }
    }

    /** App Link først (bare apper, ikke nettleseren), så homelab://. */
    private fun open(p: Kal41.Pending): Boolean {
        val flags = Intent.FLAG_ACTIVITY_NEW_TASK or (if (Build.VERSION.SDK_INT >= 30) 0x00000400 /* FLAG_ACTIVITY_REQUIRE_NON_BROWSER */ else 0)
        if (Build.VERSION.SDK_INT >= 30) {
            try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Kal41.appLink(p)).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(flags)); return true } catch (_: ActivityNotFoundException) { } catch (_: Exception) { }
        }
        return try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Kal41.schemeLink(p)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true } catch (_: Exception) { false }
    }

    fun approveInBrowser() {
        Hap.tick(); phase = "wait"; step = 1; err = ""
        val id = ++waitId
        waitJob?.cancel()
        waitJob = vm.viewModelScope41 {
            val c = Kal41.candidates(ctx)
            val base = Kal41.firstReachable(c.take(3)) ?: Kal41.DEFAULT_BASE
            val p = Kal41.begin(ctx, base)
            runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Kal41.webLink(p, base)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            delay(180_000)
            if (phase == "wait" && id == waitId && step < 2) fail("Fikk ikke svar fra godkjenningen. Prøv igjen.", false)
        }
    }

    /** kalender://auth?code=…&state=… eller ?error=denied */
    fun handleRedirect(uri: Uri) {
        waitId++
        waitJob?.cancel()
        uri.getQueryParameter("error")?.let { e ->
            Kal41.clearPending(ctx)
            fail(if (e.contains("denied") || e.contains("avvist") || e.contains("cancel")) "Innloggingen ble avvist i Homelab." else "Homelab: $e", false)
            return
        }
        val code = uri.getQueryParameter("code") ?: return
        val state = uri.getQueryParameter("state") ?: return
        if (code == lastCode44) return
        lastCode44 = code
        returnJob44?.cancel()
        vm.viewModelScope41 { Kal44.log(ctx, "auth.handoff.return") }
        phase = "wait"; step = 2; err = ""
        vm.viewModelScope41 {
            try {
                val s = Kal41.exchange(ctx, code, state, uri.getQueryParameter("server") ?: uri.getQueryParameter("base"))
                step = 3
                done(s)
            } catch (e: KalApiException) {
                fail(Kal41.message(e), e.status == 0)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                fail(e.message ?: "Innloggingen feilet", false)
            }
        }
    }

    fun cancel() { Hap.tick(); waitId++; waitJob?.cancel(); Kal41.clearPending(ctx); phase = "start" }

    fun password() { Hap.tick(); err = ""; vm.lErr = null; phase = "pw" }

    fun submitPassword() {
        if (vm.lBusy) return
        if (vm.lUser.isBlank() || vm.lPass.isBlank()) { vm.lErr = "Skriv inn brukernavn og passord."; return }
        vm.lBusy = true; vm.lErr = null; offerServer = false
        vm.viewModelScope41 {
            try {
                val base = Kal41.firstReachable(Kal41.candidates(ctx))
                if (base == null) { vm.lErr = "Får ikke kontakt med Homelab."; offerServer = true; return@viewModelScope41 }
                val s = KalApi.login(base, vm.lUser, vm.lPass, vm.lCode.takeIf { vm.lTotp })
                KalAuth.rememberServer(ctx, base)
                done(s)
            } catch (e: KalApiException) {
                val ap = e.approval51
                if (ap != null) { vm.lPass = ""; vm.lCode = ""; startApproval51(ap) }
                else if (e.needsTotp) { vm.lTotp = true; vm.lErr = if (vm.lCode.isBlank()) null else e.message } else vm.lErr = e.message
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                vm.lErr = e.message ?: "Innloggingen feilet"
            } finally { vm.lBusy = false }
        }
    }

    /* ---------- Prompt 51: ny enhet venter på godkjenning ---------- */

    /** Poller statusUrl til innloggingen er godkjent fra en kjent enhet (eller avvist/utløpt), og fullfører med finishUrl. */
    fun startApproval51(ap: Kal51Approval) {
        val id = ++waitId
        waitJob?.cancel()
        approval51 = ap; err = ""; vm.lErr = null; phase = "approve51"
        waitJob = vm.viewModelScope41 {
            val r = Kal51Approve.run(ap) { id != waitId }
            if (id != waitId) return@viewModelScope41
            approval51 = null
            when (r) {
                is Kal51Outcome.Done -> done(r.s)
                is Kal51Outcome.Cancelled -> Unit
                else -> { vm.lErr = Kal51Approve.message(r); phase = "pw" }
            }
        }
    }

    fun cancelApproval51() { Hap.tick(); waitId++; waitJob?.cancel(); approval51 = null; phase = "start" }

    fun saveServer() {
        val s = KalApi.normalizeServer(serverText)
        if (s.isNotBlank() && !s.startsWith("http")) return
        Kal41.setManual(ctx, s)
        serverOpen = false; offerServer = false; err = ""; vm.lErr = null
    }

    private fun done(s: KalSession) {
        phase = "start"; step = 0; err = ""
        vm.signedIn41(s)
        // Prompt 51: flagg, ventende enheter og «Nytt i denne versjonen» for den nye innloggingen.
        vm.k51.didLogin()
        Hap.tick()
        vm.showToast("✓ Logget inn som " + s.name.ifBlank { s.username.ifBlank { "Homelab-kontoen" } })
        vm.viewModelScope41 { Kal41.syncServers(ctx)?.let { vm.session = it } }
    }

    private fun fail(msg: String, server: Boolean) {
        err = msg; offerServer = server; phase = "err"
        android.util.Log.i("kal44", "auth.handoff.fail $msg")
    }

    /** Prompt 44: tilbake i Kalender mens den venter på Homelab – kommer det ikke svar innen 20 s: «Fikk ikke svar fra Homelab». */
    fun returned44() {
        if (phase != "wait" || step >= 2) return
        val id = waitId
        returnJob44?.cancel()
        returnJob44 = vm.viewModelScope41 {
            delay(20_000)
            if (phase == "wait" && id == waitId && step < 2) fail("Fikk ikke svar fra Homelab. Prøv igjen, eller logg inn med passord.", false)
        }
    }

    fun syncServers() { vm.viewModelScope41 { Kal41.syncServers(ctx)?.let { vm.session = it } } }

    /* ---------- Bursdager ---------- */

    fun loadPeople() {
        val s = vm.session ?: return
        if (System.currentTimeMillis() - peopleAt < 300_000) return
        peopleAt = System.currentTimeMillis()
        vm.viewModelScope41 {
            val l = runCatching { Kal41.parsePeople(s.api.get("/api/birthdays", timeout = 12_000)) }.getOrDefault(emptyList())
            if (l.isNotEmpty()) people = l
        }
    }

    var photos by mutableStateOf<Map<Int, androidx.compose.ui.graphics.ImageBitmap>>(emptyMap())
    private val asked = HashSet<Int>()

    fun loadPhoto(p: Kal41.BdPerson) {
        val s = vm.session ?: return
        if (p.id <= 0 || !asked.add(p.id)) return
        vm.viewModelScope41 {
            var url = p.photo
            if (url.isBlank()) url = runCatching { Kal41.firstPhoto(s.api.get("/api/birthdays/${p.id}/photos")) }.getOrNull() ?: ""
            if (url.isBlank()) return@viewModelScope41
            val b = Kal41.bytes(s, url) ?: return@viewModelScope41
            val bmp = withContext(Dispatchers.Default) { runCatching { android.graphics.BitmapFactory.decodeByteArray(b, 0, b.size) }.getOrNull() } ?: return@viewModelScope41
            photos = photos + (p.id to bmp.asImageBitmap())
        }
    }

    fun congratulate(name: String, p: Kal41.BdPerson?) {
        Hap.tick()
        val first = name.substringBefore(' ')
        val text = "Gratulerer med dagen, $first!"
        val phone = (p?.phone ?: "").filter { it.isDigit() || it == '+' }
        if (p?.via == "whatsapp") {
            val wa = if (phone.isBlank()) "whatsapp://send?text=" + Uri.encode(text) else "https://wa.me/" + phone.removePrefix("+") + "?text=" + Uri.encode(text)
            try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(wa)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return } catch (_: Exception) { }
        }
        val i = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + phone)).putExtra("sms_body", text).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { ctx.startActivity(i) } catch (_: Exception) { vm.showToast("Fant ingen meldingsapp") }
    }

    fun gift(name: String, d: LocalDate) {
        Hap.tick()
        val s = vm.session ?: return
        val q = "Kjøp gave til $name før ${d.dayOfMonth}. ${MN[d.monthValue - 1]}"
        vm.viewModelScope41 {
            try {
                s.api.post("/api/tasks/glimt", JSONObject().put("q", q).put("async", true).put("source", "kalender"))
                vm.showToast("Lagt til i Huskeliste · gave til $name")
            } catch (e: KalApiException) {
                vm.showToast(if (e.status == 404) "Huskeliste med Glimt finnes ikke på serveren ennå" else "Fikk ikke lagt til: ${e.message}")
            }
        }
    }

    fun openBirthdays(name: String, p: Kal41.BdPerson?) {
        Hap.tick()
        val u = "finanshub://bursdager?name=" + Uri.encode(name) + (p?.id?.takeIf { it > 0 }?.let { "&id=$it" } ?: "")
        try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {
            vm.showToast("Åpne Homelab → Bursdager for å se ${name.substringBefore(' ')}")
        }
    }

    /* ---------- Glimt-søk ---------- */

    fun aiReset() { aiJob?.cancel(); aiOn = false; aiBusy = false; aiText = ""; aiHits = emptyList(); aiLocal = false }

    fun aiGo(q0: String) {
        Hap.tick()
        val q = q0.trim()
        if (q.isEmpty()) { aiOn = true; aiBusy = false; aiLocal = false; aiHits = emptyList(); aiText = "Skriv et spørsmål, f.eks. «hva skjer i helgen?» eller «når har jeg fri neste uke?»"; return }
        ask(q)
    }

    fun aiSubmit(q0: String) { val q = q0.trim(); if (q.contains(' ')) ask(q) }

    private fun ask(q: String) {
        aiJob?.cancel()
        aiOn = true; aiBusy = true; aiText = ""; aiHits = emptyList(); aiLocal = false
        val T = today()
        val list = vm.all.filter { !it.d.isBefore(T.minusDays(60)) && !it.d.isAfter(T.plusDays(180)) }.sortedWith(compareBy<KEv> { it.d }.thenBy { it.s ?: -1 })
        val lines = list.take(220).map { Kal41.line(it, vm.cal(it.cal).n) }
        val s = vm.session
        aiJob = vm.viewModelScope41 {
            val r = if (s == null) null else withTimeoutOrNull(20_000) { Kal41.remoteSearch(s, q, lines) }
            aiBusy = false
            if (r != null && (r.first.isNotBlank() || r.second.isNotEmpty())) {
                aiText = r.first.ifBlank { "Fant ${r.second.size} hendelser." }
                aiHits = r.second.mapNotNull { id -> list.firstOrNull { it.id == id } ?: vm.find(id) }.distinctBy { it.id }.take(6)
                aiLocal = false
            } else {
                val l = Kal41.localSearch(q, list)
                aiText = l.first; aiHits = l.second; aiLocal = true
            }
        }
    }

    /* ---------- Testvarsel ---------- */

    fun test(askPermission: () -> Unit) {
        Hap.tick()
        if (!KalNotify.canPost(ctx) && Build.VERSION.SDK_INT >= 33) { askPermission(); return }
        if (!Kal41.notificationsOn(ctx)) { denied = true; return }
        denied = false
        vm.showToast("Testvarsel kommer om 5 s")
        vm.viewModelScope41 {
            delay(5_000)
            Kal41.postTest(ctx)
            if (vm.foreground) { banner = true; delay(5_000); banner = false }
        }
    }

    fun permissionResult(granted: Boolean) { if (granted) test {} else denied = true }

    fun openNotifSettings() { runCatching { ctx.startActivity(Kal41.appNotificationSettings(ctx)) } }

    fun pushTest() {
        Hap.tick()
        val s = vm.session ?: return
        pushText = "Sender push …"
        vm.viewModelScope41 {
            val t0 = System.currentTimeMillis()
            val res = try { s.api.post("/api/kalender/notify/test", JSONObject().put("app", "kalender").put("platform", "android")) } catch (e: KalApiException) {
                if (e.status == 404 || e.status == 405) runCatching { s.api.post("/api/push/test", JSONObject().put("app", "kalender")) }.getOrElse { x -> pushText = "Push feilet: ${x.message}"; return@viewModelScope41 }
                else { pushText = "Push feilet: ${e.message}"; return@viewModelScope41 }
            }
            val o = runCatching { JSONObject(res) }.getOrNull()
            o?.optString("error")?.takeIf { it.isNotBlank() }?.let { pushText = "Push feilet: $it"; return@viewModelScope41 }
            val ms = o?.optDouble("ms")?.takeIf { !it.isNaN() } ?: (System.currentTimeMillis() - t0).toDouble()
            pushText = "Push sendt · kom fram på " + String.format(java.util.Locale("nb", "NO"), "%.1f", ms / 1000) + " s"
        }
    }
}
