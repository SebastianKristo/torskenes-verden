package no.kristo.finanshub

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.util.UUID
import javax.net.ssl.SSLException

/** Feil fra serveren. needsTotp = innloggingen krever en 6-sifret kode (2FA). */
/** Prompt 28: code og canGemini fra serverens feilsvar ({error, code, canGemini}), f.eks. «Fra skjermbilde». */
class ApiException(message: String, val status: Int = 0, val needsTotp: Boolean = false, val code: String? = null, val canGemini: Boolean = false) : Exception(message)

/** Resultat av innlogging: token og hvem som er logget inn. */
data class LoginResult(val token: String, val username: String, val name: String, val role: String)

/**
 * Klient for FinansHub-API-et (/finans/api) og modulene under «Andre OS» (/mat/api, /domains/api).
 * Bruker bare plattformens HttpURLConnection og org.json for å holde avhengighetene få.
 */
class Api(private val baseUrl: String, private val token: String?) {

    private fun url(path: String, prefix: String) = URL(baseUrl.trimEnd('/') + prefix + media44(path, prefix))

    /** Prompt 44: felles servervalg i Media (Hjemme/Hytta) – `?server=` på alle /api/media- og /api/playback-kall. */
    private fun media44(path: String, prefix: String): String {
        val srv = mediaServer44 ?: return path
        if (prefix != HOMELAB || !path.startsWith("/media/") || path.startsWith("/media/servers") || path.contains("server=")) return path
        return path + (if (path.contains('?')) "&" else "?") + "server=" + java.net.URLEncoder.encode(srv, "UTF-8")
    }

    suspend fun request(method: String, path: String, json: JSONObject? = null, prefix: String = FINANS, timeout: Int = 10_000, read: Int = 30_000): String = withContext(Dispatchers.IO) {
        val conn = url(path, prefix).openConnection() as HttpURLConnection
        val t46 = System.currentTimeMillis()
        try { net {
            conn.requestMethod = method
            conn.connectTimeout = timeout
            conn.readTimeout = read
            conn.setRequestProperty("Accept", "application/json")
            token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (json != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(json.toString().toByteArray()) }
            }
            read(conn).also { log46(prefix, path, method, conn, 200, t46, null) }
        } } catch (e: ApiException) {
            log46(prefix, path, method, conn, if (e.message?.startsWith(TOKEN_REFUSED) == true) 401 else e.status, t46, e.code ?: e.message)
            throw e
        } finally { conn.disconnect() }
    }

    /** Prompt 46: hvert Media-/Avspilling-kall logges (URL, status, om Authorization var med, tid) for «Vis detaljer» i Media. */
    private fun log46(prefix: String, path: String, method: String, conn: HttpURLConnection, status: Int, t0: Long, err: String?) {
        if (prefix != HOMELAB || !(path.startsWith("/media") || path.startsWith("/playback"))) return
        runCatching { MediaLog46.add(method, conn.url.toString(), status, token != null, System.currentTimeMillis() - t0, err) }
    }

    /** Gjør nettverksfeil om til meldinger brukeren kan handle på. */
    private inline fun <T> net(block: () -> T): T = try { block() } catch (e: ApiException) { throw e } catch (e: UnknownHostException) {
        throw ApiException("Fant ikke serveren. Sjekk adressen.")
    } catch (e: ConnectException) {
        throw ApiException("Fikk ikke kontakt med ${baseUrl.substringAfter("://")}. Er du på samme nett, og stemmer http/https og port?")
    } catch (e: SocketTimeoutException) {
        throw ApiException("Serveren svarte ikke i tide.")
    } catch (e: SSLException) {
        throw ApiException("HTTPS-feil (${e.message}). Bruk http:// på lokalt nett, eller installer sertifikatet på telefonen.")
    } catch (e: IOException) {
        throw ApiException(e.message ?: "Nettverksfeil")
    }

    private fun read(conn: HttpURLConnection): String {
        val code = conn.responseCode
        val body = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        if (code >= 400) {
            val o = runCatching { JSONObject(body) }.getOrNull()
            val msg = o?.optString("error")?.takeIf { it.isNotBlank() } ?: "Feil $code"
            // «Ikke innlogget» fra Homelab-, Mat- eller Domener-ruter som ikke godtar app-tokenet ennå: finans-innloggingen er gyldig,
            // så det skal verken logge ut eller vise «Ikke innlogget» (prompt 14). Appen viser ingen melding for dette.
            val path = conn.url.path
            if (code == 401 && !path.startsWith(FINANS) && o?.optBoolean("needsTotp") != true) throw ApiException("$TOKEN_REFUSED ($path)", 403, code = o?.optString("code")?.takeIf { it.isNotBlank() })
            throw ApiException(msg, code, o?.optBoolean("needsTotp") == true, o?.optString("code")?.takeIf { it.isNotBlank() }, o?.optBoolean("canGemini") == true)
        }
        // En nettside (innloggingssiden, en proxy eller Cloudflare) i stedet for data: si det tydelig i stedet for en JSON-feil.
        if (body.trimStart().startsWith("<")) throw ApiException("Uventet svar fra serveren: fikk en nettside i stedet for data fra ${conn.url.path}. Oppdater homelab eller logg inn på nytt.", 502)
        return body
    }

    suspend fun get(path: String) = request("GET", path)
    suspend fun post(path: String, json: JSONObject? = JSONObject()) = request("POST", path, json)
    suspend fun patch(path: String, json: JSONObject) = request("PATCH", path, json)
    suspend fun put(path: String, json: JSONObject) = request("PUT", path, json)
    suspend fun delete(path: String) = request("DELETE", path)
    suspend fun matGet(path: String) = request("GET", path, prefix = MAT)
    suspend fun matPost(path: String, json: JSONObject = JSONObject()) = request("POST", path, json, prefix = MAT)
    suspend fun matPatch(path: String, json: JSONObject) = request("PATCH", path, json, prefix = MAT)
    suspend fun domGet(path: String) = request("GET", path, prefix = DOMAINS)
    suspend fun domPost(path: String, json: JSONObject) = request("POST", path, json, prefix = DOMAINS)
    suspend fun domDelete(path: String) = request("DELETE", path, prefix = DOMAINS)
    /** Homelab (/api): forside, søk, oppsett og profilbilde. Godtar finans-tokenet. */
    suspend fun hlGet(path: String, timeout: Int = 10_000) = request("GET", path, prefix = HOMELAB, timeout = timeout)
    suspend fun hlPost(path: String, json: JSONObject = JSONObject()) = request("POST", path, json, prefix = HOMELAB)
    suspend fun hlPut(path: String, json: JSONObject) = request("PUT", path, json, prefix = HOMELAB)
    suspend fun hlDelete(path: String) = request("DELETE", path, prefix = HOMELAB)

    suspend fun bytes(path: String): ByteArray = withContext(Dispatchers.IO) {
        val conn = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        try { net {
            token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (conn.responseCode >= 400) throw ApiException("Feil ${conn.responseCode}", conn.responseCode)
            conn.inputStream.use { it.readBytes() }
        } } finally { conn.disconnect() }
    }

    /** Multipart-opplasting: filer (f.eks. original + nedskalert JPEG + miniatyr) og tekstfelt (Part uten filnavn). */
    suspend fun upload(path: String, parts: List<Part>, prefix: String = FINANS, read: Int = 60_000): String = withContext(Dispatchers.IO) {
        val boundary = "----FinansHub" + UUID.randomUUID().toString().replace("-", "")
        val conn = url(path, prefix).openConnection() as HttpURLConnection
        try { net {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 15_000
            conn.readTimeout = read
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            val out = ByteArrayOutputStream()
            for (p in parts) {
                out.write("--$boundary\r\n".toByteArray())
                if (p.filename.isEmpty()) {
                    out.write("Content-Disposition: form-data; name=\"${p.name}\"\r\n\r\n".toByteArray())
                } else {
                    out.write("Content-Disposition: form-data; name=\"${p.name}\"; filename=\"${p.filename}\"\r\n".toByteArray())
                    out.write("Content-Type: ${p.mime}\r\n\r\n".toByteArray())
                }
                out.write(p.data)
                out.write("\r\n".toByteArray())
            }
            out.write("--$boundary--\r\n".toByteArray())
            conn.setFixedLengthStreamingMode(out.size())
            conn.outputStream.use { out.writeTo(it) }
            read(conn)
        } } finally { conn.disconnect() }
    }

    data class Part(val name: String, val filename: String, val mime: String, val data: ByteArray) {
        companion object {
            /** Vanlig tekstfelt i skjemaet. */
            fun text(name: String, value: String) = Part(name, "", "", value.toByteArray())
        }
    }

    companion object {
        const val FINANS = "/finans/api"
        const val MAT = "/mat/api"
        const val DOMAINS = "/domains/api"
        const val HOMELAB = "/api"
        /** Begynnelsen på meldingen når en Homelab-rute ikke godtar app-tokenet. Vises ikke som melding. */
        const val TOKEN_REFUSED = "Ikke tilgang med app-token"
        /** Prompt 44: valgt Media-server (id fra /api/media/servers), null = serverens standard. Settes av P44.kt. */
        @Volatile var mediaServer44: String? = null

        /**
         * Bytter brukernavn + passord (+ 2FA-kode) mot et token med finans-tilgang.
         * Kaster ApiException(needsTotp = true) når serveren ber om koden.
         * Prøver /login først og faller tilbake til /auth/token på eldre servere (bare passord).
         */
        suspend fun login(baseUrl: String, username: String, password: String, code: String?, deviceName: String): LoginResult {
            val body = JSONObject().put("password", password).put("device", deviceName).put("deviceName", deviceName)
            if (username.isNotBlank()) body.put("username", username.trim())
            if (!code.isNullOrBlank()) body.put("code", code.trim())
            val api = Api(baseUrl, null)
            val res = try { api.post("/login", body) } catch (e: ApiException) {
                if (e.needsTotp || (e.status != 404 && !(e.status == 401 && e.message?.contains("Ikke innlogget") == true))) throw e
                try { api.post("/auth/token", body) } catch (e2: ApiException) {
                    if (e2.status == 404) throw ApiException("Fant ikke FinansHub på $baseUrl (404). Sjekk adressen, eller oppdater homelab-serveren.", 404)
                    throw e2
                }
            }
            val o = runCatching { JSONObject(res) }.getOrElse { throw ApiException("Uventet svar fra serveren. Er dette riktig adresse?") }
            val token = o.optString("token").takeIf { it.isNotBlank() } ?: throw ApiException("Uventet svar fra serveren. Er dette riktig adresse?")
            val u = o.optJSONObject("user")
            val uname = u?.optString("username")?.takeIf { it.isNotBlank() } ?: username.ifBlank { o.optString("user") }
            val name = u?.optString("name")?.takeIf { it.isNotBlank() } ?: o.optString("user").ifBlank { uname }
            return LoginResult(token, uname, name.ifBlank { "FinansHub" }, u?.optString("role")?.takeIf { it.isNotBlank() } ?: "admin")
        }

        /** Fjerner sti som «/finans» – appen legger selv til /finans/api. */
        private fun stripPath(s: String): String {
            val start = s.indexOf("://").let { if (it >= 0) it + 3 else 0 }
            val i = s.indexOf('/', start)
            return if (i >= 0) s.substring(0, i) else s
        }

        /** Legger til skjema når det mangler: http:// for lokale adresser, ellers https://. */
        fun normalizeServer(raw: String): String {
            val s = stripPath(raw.trim().trimEnd('/'))
            if (s.isBlank()) return s
            if (s.startsWith("http://", true) || s.startsWith("https://", true)) return s
            val host = s.substringBefore('/').substringBefore(':').lowercase()
            return (if (isLocalHost(host)) "http://" else "https://") + s
        }

        fun isLocalHost(host: String): Boolean = host == "localhost" || host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".home.arpa") ||
            Regex("""^(10|127)\.\d+\.\d+\.\d+$""").matches(host) ||
            Regex("""^192\.168\.\d+\.\d+$""").matches(host) ||
            Regex("""^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$""").matches(host) ||
            Regex("""^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$""").matches(host) ||
            !host.contains('.')
    }
}
