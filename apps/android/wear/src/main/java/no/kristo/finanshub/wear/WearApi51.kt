package no.kristo.finanshub.wear

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/*
 * Prompt 51 (ANDPLAT51): Wear OS-klienten mot Homelab-serveren (samme API som telefonen, ingen nye endepunkter).
 *  - Innlogging: klokka ber om en QR-økt (POST /api/auth/qr/session {app:'finans', platform:'android', device:'Klokke · …'}), viser QR-en
 *    (bare sessionId + engangskode + server – aldri et token) og poller GET /api/auth/qr/session/:id (X-QR-Key). Telefonen skanner den
 *    med FinansHub → «Logg inn på annen enhet» og godkjenner med biometri. Ved godkjenning får klokka ÉN gang sitt eget token
 *    (egen enhetsøkt som kan logges ut fra Innstillinger → Enheter). Tokenet lagres kryptert (EncryptedSharedPreferences).
 *  - Sjekk inn / «Hent meg»: POST /api/family/checkin {to, quick:'ok'|'pickup', lat?, lon?} (posisjonen bare med selve innsjekken).
 *  - Avganger: /api/me/stops + /api/ruter/departures?stop=…&n=5.
 *  - Handleliste: Gjøremål-listen «Handel» (/api/tasks/lists, /api/tasks?list=…, PATCH /api/tasks/:id {done}, POST /api/tasks).
 *  - Glimt med tale: talegjenkjenning på klokka (systemets RecognizerIntent) → POST /api/glimt/agent {text, module:'home'}.
 */

class WearApiError51(message: String, val status: Int = 0) : Exception(message)

data class WAcct51(val server: String, val token: String, val name: String)
data class WPerson51(val id: String, val name: String)
data class WDep51(val line: String, val to: String, val minutes: Int?, val realtime: Boolean)
data class WStop51(val id: String, val name: String, val deps: List<WDep51>)
data class WItem51(val id: String, val title: String, val done: Boolean)
data class WQr51(val sessionId: String, val payload: String, val key: String, val expires: Long)

const val DEFAULT_SERVER51 = "https://os.smarthjemexperten.no"

object WearStore51 {
    private fun prefs(ctx: Context): SharedPreferences = runCatching {
        EncryptedSharedPreferences.create("wear51", MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), ctx.applicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    }.getOrElse { ctx.applicationContext.getSharedPreferences("wear51_plain", Context.MODE_PRIVATE) }

    fun account(ctx: Context): WAcct51? {
        val p = prefs(ctx)
        val s = p.getString("server", null) ?: return null
        val t = p.getString("token", null) ?: return null
        return WAcct51(s, t, p.getString("name", null) ?: "")
    }

    fun save(ctx: Context, a: WAcct51) { prefs(ctx).edit().putString("server", a.server).putString("token", a.token).putString("name", a.name).apply() }
    fun logout(ctx: Context) { prefs(ctx).edit().remove("token").remove("name").apply() }
    fun server(ctx: Context): String = prefs(ctx).getString("server", null) ?: DEFAULT_SERVER51
    fun setServer(ctx: Context, s: String) { prefs(ctx).edit().putString("server", normalize51(s)).apply() }
}

fun normalize51(raw: String): String {
    val s = raw.trim().trimEnd('/')
    if (s.isBlank()) return DEFAULT_SERVER51
    val withScheme = if (s.startsWith("http://", true) || s.startsWith("https://", true)) s else "https://$s"
    val start = withScheme.indexOf("://") + 3
    val i = withScheme.indexOf('/', start)
    return if (i >= 0) withScheme.substring(0, i) else withScheme
}

class WearApi51(private val server: String, private val token: String?) {

    suspend fun call(method: String, path: String, body: JSONObject? = null, headers: Map<String, String> = emptyMap(), read: Int = 20_000): JSONObject =
        withContext(Dispatchers.IO) {
            val c = URL(server.trimEnd('/') + "/api" + path).openConnection() as HttpURLConnection
            try {
                c.requestMethod = method
                c.connectTimeout = 10_000
                c.readTimeout = read
                c.setRequestProperty("Accept", "application/json")
                c.setRequestProperty("User-Agent", "FinansHubWear/51 (Android ${Build.VERSION.RELEASE})")
                token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
                headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
                if (body != null) {
                    c.doOutput = true
                    c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    c.outputStream.use { it.write(body.toString().toByteArray()) }
                }
                val code = c.responseCode
                val txt = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
                val o = runCatching { if (txt.trimStart().startsWith("[")) JSONObject().put("items", JSONArray(txt)) else JSONObject(txt.ifBlank { "{}" }) }.getOrNull()
                if (code >= 400) throw WearApiError51(o?.optString("error")?.takeIf { it.isNotBlank() } ?: "Feil $code", code)
                o ?: throw WearApiError51("Uventet svar fra serveren", code)
            } catch (e: IOException) {
                throw WearApiError51("Ingen kontakt med serveren")
            } finally { c.disconnect() }
        }

    /* ---------- Innlogging med QR ---------- */

    suspend fun qrStart(): WQr51 {
        val dev = "Klokke · " + Build.MODEL.ifBlank { "Wear OS" }
        val o = call("POST", "/auth/qr/session", JSONObject().put("app", "finans").put("platform", "android").put("device", dev).put("deviceName", dev))
        val sid = o.optString("sessionId").ifBlank { throw WearApiError51("Uventet svar fra serveren") }
        val code = o.optString("code")
        val key = o.optString("clientKey")
        val srv = o.optString("server").ifBlank { server }
        val payload = o.optString("qr").ifBlank {
            "papir://login?s=" + URLEncoder.encode(sid, "UTF-8") + "&c=" + URLEncoder.encode(code, "UTF-8") + "&srv=" + URLEncoder.encode(srv, "UTF-8")
        }
        val ttl = o.optLong("ttl", 120L).coerceIn(30L, 120L) * 1000
        return WQr51(sid, payload, key, System.currentTimeMillis() + ttl)
    }

    /** state + token (bare én gang, ved «done»). */
    suspend fun qrPoll(q: WQr51): JSONObject = try {
        call("GET", "/auth/qr/session/" + URLEncoder.encode(q.sessionId, "UTF-8"), headers = mapOf("X-QR-Key" to q.key), read = 10_000)
    } catch (e: WearApiError51) {
        if (e.status == 404 || e.status == 410) JSONObject().put("state", "expired") else throw e
    }

    /* ---------- Sjekk inn ---------- */

    suspend fun family(): List<WPerson51> {
        val a = call("GET", "/family/checkin").optJSONArray("people") ?: JSONArray()
        return (0 until a.length()).mapNotNull { a.optJSONObject(it) }.filter { !it.optBoolean("self") }.mapNotNull { p ->
            val id = p.optString("userId").ifBlank { p.optString("id") }
            if (id.isBlank()) null else WPerson51(id, p.optString("name").ifBlank { "?" })
        }
    }

    suspend fun checkin(to: List<String>, quick: String, lat: Double?, lon: Double?, acc: Double?) {
        val b = JSONObject().put("to", JSONArray(to)).put("quick", quick)
        if (lat != null && lon != null) { b.put("lat", lat).put("lon", lon); acc?.let { b.put("acc", it) } }
        call("POST", "/family/checkin", b)
    }

    /* ---------- Avganger ---------- */

    suspend fun departures(): List<WStop51> {
        val sa = call("GET", "/me/stops").let { it.optJSONArray("stops") ?: it.optJSONArray("items") } ?: JSONArray()
        val stops = (0 until sa.length()).mapNotNull { sa.optJSONObject(it) }.take(3)
        return stops.mapNotNull { st ->
            val id = st.optString("id").ifBlank { return@mapNotNull null }
            val o = runCatching { call("GET", "/ruter/departures?stop=" + URLEncoder.encode(id, "UTF-8") + "&n=5") }.getOrNull() ?: return@mapNotNull null
            val da = o.optJSONArray("departures") ?: JSONArray()
            val deps = (0 until da.length()).mapNotNull { da.optJSONObject(it) }.filter { !it.optBoolean("cancelled") }.map { d ->
                WDep51(d.optString("line").ifBlank { d.optString("publicCode").ifBlank { "?" } }, d.optString("to").ifBlank { d.optString("destination") },
                    if (d.has("minutes") && !d.isNull("minutes")) d.optInt("minutes") else null, d.optBoolean("realtime"))
            }
            WStop51(id, st.optString("name").ifBlank { o.optJSONObject("stop")?.optString("name") ?: "Holdeplass" }, deps)
        }
    }

    /* ---------- Handleliste (Gjøremål «Handel») ---------- */

    suspend fun shoppingList(): String? {
        val a = call("GET", "/tasks/lists").optJSONArray("lists") ?: return null
        val l = (0 until a.length()).mapNotNull { a.optJSONObject(it) }
        return (l.firstOrNull { it.optString("name").equals("Handel", true) } ?: l.firstOrNull { it.optString("name").lowercase().startsWith("handle") })
            ?.optString("id")?.takeIf { it.isNotBlank() }
    }

    suspend fun items(list: String?): List<WItem51> {
        val o = call("GET", "/tasks" + (list?.let { "?list=" + URLEncoder.encode(it, "UTF-8") } ?: ""))
        val a = o.optJSONArray("items") ?: JSONArray()
        return (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map { WItem51(it.optString("id"), it.optString("title").ifBlank { it.optString("n") }, it.optBoolean("done")) }
            .filter { it.id.isNotBlank() }.sortedBy { it.done }.take(30)
    }

    suspend fun setDone(id: String, done: Boolean) { call("PATCH", "/tasks/" + URLEncoder.encode(id, "UTF-8"), JSONObject().put("done", done)) }

    suspend fun add(list: String?, title: String) {
        val b = JSONObject().put("title", title).put("n", title)
        if (list != null) b.put("list", list).put("l", list)
        call("POST", "/tasks", b)
    }

    /* ---------- Glimt ---------- */

    suspend fun glimt(text: String): String {
        val o = call("POST", "/glimt/agent", JSONObject().put("text", text).put("module", "home").put("requestId", java.util.UUID.randomUUID().toString()), read = 45_000)
        val reply = o.optString("reply").ifBlank { o.optString("text") }.ifBlank { "Glimt svarte ikke." }
        val confirm = o.optJSONObject("confirm")?.optString("summary")?.takeIf { it.isNotBlank() }
        return if (confirm != null) "$reply\n\nBekreft i appen på telefonen: $confirm" else reply
    }
}
