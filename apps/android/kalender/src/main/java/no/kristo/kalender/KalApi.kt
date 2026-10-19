package no.kristo.kalender

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/*
 * Prompt 33: nettverk og innlogging i Kalender-appen. Samme server og samme konto som Homelab-appen.
 *  - Innlogging: serveradresse + brukernavn + passord (+ 2FA-kode) → app-token via POST /finans/api/login (som Homelab-appen,
 *    Api.login i :app), reserve /finans/api/auth/token på eldre servere.
 *  - «Logg inn med Homelab-appen»: ContentProvider i Homelab (no.kristo.finanshub.kalender, signature-tillatelse) gir
 *    server-adresse og et eget token for Kalender (POST /api/tokens/companion {app:'kalender', device}; Homelab faller selv
 *    tilbake til /finans/api/tokens på eldre servere). Finnes ikke Homelab, eller svarer den ikke: innloggingsskjermen.
 *  - Bare plattformens HttpURLConnection og org.json (ingen nye avhengigheter).
 */

class KalApiException(message: String, val status: Int = 0, val needsTotp: Boolean = false) : Exception(message)

class KalApi(private val base: String, private val token: String?) {

    suspend fun request(method: String, path: String, json: JSONObject? = null, timeout: Int = 10_000, read: Int = 30_000): String = withContext(Dispatchers.IO) {
        val conn = URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            net {
                conn.requestMethod = method
                conn.connectTimeout = timeout
                conn.readTimeout = read
                conn.setRequestProperty("Accept", "application/json")
                conn.setRequestProperty("X-Client", "kalender-android")
                token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
                if (json != null) {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    conn.outputStream.use { it.write(json.toString().toByteArray()) }
                }
                val code = conn.responseCode
                val body = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
                if (code >= 400) {
                    val o = runCatching { JSONObject(body) }.getOrNull()
                    throw KalApiException(o?.optString("error")?.takeIf { it.isNotBlank() } ?: "Feil $code", code, o?.optBoolean("needsTotp") == true)
                }
                if (body.trimStart().startsWith("<")) throw KalApiException("Uventet svar fra serveren (en nettside i stedet for data).", 502)
                body
            }
        } finally { conn.disconnect() }
    }

    private inline fun <T> net(block: () -> T): T = try { block() } catch (e: KalApiException) { throw e } catch (e: UnknownHostException) {
        throw KalApiException("Fant ikke serveren. Sjekk adressen.")
    } catch (e: ConnectException) {
        throw KalApiException("Fikk ikke kontakt med ${base.substringAfter("://")}.")
    } catch (e: SocketTimeoutException) {
        throw KalApiException("Serveren svarte ikke i tide.")
    } catch (e: SSLException) {
        throw KalApiException("HTTPS-feil (${e.message}). Bruk http:// på lokalt nett.")
    } catch (e: IOException) {
        throw KalApiException(e.message ?: "Nettverksfeil")
    }

    suspend fun get(path: String, timeout: Int = 10_000) = request("GET", path, timeout = timeout)
    suspend fun post(path: String, json: JSONObject = JSONObject(), read: Int = 30_000) = request("POST", path, json, read = read)
    suspend fun patch(path: String, json: JSONObject) = request("PATCH", path, json)
    suspend fun delete(path: String) = request("DELETE", path)

    companion object {
        val device: String get() = "${Build.MANUFACTURER} ${Build.MODEL}".trim()

        /** Brukernavn + passord (+ kode) → token. Kaster needsTotp når serveren ber om 2FA-koden. */
        suspend fun login(baseUrl: String, username: String, password: String, code: String?): KalSession {
            val dev = "Kalender (Android · $device)"
            val body = JSONObject().put("password", password).put("device", dev).put("deviceName", dev)
            if (username.isNotBlank()) body.put("username", username.trim())
            if (!code.isNullOrBlank()) body.put("code", code.trim())
            val api = KalApi(baseUrl, null)
            val res = try { api.post("/finans/api/login", body) } catch (e: KalApiException) {
                if (e.needsTotp || e.status != 404) throw e
                api.post("/finans/api/auth/token", body)
            }
            val o = runCatching { JSONObject(res) }.getOrElse { throw KalApiException("Uventet svar fra serveren. Er dette riktig adresse?") }
            val token = o.optString("token").takeIf { it.isNotBlank() } ?: throw KalApiException("Uventet svar fra serveren. Er dette riktig adresse?")
            val u = o.optJSONObject("user")
            val uname = u?.optString("username")?.takeIf { it.isNotBlank() } ?: username
            return KalSession(baseUrl, token, uname, u?.optString("name")?.takeIf { it.isNotBlank() } ?: uname, "login")
        }

        /** Fjerner sti og legger til skjema: http:// for lokale adresser, ellers https:// (som Api.normalizeServer i :app). */
        fun normalizeServer(raw: String): String {
            var s = raw.trim().trimEnd('/')
            val start = s.indexOf("://").let { if (it >= 0) it + 3 else 0 }
            s.indexOf('/', start).let { if (it >= 0) s = s.substring(0, it) }
            if (s.isBlank() || s.startsWith("http://", true) || s.startsWith("https://", true)) return s
            val host = s.substringBefore('/').substringBefore(':').lowercase()
            val local = host == "localhost" || host.endsWith(".local") || host.endsWith(".lan") || !host.contains('.') ||
                Regex("""^(10|127)\.\d+\.\d+\.\d+$""").matches(host) || Regex("""^192\.168\.\d+\.\d+$""").matches(host) ||
                Regex("""^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$""").matches(host) || Regex("""^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$""").matches(host)
            return (if (local) "http://" else "https://") + s
        }
    }
}

/** Innlogget konto. via: «homelab» (fra Homelab-appen) eller «login» (egen innlogging). */
data class KalSession(val server: String, val token: String, val username: String, val name: String, val via: String) {
    val api: KalApi get() = KalApi(server, token)
    /** Nøkkel for cachen: data fra en annen konto vises aldri. */
    val acct: String get() = "$username@" + server.substringAfter("://")
}

/** Kontoen lagres kryptert (Android Keystore), som i Homelab-appen. Faller tilbake til vanlige prefs hvis Keystore svikter. */
object KalAuth {
    private const val FILE = "kalender_auth"
    @Volatile private var cached: KalSession? = null

    private fun prefs(ctx: Context): SharedPreferences = runCatching {
        EncryptedSharedPreferences.create(
            FILE, MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), ctx.applicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }.getOrElse { ctx.applicationContext.getSharedPreferences(FILE + "_plain", Context.MODE_PRIVATE) }

    fun session(ctx: Context): KalSession? {
        cached?.let { return it }
        val p = prefs(ctx)
        val server = p.getString("server", null) ?: return null
        val token = p.getString("token", null) ?: return null
        return KalSession(server, token, p.getString("username", "") ?: "", p.getString("name", "") ?: "", p.getString("via", "login") ?: "login").also { cached = it }
    }

    fun save(ctx: Context, s: KalSession) {
        prefs(ctx).edit().putString("server", s.server).putString("token", s.token).putString("username", s.username)
            .putString("name", s.name).putString("via", s.via).apply()
        cached = s
    }

    fun clear(ctx: Context) { prefs(ctx).edit().clear().apply(); cached = null }

    fun lastServer(ctx: Context): String = ctx.getSharedPreferences("kalender_prefs", Context.MODE_PRIVATE).getString("last_server", "") ?: ""
    fun rememberServer(ctx: Context, s: String) { ctx.getSharedPreferences("kalender_prefs", Context.MODE_PRIVATE).edit().putString("last_server", s).apply() }

    const val HOMELAB_PKG = "no.kristo.finanshub"
    const val HOMELAB_AUTH = "no.kristo.finanshub.kalender"

    fun homelabInstalled(ctx: Context): Boolean = runCatching { ctx.packageManager.getPackageInfo(HOMELAB_PKG, 0); true }.getOrDefault(false)

    /**
     * Spør Homelab-appen (ContentProvider.call «companion») om server-adresse og et nytt token for Kalender.
     * Kjøres utenfor hovedtråden: Homelab lager tokenet på serveren før den svarer. null + feilmelding når det ikke gikk.
     */
    suspend fun fromHomelab(ctx: Context): Pair<KalSession?, String?> = withContext(Dispatchers.IO) {
        if (!homelabInstalled(ctx)) return@withContext null to "Homelab-appen er ikke installert på telefonen."
        val b: Bundle? = try {
            ctx.contentResolver.call(Uri.parse("content://$HOMELAB_AUTH"), "companion", "Kalender (Android · ${KalApi.device})", Bundle().apply { putString("app", "kalender") })
        } catch (e: SecurityException) {
            return@withContext null to "Homelab-appen er signert med en annen nøkkel. Logg inn med brukernavn og passord."
        } catch (e: Exception) {
            return@withContext null to "Fikk ikke svar fra Homelab-appen. Oppdater den, eller logg inn med brukernavn og passord."
        }
        if (b == null) return@withContext null to "Homelab-appen er for gammel. Oppdater den, eller logg inn med brukernavn og passord."
        b.getString("error")?.let { return@withContext null to it }
        val server = b.getString("server")?.takeIf { it.isNotBlank() } ?: return@withContext null to "Logg inn i Homelab-appen først."
        val token = b.getString("token")?.takeIf { it.isNotBlank() } ?: return@withContext null to "Homelab-appen ga ikke noe token."
        val u = b.getString("username").orEmpty()
        KalSession(server, token, u, b.getString("name")?.takeIf { it.isNotBlank() } ?: u, "homelab") to null
    }
}
