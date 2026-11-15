package no.kristo.felles.nett

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Svar fra [HttpKlient.send]: status og tekst (også ved feil, så kalleren kan lese feilsvaret selv). */
data class HttpSvar(val status: Int, val body: String) {
    val ok: Boolean get() = status in 200..399
    /** Feilsvaret når status ≥ 400. */
    val feil: Feilsvar? get() = if (ok) null else Feilsvar.fra(body, status)
}

/**
 * Felles HTTP-klient for appene: HttpURLConnection via [openSikker] (klartekst bare på lokalt nett), JSON inn og ut,
 * Bearer-token, tidsgrenser og norske feilmeldinger. Blokkerer: kall den fra en bakgrunnstråd
 * (`withContext(Dispatchers.IO) { … }`), aldri fra Main.
 *
 * [base] er serveradressen (ServerAdresse.normaliser), [token] app-tokenet (null før innlogging).
 * Brukes av :wear og :kalender; :app har sin egen Api med Media-logg og opplasting, men samme feilform ([Feilsvar], [Nettfeil]).
 */
class HttpKlient(
    private val base: String,
    private val token: String?,
    private val faste: Map<String, String> = emptyMap(),
) {
    /**
     * Sender én forespørsel. Kaster [HttpFeil] (status 0) ved nettverksfeil og [UsikretHttp] aldri ut: den blir til
     * [HttpFeil] med [LokaltNett.MSG]. HTTP-feil (≥ 400) kastes ikke; se [HttpSvar.feil] eller bruk [sendOk].
     */
    fun send(
        metode: String,
        sti: String,
        json: String? = null,
        headere: Map<String, String> = emptyMap(),
        tilkobling: Int = 10_000,
        les: Int = 30_000,
    ): HttpSvar {
        val c: HttpURLConnection = URL(base.trimEnd('/') + sti).openSikker()
        try {
            c.requestMethod = metode
            c.connectTimeout = tilkobling
            c.readTimeout = les
            c.setRequestProperty("Accept", "application/json")
            token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            for ((k, v) in faste) c.setRequestProperty(k, v)
            for ((k, v) in headere) c.setRequestProperty(k, v)
            if (json != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                c.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
            }
            val status = c.responseCode
            val body = (if (status < 400) c.inputStream else c.errorStream)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return HttpSvar(status, body)
        } catch (e: IOException) {
            throw HttpFeil(Nettfeil.melding(e, base.substringAfter("://")), 0, null, e)
        } finally {
            c.disconnect()
        }
    }

    /** Som [send], men kaster [HttpFeil] med serverens tekst ved status ≥ 400, og når svaret er en nettside. */
    fun sendOk(metode: String, sti: String, json: String? = null, headere: Map<String, String> = emptyMap(), tilkobling: Int = 10_000, les: Int = 30_000): String {
        val s = send(metode, sti, json, headere, tilkobling, les)
        s.feil?.let { throw HttpFeil(it.error, s.status, it) }
        if (s.body.trimStart().startsWith("<")) throw HttpFeil(Nettfeil.NETTSIDE, 502)
        return s.body
    }
}
