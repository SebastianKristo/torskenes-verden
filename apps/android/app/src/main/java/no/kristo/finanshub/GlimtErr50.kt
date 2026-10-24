package no.kristo.finanshub

import android.util.Log

/*
 * Prompt 50 (ANDROID50B, claude-code-kvittering-les-pa-nytt-502.md): feilmeldinger brukeren kan handle på i stedet for
 * «Feil 502 (HTTP 502)» når Glimt leser en kvittering på nytt.
 *  - 502/504/tidsavbrudd → «Glimt brukte for lang tid på bildet …» + «Les mindre versjon» (kind = SLOW).
 *  - 503 eller kode «modell_utilgjengelig» → «Glimt er ikke tilgjengelig akkurat nå …».
 *  - 404 med kode for manglende bilde (bilde_mangler/image_missing) → «Originalbildet finnes ikke lenger …».
 *  - Kodene fra serveren (SRVCHAT50, server/finans/reread50.js KODER50): bilde_mangler 404 · modell_utilgjengelig 503 ·
 *    tidsavbrudd 504 · ulesbar 422 · gemini_mangler 400 · opptatt 409 · ukjent 500. Både «kode» og «code» leses.
 *  - Annet → «Noe gikk galt (kode X).» Hele svaret (status, kode og melding – aldri nøkler) logges med Log.w.
 * «Les mindre versjon» sender {small:true} (+ maxSide) til samme endepunkt (serveren nedskalerer til 1280 px før modellen).
 */

enum class GlimtErrKind50 { SLOW, MODEL, MISSING, OLD_SERVER, OTHER }

data class GlimtErr50(val text: String, val kind: GlimtErrKind50)

private val MISSING_CODES50 = setOf("bilde_mangler", "image_missing", "bilde_finnes_ikke", "original_mangler", "no_image")

/** Tolker status, kode og melding fra serveren (eller proxyen). */
fun glimtErr50(status: Int, code: String?, msg: String?, where: String = "reread"): GlimtErr50 {
    val m = msg.orEmpty()
    val c = code?.lowercase()
    runCatching { Log.w("Glimt50", "$where feilet: status=$status kode=${c ?: "-"} melding=${m.take(300)}") }
    val slow = status == 502 || status == 504 || c == "tidsavbrudd" || c == "timeout" ||
        (status == 0 && (m.contains("i tide") || m.contains("timeout", true) || m.contains("timed out", true)))
    val missing = c in MISSING_CODES50 || (status == 404 && (m.contains("bilde", true) || m.contains("image", true)))
    return when {
        c == "gemini_mangler" -> GlimtErr50("Legg inn en Gemini-nøkkel under Innstillinger → AI-motor for å analysere på nytt.", GlimtErrKind50.OTHER)
        c == "opptatt" -> GlimtErr50("Kvitteringen leses allerede.", GlimtErrKind50.OTHER)
        c == "ulesbar" -> GlimtErr50("Glimt fikk ikke lest kvitteringen. Prøv igjen, eller les en mindre versjon.", GlimtErrKind50.SLOW)
        c == "modell_utilgjengelig" || m.contains("modell_utilgjengelig") || status == 503 ->
            GlimtErr50("Glimt er ikke tilgjengelig akkurat nå. Prøv igjen om litt.", GlimtErrKind50.MODEL)
        missing -> GlimtErr50("Originalbildet finnes ikke lenger. Last opp kvitteringen på nytt.", GlimtErrKind50.MISSING)
        slow -> GlimtErr50("Glimt brukte for lang tid på bildet. Prøv igjen, eller les en mindre versjon.", GlimtErrKind50.SLOW)
        status == 404 -> GlimtErr50("Serveren kan ikke lese kvitteringen på nytt ennå. Oppdater Homelab.", GlimtErrKind50.OLD_SERVER)
        status == 0 && m.isNotBlank() -> GlimtErr50(m, GlimtErrKind50.OTHER) // nettverksfeil fra Api.net (allerede forklart)
        else -> GlimtErr50("Noe gikk galt (kode ${c ?: status}).", GlimtErrKind50.OTHER)
    }
}

fun glimtErr50(e: ApiException, where: String = "reread"): GlimtErr50 = glimtErr50(e.status, e.code, e.message, where)

/** Feil fra en jobb (GET /jobs/:id → {error, code|kode, status}). */
fun glimtJobErr50(j: org.json.JSONObject): GlimtErr50 {
    val code = j.optString("code").ifBlank { j.optString("kode") }.ifBlank { null }
    val msg = j.optString("error").ifBlank { j.optString("melding") }.ifBlank { j.optString("msg") }.ifBlank { null }
    val http = j.optInt("httpStatus", j.optInt("statusCode", 0))
    if (code == null && msg == null && http == 0) return GlimtErr50("Glimt fikk ikke lest kvitteringen", GlimtErrKind50.OTHER)
    // Jobben kan ha en vanlig forklaring uten kode; den vises som den er.
    if (code == null && http == 0 && msg != null && !Regex("""\b50[234]\b""").containsMatchIn(msg)) return GlimtErr50(msg, GlimtErrKind50.OTHER)
    val st = if (http != 0) http else Regex("""\b(50[234]|404)\b""").find(msg.orEmpty())?.value?.toIntOrNull() ?: 0
    return glimtErr50(st, code, msg, "jobb")
}
