package no.kristo.finanshub

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import java.net.URL
import java.util.UUID

class ApiException(message: String, val status: Int = 0) : Exception(message)

/**
 * Klient for FinansHub-API-et (/finans/api). Appen snakker aldri med resten av homelab.
 * Bruker bare plattformens HttpURLConnection og org.json for å holde avhengighetene få.
 */
class Api(private val baseUrl: String, private val token: String?) {

    private fun url(path: String, prefix: String = "/finans/api") = URL(baseUrl.trimEnd('/') + prefix + path)

    private suspend fun request(method: String, path: String, json: JSONObject? = null, prefix: String = "/finans/api"): String = withContext(Dispatchers.IO) {
        val conn = url(path, prefix).openConnection() as HttpURLConnection
        try { net {
            conn.requestMethod = method
            conn.connectTimeout = 10_000
            conn.readTimeout = 30_000
            conn.setRequestProperty("Accept", "application/json")
            token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (json != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(json.toString().toByteArray()) }
            }
            read(conn)
        } } finally { conn.disconnect() }
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
            val msg = runCatching { JSONObject(body).optString("error") }.getOrNull()?.takeIf { it.isNotBlank() } ?: "Feil $code"
            throw ApiException(msg, code)
        }
        return body
    }

    suspend fun get(path: String) = request("GET", path)
    suspend fun post(path: String, json: JSONObject? = JSONObject()) = request("POST", path, json)
    suspend fun patch(path: String, json: JSONObject) = request("PATCH", path, json)
    suspend fun put(path: String, json: JSONObject) = request("PUT", path, json)
    suspend fun matGet(path: String) = request("GET", path, prefix = "/mat/api")
    suspend fun matPost(path: String, json: JSONObject = JSONObject()) = request("POST", path, json, prefix = "/mat/api")
    suspend fun matPatch(path: String, json: JSONObject) = request("PATCH", path, json, prefix = "/mat/api")

    suspend fun bytes(path: String): ByteArray = withContext(Dispatchers.IO) {
        val conn = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        try { net {
            token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (conn.responseCode >= 400) throw ApiException("Feil ${conn.responseCode}", conn.responseCode)
            conn.inputStream.use { it.readBytes() }
        } } finally { conn.disconnect() }
    }

    /** Multipart-opplasting: original + nedskalert JPEG til AI + miniatyrbilde. */
    suspend fun upload(path: String, parts: List<Part>): String = withContext(Dispatchers.IO) {
        val boundary = "----FinansHub" + UUID.randomUUID().toString().replace("-", "")
        val conn = url(path).openConnection() as HttpURLConnection
        try { net {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 15_000
            conn.readTimeout = 60_000
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            val out = ByteArrayOutputStream()
            for (p in parts) {
                out.write("--$boundary\r\n".toByteArray())
                out.write("Content-Disposition: form-data; name=\"${p.name}\"; filename=\"${p.filename}\"\r\n".toByteArray())
                out.write("Content-Type: ${p.mime}\r\n\r\n".toByteArray())
                out.write(p.data)
                out.write("\r\n".toByteArray())
            }
            out.write("--$boundary--\r\n".toByteArray())
            conn.setFixedLengthStreamingMode(out.size())
            conn.outputStream.use { out.writeTo(it) }
            read(conn)
        } } finally { conn.disconnect() }
    }

    data class Part(val name: String, val filename: String, val mime: String, val data: ByteArray)

    companion object {
        /** Bytter passord mot et token som bare gir tilgang til FinansHub. */
        /** Prøver /login først og faller tilbake til /auth/token på eldre servere. */
        suspend fun login(baseUrl: String, password: String, deviceName: String): String {
            val body = JSONObject().put("password", password).put("device", deviceName).put("deviceName", deviceName)
            val api = Api(baseUrl, null)
            val res = try { api.post("/login", body) } catch (e: ApiException) {
                if (e.status != 404) throw e
                try { api.post("/auth/token", body) } catch (e2: ApiException) {
                    if (e2.status == 404) throw ApiException("Fant ikke FinansHub på $baseUrl (404). Sjekk adressen, eller oppdater homelab-serveren.", 404)
                    throw e2
                }
            }
            return runCatching { JSONObject(res).getString("token") }.getOrElse { throw ApiException("Uventet svar fra serveren. Er dette riktig adresse?") }
        }

        /** Legger til skjema når det mangler: http:// for lokale adresser, ellers https://. */
        fun normalizeServer(raw: String): String {
            val s = raw.trim().trimEnd('/')
            if (s.startsWith("http://", true) || s.startsWith("https://", true)) return s
            val host = s.substringBefore('/').substringBefore(':').lowercase()
            val local = host == "localhost" || host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".home.arpa") ||
                Regex("""^(10|127)\.\d+\.\d+\.\d+$""").matches(host) ||
                Regex("""^192\.168\.\d+\.\d+$""").matches(host) ||
                Regex("""^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$""").matches(host) ||
                Regex("""^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$""").matches(host) ||
                !host.contains('.')
            return (if (local) "http://" else "https://") + s
        }
    }
}

/* ---------------- Modeller ---------------- */

data class Category(val id: Int, val name: String, val color: Long, val kind: String)
data class Account(val id: Int, val name: String, val type: String, val last4: String?, val balance: Double)

data class Settings(
    val name: String, val provider: String, val fallback: Boolean, val autoCat: Boolean,
    val n80: Boolean, val n100: Boolean, val nRc: Boolean, val minConf: Int,
)

data class Boot(val settings: Settings, val categories: List<Category>, val accounts: List<Account>, val reviewCount: Int)

data class Tx(
    val id: Int, val date: String, val amount: Double, val description: String, val category: String, val categoryId: Int?,
    val color: Long, val account: String, val note: String, val receipt: String?,
    val aiShort: String? = null, val aiLong: String? = null, val domain: String? = null,
    val lines: List<Pair<String, Double>> = emptyList(), val folder: String? = null,
)

data class Budget(
    val categoryId: Int, val category: String, val color: Long, val budget: Double, val used: Double,
    val count: Int = 0, val topMerchant: String? = null, val prevUsed: Double? = null,
)

data class Job(val id: String, val name: String, val status: String, val progress: Int, val merchant: String?, val total: Double?)

data class Day(val date: String, val weekday: String, val name: String?, val cost: Double?, val source: String?, val cook: String?, val fixed: Boolean)
data class Shop(val id: String, val text: String, val done: Boolean)
data class Week(val start: String, val days: List<Day>, val cooks: List<String>, val shopping: List<Shop>, val weekCost: Double, val auto: Boolean)

data class Receipt(
    val id: String, val status: String, val provider: String?, val seconds: Double?, val merchant: String?, val date: String?,
    val total: Double?, val categoryId: Int?, val accountId: Int?, val confidence: Double, val flag: String?, val error: String?,
    val mime: String?, val file: String?, val thumb: String?, val lines: List<Pair<String, Double>>, val match: Tx?,
    val aiShort: String? = null, val domain: String? = null,
)

data class Summary(
    val month: String, val from: String, val to: String, val daysLeft: Int, val inn: Double, val ut: Double,
    val budgetTotal: Double, val budgetUsed: Double, val left: Double, val savedYear: Double, val yearGoal: Double,
    val budgets: List<Budget>, val recent: List<Tx>, val review: List<Receipt>,
    val innMonthly: List<Double> = emptyList(),
)

fun color(hex: String?): Long = runCatching { 0xFF000000 or hex!!.removePrefix("#").toLong(16) }.getOrDefault(0xFFA0A0AA)

private fun JSONObject.optStr(k: String): String? = if (isNull(k)) null else optString(k).takeIf { it.isNotBlank() }
private fun JSONObject.optIntOrNull(k: String): Int? = if (isNull(k) || !has(k)) null else optInt(k)
private fun JSONObject.optDoubleOrNull(k: String): Double? = if (isNull(k) || !has(k)) null else optDouble(k)
private inline fun <T> JSONArray.map(f: (JSONObject) -> T): List<T> = (0 until length()).map { f(getJSONObject(it)) }

fun parseBoot(s: String): Boot {
    val o = JSONObject(s)
    val st = o.getJSONObject("settings")
    return Boot(
        Settings(st.optString("name", "Sebastian"), st.optString("provider", "ollama"), st.optBoolean("fallback"), st.optBoolean("autoCat"),
            st.optBoolean("n80"), st.optBoolean("n100"), st.optBoolean("nRc"), st.optInt("minConf", 85)),
        o.getJSONArray("categories").map { Category(it.getInt("id"), it.getString("name"), color(it.optString("color")), it.optString("kind")) },
        o.getJSONArray("accounts").map { Account(it.getInt("id"), it.getString("name"), it.optString("type"), it.optStr("last4"), it.optDouble("balance")) },
        o.optInt("reviewCount"),
    )
}

fun parseTx(o: JSONObject) = Tx(
    o.getInt("id"), o.getString("date"), o.getDouble("amount"), o.optString("description"), o.optString("category"), o.optIntOrNull("categoryId"),
    color(o.optString("color")), o.optString("account"), o.optString("note"), o.optStr("receipt"),
    o.optStr("aiShort"), o.optStr("aiLong"), o.optStr("domain"),
    o.optJSONArray("lines")?.map { it.optString("description") to it.optDouble("amount") } ?: emptyList(),
    o.optStr("folder"),
)

fun parseTxList(s: String): List<Tx> = JSONObject(s).getJSONArray("items").map(::parseTx)

fun parseReceipt(o: JSONObject): Receipt {
    val ex = o.optJSONObject("extraction")
    val lines = ex?.optJSONArray("lines")?.map { it.optString("description") to it.optDouble("amount") } ?: emptyList()
    return Receipt(
        o.getString("id"), o.getString("status"), o.optStr("provider"), o.optDoubleOrNull("seconds"), o.optStr("merchant"), o.optStr("date"),
        o.optDoubleOrNull("total"), o.optIntOrNull("categoryId"), o.optIntOrNull("accountId"), o.optDouble("confidence", 0.0),
        o.optStr("flag"), o.optStr("error"), o.optStr("mime"), o.optStr("file"), o.optStr("thumb"), lines,
        o.optJSONObject("match")?.let(::parseTx),
        o.optStr("aiShort"), o.optStr("domain"),
    )
}

fun parseReceipts(s: String): List<Receipt> = JSONArray(s).map(::parseReceipt)

fun parseSummary(s: String): Summary {
    val o = JSONObject(s)
    return Summary(
        o.getString("month"), o.getString("from"), o.getString("to"), o.optInt("daysLeft", 1), o.optDouble("inn"), o.optDouble("ut"),
        o.optDouble("budgetTotal"), o.optDouble("budgetUsed"), o.optDouble("left"), o.optDouble("savedYear"), o.optDouble("yearGoal"),
        o.getJSONArray("budgets").map {
            Budget(it.getInt("categoryId"), it.optString("category"), color(it.optString("color")), it.optDouble("budget"), it.optDouble("used"),
                it.optInt("count"), it.optStr("topMerchant"), it.optDoubleOrNull("prevUsed"))
        },
        o.getJSONArray("recent").map(::parseTx),
        o.getJSONArray("review").map(::parseReceipt),
        o.optJSONArray("innMonthly")?.let { a -> (0 until a.length()).map { a.optDouble(it) } } ?: emptyList(),
    )
}

fun parseJobs(s: String): List<Job> = JSONArray(s).map {
    Job(it.getString("id"), it.optString("name", "Fil"), it.optString("status"), it.optInt("progress"), it.optStr("merchant"), it.optDoubleOrNull("total"))
}

fun parseWeek(s: String): Week {
    val o = JSONObject(s)
    return Week(
        o.optString("start"),
        o.getJSONArray("days").map { Day(it.getString("date"), it.optString("weekday"), it.optStr("name"), it.optDoubleOrNull("cost"), it.optStr("source"), it.optStr("cook"), it.optBoolean("fixed")) },
        o.optJSONArray("cooks")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList(),
        o.optJSONArray("shopping")?.map { Shop(it.optString("id"), it.optString("text"), it.optBoolean("done")) } ?: emptyList(),
        o.optDouble("weekCost", 0.0), o.optBoolean("auto"),
    )
}
