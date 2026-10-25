package no.kristo.finanshub

import android.net.Uri
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

/*
 * Prompt 51 (ANDFEAT51): onboarding for nye familiemedlemmer – WEBX51 `/api/onboard51` ($S/SERVER51-API.md §2).
 *  - Innloggingen: «Jeg har en invitasjon» → skann QR-en (Google Code Scanner, som QR-innloggingen) eller lim inn lenken.
 *    QR/lenke inneholder bare invitasjons-id + engangskode + offentlig server-URL – aldri et token.
 *  - preview viser hvem som inviterte og hva som foreslås delt; den nye personen velger navn, brukernavn, passord (≥ 8) og deling
 *    (posisjon, helse, kalender), og accept (client:'app') gir et vanlig app-token. Kontoen legges til som ved QR-innlogging.
 *  - Dyplenker: papir://join?i=<id>&c=<kode>&srv=<server> og https://<server>/join/<id>.<kode> (AndroidManifest).
 *  Ferdig på ett minutt: tre steg (Skann → Om deg → Deling) og ferdig.
 */

object Join51 {
    var open by mutableStateOf(false)
    /** "scan" | "about" | "share" */
    var step by mutableStateOf("scan")
    var busy by mutableStateOf(false)
    var err by mutableStateOf<String?>(null)
    var link by mutableStateOf("")
    var server by mutableStateOf("")
    var preview by mutableStateOf<JSONObject?>(null)
    var name by mutableStateOf("")
    var username by mutableStateOf("")
    var password by mutableStateOf("")
    var password2 by mutableStateOf("")
    var shareLocation by mutableStateOf(true)
    var shareHealth by mutableStateOf(false)
    var shareCalendar by mutableStateOf(true)
    internal val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    fun reset() {
        step = "scan"; busy = false; err = null; link = ""; server = ""; preview = null
        name = ""; username = ""; password = ""; password2 = ""; shareLocation = true; shareHealth = false; shareCalendar = true
    }
}

/** Serveren fra lenken: srv-parameteren (papir://join) eller verten (https://…/join/…). */
internal fun joinServer51(raw: String): String? {
    val u = runCatching { Uri.parse(raw.trim()) }.getOrNull() ?: return null
    return when {
        u.scheme == "papir" && u.host == "join" -> u.getQueryParameter("srv")?.let { Api.normalizeServer(it) }
        (u.scheme == "https" || u.scheme == "http") && u.pathSegments?.firstOrNull() == "join" -> "${u.scheme}://${u.authority}"
        else -> null
    }?.takeIf { it.isNotBlank() }
}

internal fun isJoin51(raw: String): Boolean = joinServer51(raw) != null

/** Dyplenke fra systemkameraet / nettleseren. Returnerer true når lenken var en invitasjon. */
fun AppViewModel.joinLink51(uri: Uri): Boolean {
    val s = uri.toString()
    if (!isJoin51(s)) return false
    if (loggedIn && !addingAccount) { message = "Invitasjonen er for en ny person. Logg ut eller legg til konto for å bruke den." ; return true }
    Join51.reset()
    Join51.open = true
    previewJoin51(s)
    return true
}

private fun errText51(e: Exception): String = when {
    e is ApiException && e.status == 429 -> "For mange forsøk. Vent litt og prøv igjen."
    e is ApiException && e.code == "expired" -> "Invitasjonen er utløpt. Be om en ny."
    e is ApiException && e.code == "used" -> "Invitasjonen er allerede brukt."
    e is ApiException && e.code == "revoked" -> "Invitasjonen er trukket tilbake."
    e is ApiException && (e.status == 404 || e.code == "invalid") -> "Fant ikke invitasjonen. Sjekk lenken, eller be om en ny."
    e is ApiException && e.status == 409 -> "Brukernavnet er tatt. Velg et annet."
    else -> e.message ?: "Noe gikk galt"
}

/** Steg 1: sjekk invitasjonen (uinnlogget). */
fun AppViewModel.previewJoin51(raw: String) {
    val srv = joinServer51(raw)
    if (srv == null) { Join51.err = "Det er ikke en invitasjon. Skann QR-koden fra den som inviterte deg, eller lim inn lenken."; return }
    Join51.busy = true; Join51.err = null; Join51.link = raw.trim(); Join51.server = srv
    Join51.scope.launch {
        try {
            val o = JSONObject(Api(srv, null).request("POST", "/onboard51/preview", JSONObject().put("link", raw.trim()), prefix = Api.HOMELAB))
            Join51.preview = o
            Join51.name = o.optString("name").takeIf { it.isNotBlank() && it != "null" } ?: ""
            Join51.username = o.optString("usernameSuggestion").takeIf { it.isNotBlank() && it != "null" } ?: ""
            o.optJSONObject("share")?.let { s ->
                Join51.shareLocation = s.optBoolean("location", true); Join51.shareHealth = s.optBoolean("health", false); Join51.shareCalendar = s.optBoolean("calendar", true)
            }
            Join51.step = "about"
        } catch (e: Exception) { Join51.err = errText51(e) } finally { Join51.busy = false }
    }
}

/** Siste steg: lag kontoen og logg inn (app-token). */
fun AppViewModel.acceptJoin51() {
    val j = Join51
    if (j.busy) return
    val user = j.username.trim()
    if (j.name.isBlank() || !Regex("^[A-Za-z0-9._-]{2,40}$").matches(user)) { j.err = "Skriv navnet ditt og et brukernavn (bokstaver, tall, punktum eller bindestrek)."; j.step = "about"; return }
    if (j.password.length < 8) { j.err = "Passordet må ha minst 8 tegn."; j.step = "about"; return }
    if (j.password != j.password2) { j.err = "Passordene er ikke like."; j.step = "about"; return }
    j.busy = true; j.err = null
    val body = JSONObject().put("link", j.link).put("username", user).put("password", j.password).put("name", j.name.trim())
        .put("share", JSONObject().put("location", j.shareLocation).put("health", j.shareHealth && j.shareLocation).put("calendar", j.shareCalendar))
        .put("client", "app").put("platform", "android").put("device", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
    j.scope.launch {
        try {
            val o = JSONObject(Api(j.server, null).request("POST", "/onboard51/accept", body, prefix = Api.HOMELAB, read = 30_000))
            val token = o.optString("token").takeIf { it.isNotBlank() } ?: throw ApiException("Serveren ga ingen innlogging")
            val u = o.optJSONObject("user")
            j.password = ""; j.password2 = ""
            j.open = false
            addAccount51(j.server, LoginResult(token, u?.optString("username")?.ifBlank { null } ?: user, u?.optString("name")?.ifBlank { null } ?: j.name.trim(), u?.optString("role")?.ifBlank { null } ?: "bruker"))
        } catch (e: Exception) { j.err = errText51(e) } finally { j.busy = false }
    }
}
