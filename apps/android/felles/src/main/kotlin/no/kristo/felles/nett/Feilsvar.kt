package no.kristo.felles.nett

import org.json.JSONObject
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * Feilsvaret fra serveren: {error, code, reason?} (shared/schemas/common/error.schema.json, server/http/errors.js).
 * Eldre ruter sender også needsTotp, kode (norsk) og canGemini; de leses med.
 */
data class Feilsvar(
    /** Norsk tekst som kan vises til brukeren. */
    val error: String,
    /** Maskinlesbar kode (NOT_FOUND, HOMELAB_AUTH, TOKEN_EXPIRED …). Tom når serveren ikke sendte noen. */
    val code: String,
    /** Ved 401 HOMELAB_AUTH/TOKEN_EXPIRED: none | invalid | expired. */
    val reason: String? = null,
    val needsTotp: Boolean = false,
    val canGemini: Boolean = false,
    /** Hele svaret (f.eks. DEVICE_APPROVAL_REQUIRED med approvalId). */
    val raw: JSONObject? = null,
) {
    /**
     * Tokenet gjelder ikke lenger, og appen skal logge ut / be om ny innlogging: 401 med HOMELAB_AUTH eller TOKEN_EXPIRED
     * (Q23: app-tokenet utløper etter 180 dager uten bruk). Gjelder ikke innlogging med feil passord (LOGIN_FAILED).
     */
    fun tokenUgyldig(status: Int): Boolean = status == 401 && (code == HOMELAB_AUTH || code == TOKEN_EXPIRED)

    /** Tokenet er utløpt (ikke bare ugyldig): «Innloggingen er utløpt. Logg inn igjen.» */
    val utlopt: Boolean get() = code == TOKEN_EXPIRED || reason == "expired"

    companion object {
        const val HOMELAB_AUTH = "HOMELAB_AUTH"
        const val TOKEN_EXPIRED = "TOKEN_EXPIRED"
        const val LOGIN_FAILED = "LOGIN_FAILED"
        const val NOT_FOUND = "NOT_FOUND"
        const val DEVICE_APPROVAL_REQUIRED = "DEVICE_APPROVAL_REQUIRED"

        /** Feilsvar fra en svartekst. Uten JSON: «Feil <status>». */
        fun fra(body: String?, status: Int): Feilsvar {
            val o: JSONObject? = runCatching { JSONObject(body ?: "") }.getOrNull()
            val error = o?.optString("error")?.takeIf { it.isNotBlank() } ?: "Feil $status"
            val code = o?.optString("code")?.takeIf { it.isNotBlank() } ?: o?.optString("kode")?.takeIf { it.isNotBlank() } ?: ""
            val reason = o?.optString("reason")?.takeIf { it.isNotBlank() }
            return Feilsvar(error, code, reason, o?.optBoolean("needsTotp") == true, o?.optBoolean("canGemini") == true, o)
        }
    }
}

/** Feil fra et HTTP-kall: [status] 0 = ingen kontakt (nettverk), ellers HTTP-status med [svar]. */
class HttpFeil(message: String, val status: Int = 0, val svar: Feilsvar? = null, cause: Throwable? = null) : IOException(message, cause)

/** Norske meldinger for nettverksfeil, som brukeren kan handle på. Samme tekster i alle appene. */
object Nettfeil {
    const val FANT_IKKE = "Fant ikke serveren. Sjekk adressen."
    const val TIDSAVBRUDD = "Serveren svarte ikke i tide."
    const val HTTPS = "HTTPS-feil. Bruk http:// på lokalt nett, eller installer sertifikatet på telefonen."
    const val GENERELL = "Nettverksfeil. Sjekk forbindelsen og prøv igjen."
    const val NETTSIDE = "Uventet svar fra serveren: fikk en nettside i stedet for data."

    /** [vert] brukes i «Fikk ikke kontakt med …». Rå unntakstekst vises aldri. */
    fun melding(e: Throwable, vert: String): String = when (e) {
        is HttpFeil -> e.message ?: GENERELL
        is UsikretHttp -> LokaltNett.MSG
        is UnknownHostException -> FANT_IKKE
        is ConnectException -> "Fikk ikke kontakt med $vert. Er du på samme nett, og stemmer http/https og port?"
        is SocketTimeoutException -> TIDSAVBRUDD
        is SSLException -> HTTPS
        else -> GENERELL
    }
}
