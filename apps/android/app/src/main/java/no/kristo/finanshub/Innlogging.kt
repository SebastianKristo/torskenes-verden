package no.kristo.finanshub

import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import org.json.JSONObject

data class QrAsk38(val sid: String, val device: String, val place: String, val account: String, val match: String)

data class QrResult38(val title: String, val text: String, val ok: Boolean)

/* ======================= QR-innlogging ======================= */

private val QR_CODE38 = Regex("^[A-Za-z0-9_-]{4,}\\.[A-Za-z0-9_-]{4,}$")

/** «homelab://login?c=a.b», «https://vert/l/a.b», «…?c=a.b» eller bare «a.b» → «a.b». */
fun qrCodeOf38(raw: String): String? {
    val t = raw.trim()
    if (t.isEmpty()) return null
    if (QR_CODE38.matches(t)) return t
    val u = runCatching { Uri.parse(t) }.getOrNull() ?: return null
    // Prompt 46: papir://login?s=<sessionId>&c=<engangskode>&srv=<offentlig server-URL> → «s.c».
    val s46 = runCatching { u.getQueryParameter("s") }.getOrNull()?.trim()
    val c46 = runCatching { u.getQueryParameter("c") }.getOrNull()?.trim()
    if (!s46.isNullOrBlank() && !c46.isNullOrBlank() && QR_CODE38.matches("$s46.$c46")) return "$s46.$c46"
    runCatching { u.getQueryParameter("c") }.getOrNull()?.trim()?.takeIf { QR_CODE38.matches(it) }?.let { return it }
    val segs = u.pathSegments ?: emptyList()
    val i = segs.indexOf("l")
    if (i >= 0 && i + 1 < segs.size && QR_CODE38.matches(segs[i + 1])) return segs[i + 1]
    return null
}

/** Deep link fra systemkameraet eller en annen app. true = håndtert her. */
fun AppViewModel.qrLink38(uri: Uri): Boolean {
    val isLogin = (uri.scheme == "homelab" && uri.host == "login") || (uri.scheme == "https" && uri.pathSegments?.firstOrNull() == "l") ||
        (uri.scheme == "finanshub" && uri.host == "login") || (uri.scheme == "papir" && uri.host == "login") // prompt 46
    if (!isLogin) return false
    val code = qrCodeOf38(uri.toString())
    if (code == null) { message = "Ugyldig innloggingskode"; return true }
    // Prompt 46: koden gjelder en bestemt server (srv). Er den en annen enn den mobilen er logget inn på, sier vi fra i stedet for å sende den.
    val srv = runCatching { uri.getQueryParameter("srv") }.getOrNull()?.let { Api.normalizeServer(it) }
    if (loggedIn && srv != null && srv.isNotBlank() && !qrSameServer46(srv)) { message = "QR-koden er for ${srv.substringAfter("://")}, men du er logget inn på ${base.substringAfter("://")}"; return true }
    if (!loggedIn) { p38.qrPending = code; message = "Logg inn på mobilen først, så godkjenner du den nye enheten"; return true }
    scanQr38(code)
    return true
}

fun AppViewModel.openQr38() {
    Haptics.tap()
    val s = p38
    s.qrOpen = true
    s.qrErr = null
    s.qrResult = null
    s.qrCode = ""
}

private fun qrError38(e: Exception): String = when {
    e is ApiException && (e.status == 404 || e.status == 405) -> "Serveren har ikke QR-innlogging ennå. Oppdater Homelab-serveren."
    e is ApiException && (e.status == 410 || e.status == 409) -> "Koden er utløpt eller brukt. Vis en ny kode på den nye enheten."
    e is ApiException && e.status == 429 -> "For mange forsøk. Vent litt og prøv igjen."
    e is ApiException && (e.status == 401 || e.status == 403) -> "Mobilen må være logget inn for å godkjenne."
    e is ApiException && e.status == 400 -> e.message?.takeIf { it.isNotBlank() } ?: "Ugyldig kode"
    else -> e.message ?: "Fikk ikke kontakt med serveren"
}

/** Skannet/limt inn kode → enhetsinfo og matchkode (godkjenn-arket). */
fun AppViewModel.scanQr38(code: String) {
    val s = p38
    if (s.qrBusy) return
    s.qrBusy = true
    s.qrErr = null
    s.qrResult = null
    launch38 {
        try {
            val raw = api38 { hlPost("/auth/qr/scan", JSONObject().put("code", code)) }
            val o = JSONObject(raw)
            val d = o.optJSONObject("device")
            val dev = listOfNotNull(d?.s37("name"), listOfNotNull(d?.s37("os"), d?.s37("browser")).joinToString(" · ").takeIf { it.isNotBlank() })
                .distinct().joinToString(" · ").ifBlank { o.s37("device") ?: "Ny enhet" }
            val place = listOfNotNull(d?.s37("place"), d?.s37("ip")).joinToString(" · ").ifBlank { "Ukjent sted" }
            val acct = o.optJSONObject("account")?.let { it.s37("name") ?: it.s37("username") } ?: o.s37("account") ?: displayName
            val match = o.s37("match") ?: ""
            val sid = o.s37("sid") ?: code.substringBefore('.')
            s.qrAsk = QrAsk38(sid, dev, place, acct, match)
            s.qrOpen = false
            Haptics.select()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.qrErr = qrError38(e)
            s.qrOpen = true
            Haptics.error()
        } finally { s.qrBusy = false }
    }
}

/** Godkjenn (etter fingeravtrykk/ansikt) eller avvis. */
fun AppViewModel.answerQr38(approve: Boolean) {
    val s = p38
    val a = s.qrAsk ?: return
    if (s.qrBusy) return
    s.qrBusy = true
    launch38 {
        try {
            val body = JSONObject().put("sid", a.sid).put("approve", approve).put("biometric", approve)
            if (a.match.isNotBlank()) body.put("match", a.match)
            val raw = api38 { hlPost("/auth/qr/approve", body) }
            val o = runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject()
            s.qrAsk = null
            if (!approve) {
                s.qrResult = QrResult38("Avvist", "Innloggingen ble avvist. Den nye enheten får en ny kode.", false)
                Haptics.dismiss()
            } else {
                val two = o.b37("needs2fa") ?: (me?.totp == true)
                s.qrResult = if (two) QrResult38("Godkjent", "Skriv koden fra autentiseringsappen på den nye enheten for å fullføre.", true)
                else QrResult38("Logget inn", "${a.device} er logget inn som ${a.account} og lagt til under Pålitelige enheter.", true)
                Haptics.success()
            }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.qrAsk = null
            s.qrResult = QrResult38("Ikke godkjent", qrError38(e), false)
            Haptics.error()
        } finally { s.qrBusy = false }
    }
}

/** Etter innlogging: en kode fra en deep link som kom før, åpnes nå. */
fun AppViewModel.qrAfterLogin38() {
    val c = p38.qrPending ?: return
    p38.qrPending = null
    if (loggedIn) scanQr38(c)
}

data class AppAuth41(val client: String, val redirect: String, val state: String, val cc: String, val ccMethod: String, val appName: String)

/* ======================= Kalender-innlogging: Homelab godkjenner ======================= */

/** homelab://app-auth?client=kalender&redirect=kalender://auth&state&cc og https://<vert>/app-auth?… */
fun AppViewModel.appAuthLink41(uri: Uri): Boolean {
    val isAuth = (uri.scheme == "homelab" && uri.host == "app-auth") ||
        (uri.scheme == "https" && uri.pathSegments?.firstOrNull() == "app-auth") ||
        (uri.scheme == "finanshub" && uri.host == "app-auth")
    if (!isAuth) return false
    val client = uri.getQueryParameter("client")?.trim().orEmpty().ifBlank { "kalender" }
    val redirect = uri.getQueryParameter("redirect")?.trim().orEmpty()
    val state = uri.getQueryParameter("state")?.trim().orEmpty()
    val cc = (uri.getQueryParameter("cc") ?: uri.getQueryParameter("code_challenge"))?.trim().orEmpty()
    val method = uri.getQueryParameter("ccm") ?: uri.getQueryParameter("code_challenge_method") ?: "S256"
    if (!redirectOk41(redirect) || state.length < 8 || cc.length < 20) {
        message = "Ugyldig innloggingslenke fra ${appName41(client)}"
        if (redirectOk41(redirect) && state.isNotBlank()) backToApp41(redirect, "error" to "invalid_request", "state" to state)
        return true
    }
    val a = AppAuth41(client, redirect, state, cc, method, appName41(client))
    p41.appAuthErr = null
    if (!loggedIn) { p41.appAuthPending = a; message = "Logg inn i Homelab først, så godkjenner du ${a.appName}"; return true }
    p41.appAuth = a
    return true
}

private fun appName41(client: String) = when (client) { "kalender" -> "Kalender"; else -> client.replaceFirstChar { it.uppercase() } }

/** Bare hvitelistede retur-adresser: kalender://auth og https://<vår vert>/… */
fun AppViewModel.redirectOk41(r: String): Boolean {
    if (r == "kalender://auth" || r.startsWith("kalender://auth?")) return true
    val u = runCatching { Uri.parse(r) }.getOrNull() ?: return false
    if (u.scheme != "https") return false
    val hosts = (listOf(DEFAULT_SERVER41) + listOfNotNull(account?.server, account?.external)).mapNotNull { runCatching { Uri.parse(it).host }.getOrNull() }
    return u.host != null && u.host in hosts
}

private fun AppViewModel.backToApp41(redirect: String, vararg q: Pair<String, String>) {
    val b = Uri.parse(redirect).buildUpon()
    q.forEach { (k, v) -> b.appendQueryParameter(k, v) }
    val i = Intent(Intent.ACTION_VIEW, b.build()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (redirect.startsWith("kalender:")) i.setPackage(KalenderApp33.PKG)
    runCatching { appCtx40.startActivity(i) }.onFailure { if (redirect.startsWith("kalender:")) runCatching { appCtx40.startActivity(i.setPackage(null)) } }
}

/** Godkjent (etter fingeravtrykk): engangskode (≤ 60 s, bundet til PKCE og redirect) → tilbake til appen. */
fun AppViewModel.approveAppAuth41() {
    val s = p41
    val a = s.appAuth ?: return
    if (s.appAuthBusy) return
    s.appAuthBusy = true; s.appAuthErr = null
    launch41 {
        try {
            val body = JSONObject().put("client", a.client).put("redirect", a.redirect).put("state", a.state).put("code_challenge", a.cc).put("code_challenge_method", a.ccMethod)
            val o = JSONObject(api41 { hlPost("/auth/app-code", body) })
            val code = o.s37("code") ?: throw ApiException("Serveren ga ingen kode", 502)
            s.appAuth = null
            Haptics.success()
            backToApp41(a.redirect, "code" to code, "state" to a.state)
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.appAuthErr = when (e.status) {
                404, 405 -> "Serveren har ikke app-innlogging ennå. Oppdater Homelab-serveren."
                400 -> e.message ?: "Ugyldig forespørsel"
                401, 403 -> "Homelab-appen må være logget inn for å godkjenne."
                else -> "Serverfeil ${e.status}. Prøv igjen."
            }
            Haptics.error()
        } catch (e: Exception) { s.appAuthErr = uiErr73(e, "Fikk ikke kontakt med serveren"); Haptics.error() } finally { s.appAuthBusy = false }
    }
}

fun AppViewModel.rejectAppAuth41() {
    val a = p41.appAuth ?: return
    p41.appAuth = null
    backToApp41(a.redirect, "error" to "access_denied", "state" to a.state)
}

/** Etter innlogging: en ventende app-innlogging (lenken kom før man var logget inn). */
fun AppViewModel.appAuthAfterLogin41() {
    val a = p41.appAuthPending ?: return
    if (!loggedIn) return
    p41.appAuthPending = null
    p41.appAuth = a
}

/* ======================= Tilstand ======================= */

data class QrShow46(val sid: String, val payload: String, val key: String?, val expiresAt: Long, val state: String, val match: String?, val who: String?)

class P46State {
    /* Media */
    var mediaDetails by mutableStateOf(false)
    var mediaCheckSeq by mutableIntStateOf(0)
    internal var mediaChecking = false
    /** «route» (serveren mangler ruten), «token» (utlogget), «upstream» (Sonarr/Radarr avviser nøkkelen) – for «Vis detaljer». */
    var mediaKind by mutableStateOf<String?>(null)
    var mediaWhen by mutableStateOf<String?>(null)

    /* Gjøremål */
    var doneAnim by mutableStateOf<String?>(null)
    var askSubs by mutableStateOf<String?>(null)
    var taskToast by mutableStateOf<TaskToast46?>(null)
    internal var toastJob: Job? = null

    /* Vær: Min posisjon */
    var wxGps by mutableStateOf<Boolean?>(null)
    var gpsName by mutableStateOf<String?>(null)
    var gpsState by mutableStateOf("idle") // idle · loading · denied · error · ok
    internal var gpsAt = 0L
    internal var gpsFix: Pair<Double, Double>? = null

    /* Oppdatering av serveren: watchdog */
    var updStuck by mutableStateOf(false)
    internal var updSig = ""
    internal var updSigAt = 0L
    var updBusy by mutableStateOf(false)

    /* Hjem-overgang på brett */
    internal var homeFromRail = false

    /* QR-innlogging */
    var qrShow by mutableStateOf<QrShow46?>(null)
    var qrShowOpen by mutableStateOf(false)
    var qrShowErr by mutableStateOf<String?>(null)
    internal var qrJob: Job? = null
    var qrSrv by mutableStateOf("")
    var scanOpen by mutableStateOf(false)

    /* Kart (Kart46.kt) */
    val kart = Kart46State()

    /* Nyheter, Google Photos-bakgrunn og Subscription-logg (P46b.kt) */
    val news = News46State()
    val subLog = SubLog46State()
    var gp by mutableStateOf<Gphoto46?>(null)
    var gpErr by mutableStateOf<String?>(null)
    var gpBusy by mutableStateOf(false)
    var gpSheet by mutableStateOf(false)
    internal var gpJob: Job? = null
}
