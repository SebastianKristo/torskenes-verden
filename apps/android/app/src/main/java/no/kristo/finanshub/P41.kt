package no.kristo.finanshub

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId

/*
 * Prompt 41 (ANDROID41) – design_handoff_homelab/prompts/prompt-41-pakke/:
 *  - Fold 1c (stort Glimt-kort + faner Nå · I dag · Hjemme · Økonomi, papir_fold_tab) og rød Hjem-knapp i fane-form (ui/Fold41.kt, ui/P25Ui.kt).
 *  - «Skanneknapp på Hjem» (papir_scan_home): Innstillinger → Tilpass → Fanelinje og «Rediger fanelinjen».
 *  - Innlogging uten serverfelt (https://home.kristo.no som standard) og Innstillinger → Konto → SERVER (GET/PUT /api/me/server,
 *    GET /api/discovery): lokal, ekstern, «Bytt automatisk» (lokal når den svarer < 300 ms).
 *  - Kalender-innlogging, Homelab-siden: homelab://app-auth og https://<vert>/app-auth (godkjenningsark med fingeravtrykk →
 *    POST /api/auth/app-code {client, redirect, state, code_challenge} → kalender://auth?code&state). «Fortsett som» via
 *    KalenderLoginProvider33 (signature) med de nye metodene «continue41» og «exchange41» (POST /api/auth/device-exchange).
 *  - Bakgrunn «Oslo»: frie Wikimedia Commons-bilder per tid på døgnet, nytt bilde hver hele time, kreditering i Tilpass → Bakgrunn.
 *  - Chat: «Mine data» på som standard, «✦ Auto» øverst og som standard (én gangs flytting).
 *  - Hjemlys «Si fra»: Sjekket inn · Drar snart · Drar nå (POST /api/hjemlys/notice), sted valgfritt, mottakere fritt (aldri deg selv).
 *  - Min reise (GET /api/ruter/my-trip, GET /api/ruter/journey): kort på Ruter-siden og på Hjem bare når «forlot skolen» er aktiv,
 *    sveip bort per tur (papir_rt_hide = left_school_at) med Angre.
 *  - Gjøremål: Glimt deler opp lange beskjeder i bakgrunnen (POST /api/tasks/glimt {q, async:true} → {jobId, placeholder}).
 *  - AI-kontroll → Jobber: klokkeslett (startet / lagt i kø / ferdig + «… siden»).
 * Alle nye endepunkter tåler 404 (eldre server): da skjules valget eller det brukes en lokal reserve.
 */

class P41State {
    /* Fanelinja og Fold */
    var scanHome by mutableStateOf(true)
    var foldTab by mutableStateOf("na")
    internal var loaded = false

    /* Server (Konto → SERVER) */
    var srv by mutableStateOf<Srv41?>(null)
    var srvMissing by mutableStateOf(false)
    var srvSheet by mutableStateOf<String?>(null) // "local" | "external"
    var srvTest by mutableStateOf<String?>(null)
    var srvTestOk by mutableStateOf(false)
    var srvBusy by mutableStateOf(false)
    var loginNoContact by mutableStateOf(false)

    /* Kalender-innlogging (Homelab godkjenner) */
    var appAuth by mutableStateOf<AppAuth41?>(null)
    var appAuthBusy by mutableStateOf(false)
    var appAuthErr by mutableStateOf<String?>(null)
    internal var appAuthPending: AppAuth41? = null

    /* Bakgrunn Oslo */
    internal var osloKey: String? = null
    var osloFile by mutableStateOf<String?>(null)
    var osloCredit by mutableStateOf<Credit41?>(null)

    /* Hjemlys «Si fra» */
    var sfKind by mutableStateOf<String?>(null)
    var sfBusy by mutableStateOf(false)
    var sfSent by mutableStateOf<String?>(null)
    var sfErr by mutableStateOf<String?>(null)
    var sfNoticeId by mutableStateOf<String?>(null)
    var sfPeople by mutableStateOf<List<Pair<String, String>>?>(null)
    var sfLast by mutableStateOf<Map<String, Set<String>>>(emptyMap())

    /* Min reise */
    var trip by mutableStateOf<Trip41?>(null)
    var tripDir by mutableStateOf("auto")
    var tripMissing by mutableStateOf(false)
    var tripBusy by mutableStateOf(false)
    var tripOpen by mutableStateOf<Int?>(null)
    var journey by mutableStateOf<Journey41?>(null)
    var homeCard by mutableStateOf("over")
    var rtHide by mutableStateOf<String?>(null)
    var rtToast by mutableStateOf(false)
    internal var tripAt = 0L

    /* Gjøremål-Glimt i bakgrunnen */
    var glimtJobs by mutableStateOf<List<GJob41>>(emptyList())
    var glimtDone by mutableStateOf<String?>(null)
}

data class Srv41(val local: String, val external: String, val auto: Boolean)
data class AppAuth41(val client: String, val redirect: String, val state: String, val cc: String, val ccMethod: String, val appName: String)
data class Credit41(val author: String?, val license: String?, val file: String)
data class Leg41(val mode: String, val line: String?, val from: String?, val to: String?, val dep: String?, val arr: String?, val delayMin: Int, val walkMin: Int?, val meters: Int?, val label: String? = null)
data class TripOpt41(val legs: List<Leg41>, val dep: String?, val arr: String?, val minutes: Int?, val preferred: Boolean, val badges: List<String>)
data class TripAlert41(val text: String, val walkMin: Int?, val km: Double?, val catches: String?, val homeAt: String?, val body: String? = null)
data class Trip41(val dir: String, val from: String, val to: String, val options: List<TripOpt41>, val alert: TripAlert41?, val updatedAt: String?)
data class Journey41(val leftAt: String, val expiresAt: String?)
data class GJob41(val id: String, val text: String, val at: Long)

/* ======================= Felles ======================= */

private fun AppViewModel.prefs41() = appCtx40.getSharedPreferences("p41", Context.MODE_PRIVATE)

/** Lokale valg (per enhet). Kalles én gang fra Global41. */
fun AppViewModel.initP41() {
    val s = p41
    if (s.loaded) return
    s.loaded = true
    val sp = prefs41()
    s.scanHome = sp.getBoolean("papir_scan_home", true)
    s.foldTab = sp.getString("papir_fold_tab", "na")?.takeIf { it in FOLD_TABS41.map { t -> t.first } } ?: "na"
    s.rtHide = sp.getString("papir_rt_hide", null)
    s.homeCard = sp.getString("rt_home_card", "over") ?: "over"
}

fun AppViewModel.setScanHome41(on: Boolean) { p41.scanHome = on; Haptics.select(); prefs41().edit().putBoolean("papir_scan_home", on).apply() }
fun AppViewModel.setFoldTab41(k: String) { p41.foldTab = k; Haptics.select(); prefs41().edit().putString("papir_fold_tab", k).apply() }

/** Hjem på Fold (1c): fanene og kortene i hver fane (standard fra fasiten, nøklene i HOME_SECS). */
val FOLD_TABS41: List<Pair<String, String>> = listOf("na" to "Nå", "idag" to "I dag", "hjemme" to "Hjemme", "okonomi" to "Økonomi")
fun foldKeys41(tab: String): List<String> = when (tab) {
    "idag" -> listOf("h10", "h9", "h11", "h8", "h13")
    "hjemme" -> listOf("h7", "h2", "h4", "h6")
    "okonomi" -> listOf("hm", "h11", "h2")
    else -> listOf("h3", "h8", "h6", "h40", "h5")
}

private fun clock41(iso: String?): String? = iso?.let { s ->
    runCatching { OffsetDateTime.parse(s).atZoneSameInstant(ZoneId.systemDefault()) }.getOrNull()
        ?: runCatching { Instant.parse(s).atZone(ZoneId.systemDefault()) }.getOrNull()
}?.let { "%02d:%02d".format(it.hour, it.minute) } ?: iso?.takeIf { Regex("^\\d{1,2}:\\d{2}$").matches(it) }

fun hm41(iso: String?): String = clock41(iso) ?: ""

internal fun epoch41(v: String?): Long? {
    if (v.isNullOrBlank()) return null
    v.toLongOrNull()?.let { return if (it < 100_000_000_000L) it * 1000 else it }
    runCatching { return OffsetDateTime.parse(v).toInstant().toEpochMilli() }
    runCatching { return Instant.parse(v).toEpochMilli() }
    runCatching { return java.time.LocalDateTime.parse(v.replace(' ', 'T').removeSuffix("Z")).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }
    return null
}

/* ======================= AI-jobber: klokkeslett ======================= */

/** Tidskolonnen i Jobber: (klokkeslett, «… siden»). Kjører: «startet 17:31»; i kø: «lagt i kø 17:33»; ferdig/feilet: «17:29» + «4 min siden». */
fun jobTime41(j: AiJob34, now: Long = System.currentTimeMillis()): Pair<String, String?>? {
    j.timeLabel?.takeIf { it.isNotBlank() }?.let { return it to null }
    fun fmt(ms: Long): String {
        val z = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault())
        val d = z.toLocalDate()
        val t = "%02d:%02d".format(z.hour, z.minute)
        val today = LocalDate.now()
        return when (d) { today -> t; today.minusDays(1) -> "i går $t"; else -> "%02d.%02d %s".format(d.dayOfMonth, d.monthValue, t) }
    }
    return when (j.st) {
        "run" -> epoch41(j.startedAt ?: j.createdAt)?.let { "startet " + fmt(it) to null }
        "queue" -> epoch41(j.createdAt)?.let { "lagt i kø " + fmt(it) to null } ?: j.whenT?.let { it to null }
        else -> epoch41(j.endedAt ?: j.startedAt ?: j.createdAt)?.let { ms ->
            val m = ((now - ms) / 60_000L).coerceAtLeast(0)
            fmt(ms) to when { m < 1 -> "nå nettopp"; m < 60 -> "$m min siden"; m < 24 * 60 -> "${m / 60} t siden"; else -> null }
        }
    }
}

/* ======================= Server: lokal og ekstern adresse ======================= */

const val DEFAULT_SERVER41 = "https://home.kristo.no"

fun AppViewModel.loadServer41() {
    val s = p41
    launch41 {
        val a = account ?: return@launch41
        val raw = try { api41 { hlGet("/me/server", timeout = 6_000) } } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) s.srvMissing = true; null
        } catch (_: Exception) { null }
        val o = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
        val local = o?.s37("local") ?: a.local
        val ext = o?.s37("external") ?: a.external.ifBlank { a.server }
        val auto = o?.let { if (it.has("auto")) it.optBoolean("auto", true) else null } ?: flag(AppPrefs.USE_LOCAL, true)
        s.srv = Srv41(local, ext, auto)
        // Mangler lokal adresse: hent den fra /api/discovery (uinnlogget, ingen hemmeligheter).
        if (local.isBlank()) discovery41()?.let { (l, x) ->
            if (l.isNotBlank()) { s.srv = Srv41(l, ext.ifBlank { x }, auto); updateAddresses(l, a.external.ifBlank { x }) }
        }
    }
}

/** GET /api/discovery → (første lokale adresse, ekstern). null = eldre server. */
suspend fun AppViewModel.discovery41(): Pair<String, String>? = runCatching {
    val o = JSONObject(api41 { hlGet("/discovery", timeout = 5_000) })
    val loc = o.optJSONArray("local")?.let { a -> (0 until a.length()).map { a.optString(it) }.firstOrNull { it.startsWith("http") } } ?: o.s37("local") ?: ""
    loc to (o.s37("external") ?: "")
}.getOrNull()

fun validUrl41(u: String): Boolean = Regex("^https?://[^\\s/]+(:\\d+)?(/.*)?$").matches(u.trim())

/** «Test»: «✓ Homelab svarer på … · 12 ms» eller en feilmelding. */
fun AppViewModel.testServer41(url: String) {
    val s = p41
    val u = url.trim()
    if (!validUrl41(u)) { s.srvTest = "Adressen må starte med http:// eller https://"; s.srvTestOk = false; return }
    s.srvBusy = true; s.srvTest = null
    launch41 {
        val t0 = System.currentTimeMillis()
        val ok = try { Api(u, account?.token).request("GET", "/discovery", prefix = Api.HOMELAB, timeout = 4_000, read = 4_000); true } catch (e: ApiException) {
            e.status in 200..499 // svarer, men uten /discovery (eldre server) eller krever innlogging
        } catch (_: Exception) { false }
        val ms = System.currentTimeMillis() - t0
        s.srvTestOk = ok
        s.srvTest = if (ok) "✓ Homelab svarer på ${u.substringAfter("://").trimEnd('/')} · $ms ms" else "Fikk ikke kontakt med ${u.substringAfter("://").trimEnd('/')}"
        s.srvBusy = false
    }
}

/** Lagrer på serveren (PUT /api/me/server, synkes til Kalender og andre enheter) og lokalt på kontoen. */
fun AppViewModel.saveServer41(local: String, external: String, auto: Boolean) {
    val s = p41
    val l = local.trim(); val x = external.trim()
    if ((l.isNotEmpty() && !validUrl41(l)) || (x.isNotEmpty() && !validUrl41(x))) { s.srvTest = "Adressen må starte med http:// eller https://"; s.srvTestOk = false; return }
    s.srv = Srv41(l, x, auto)
    s.srvSheet = null; s.srvTest = null
    setPref(AppPrefs.USE_LOCAL, auto)
    launch41 {
        runCatching { api41 { hlPut("/me/server", JSONObject().put("local", l).put("external", x).put("auto", auto)) } }
        updateAddresses(l, x)
        message = "Serveradressen er lagret"
    }
}

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
        } catch (e: Exception) { s.appAuthErr = e.message ?: "Fikk ikke kontakt med serveren"; Haptics.error() } finally { s.appAuthBusy = false }
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

/* ======================= Bakgrunn «Oslo» ======================= */

/** Frie Wikimedia Commons-bilder (Getty krever kjøpt lisens), samme liste som web/iOS. */
val OSLO41: Map<String, List<String>> = mapOf(
    "morgen" to listOf("Oslo_sett_fra_Nesoddtangen,_2020.jpg", "Oslo_from_east_IMG_7642_aerial.JPG", "Oslo_S_aerial.jpg"),
    "dag" to listOf("Oslo_Skyline,_drone.jpg", "Rodeløkka_(7._september_2018).jpg", "Holmenkollen_aerial.jpg", "2010-10-25_Oslo.jpg", "Operahuset.jpg", "Oslo_S_aerial.jpg"),
    "kveld" to listOf("Bjørvika_-_Oslo,_Norway_2020-12-23.jpg", "Oslo_sunset_-_33885192918.jpg", "Oslo_view.jpg"),
    "natt" to listOf("Oslo_at_night.jpg", "Oslo_night_skyline_2011.jpg", "Oslo_-_Bjørvika_-_2026.jpg"),
)

fun osloUrl41(file: String, w: Int = 2000): String =
    "https://commons.wikimedia.org/wiki/Special:FilePath/" + URLEncoder.encode(file, "UTF-8").replace("+", "%20") + "?width=$w"

/** Tidsrom: soloppgang−1 t til +3 t = morgen, solnedgang−2 t til +1 t = kveld, mørkt = natt (fra Vær når det finnes), ellers klokka. */
fun AppViewModel.osloSlot41(now: java.time.ZonedDateTime = java.time.ZonedDateTime.now()): String {
    val w = weatherFull
    val rise = epoch41(w?.today?.sunrise)?.takeIf { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalDate() == now.toLocalDate() }
    val set = epoch41(w?.today?.sunset)?.takeIf { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalDate() == now.toLocalDate() }
    if (rise != null && set != null) {
        val t = now.toInstant().toEpochMilli(); val h = 3_600_000L
        return when {
            t >= rise - h && t < rise + 3 * h -> "morgen"
            t >= set - 2 * h && t < set + h -> "kveld"
            t >= rise + 3 * h && t < set - 2 * h -> "dag"
            else -> "natt"
        }
    }
    val hr = now.hour
    return when (hr) { in 5..9 -> "morgen"; in 10..15 -> "dag"; in 16..19 -> "kveld"; else -> "natt" }
}

fun AppViewModel.osloKey41(): String = osloSlot41() + LocalTime.now().hour

/** Bildet for nå: timens bilde i tidsrommet (time % antall), så resten av settet, så dag-settet. Feilede hoppes over. */
internal suspend fun AppViewModel.oslo41(): Pair<Bitmap, String?>? {
    val slot = osloSlot41()
    val l = OSLO41[slot] ?: return null
    val i = LocalTime.now().hour % l.size
    val order = (l.drop(i) + l.take(i)) + (if (slot == "dag") emptyList() else OSLO41["dag"].orEmpty().filter { it !in l })
    for (f in order) for (w in listOf(2000, 1280)) {
        val b = runCatching { bgImage41(osloUrl41(f, w)) }.getOrNull() ?: continue
        p41.osloKey = osloKey41()
        p41.osloFile = f
        val c = commonsCredit41(f)
        p41.osloCredit = c
        return b to creditLine41(c)
    }
    return null
}

fun creditLine41(c: Credit41?): String? = c?.let { listOfNotNull(it.author?.let { a -> "Foto: $a" }, it.license, "Wikimedia Commons").joinToString(" · ") }

private val creditCache41 = HashMap<String, Credit41>()

/** Forfatter og lisens fra Commons (extmetadata). Lagres i minnet; feiler det, vises bare «Wikimedia Commons». */
private suspend fun commonsCredit41(file: String): Credit41 {
    creditCache41[file]?.let { return it }
    val c = runCatching {
        withContext(Dispatchers.IO) {
            val url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=" + URLEncoder.encode("File:$file", "UTF-8")
            val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
            conn.connectTimeout = 5000; conn.readTimeout = 8000
            conn.setRequestProperty("User-Agent", "FinansHub-Android (home.kristo.no)")
            val body = try { conn.inputStream.bufferedReader().use { it.readText() } } finally { conn.disconnect() }
            val pages = JSONObject(body).optJSONObject("query")?.optJSONObject("pages")
            val pg = pages?.keys()?.asSequence()?.firstOrNull()?.let { pages.optJSONObject(it) }
            val md = pg?.optJSONArray("imageinfo")?.optJSONObject(0)?.optJSONObject("extmetadata")
            fun v(k: String) = md?.optJSONObject(k)?.optString("value")?.replace(Regex("<[^>]+>"), "")?.trim()?.takeIf { it.isNotBlank() }
            Credit41(v("Artist")?.take(60), v("LicenseShortName"), file)
        }
    }.getOrElse { Credit41(null, null, file) }
    if (c.author != null || c.license != null) creditCache41[file] = c
    return c
}

fun commonsPage41(file: String): String = "https://commons.wikimedia.org/wiki/File:" + URLEncoder.encode(file, "UTF-8").replace("+", "%20")

/** Hvert minutt: ny time eller nytt tidsrom → last neste bilde (byttes først når det er lastet, aldri blankt). */
fun AppViewModel.osloTick41() {
    if (photoKind != "oslo") return
    val k = osloKey41()
    if (p41.osloKey != null && p41.osloKey != k) loadPhoto()
}

/* ======================= Chat: «✦ Auto» ======================= */

/** GET /api/chat/models → auto:{id:'auto', label:'✦ Auto', picks}. Auto øverst, og standard én gang (autoMig41). */
fun AppViewModel.chatAuto41(o: JSONObject) {
    val s = chat27
    val au = o.optJSONObject("auto") ?: return
    val id = au.s37("id") ?: "auto"
    val m = ChatModel27(id, au.s37("label") ?: "✦ Auto", "lokal", "glimt", null, true, true, "Glimt velger beste modell for hver melding · lokalt når dine data er med")
    s.models = listOf(m) + s.models.filter { it.id != id }
    val sp = prefs41()
    val key = "autoMig41_" + (account?.id ?: "")
    if (!sp.getBoolean(key, false)) {
        sp.edit().putBoolean(key, true).apply()
        s.defModel = id
        if (s.curId == null) s.model = id
        saveChatCfg27("chat_default_model", id)
    }
}

/* ======================= Hjemlys «Si fra» ======================= */

/** Mottakere: husstanden (uten deg selv). (userId, navn). */
fun AppViewModel.sfPeople41(): List<Pair<String, String>> {
    p41.sfPeople?.takeIf { it.isNotEmpty() }?.let { return it }
    val me = family?.me?.userId ?: p40.hl?.mine?.userId
    return (family?.members ?: emptyList()).filter { it.userId != me && it.userId.isNotBlank() }.map { it.userId to it.name }
}

fun AppViewModel.sfLastTo41(kind: String): Set<String>? = p41.sfLast[kind]?.takeIf { it.isNotEmpty() } ?: prefs41().getStringSet("sf_to_$kind", null)

/** GET /api/hjemlys/recipients → {household:[{userId, name}], last:{checkin:[id], …}} (du selv er aldri med). */
fun AppViewModel.loadSfPeople41() {
    launch41 {
        val o = runCatching { JSONObject(api41 { hlGet("/hjemlys/recipients", timeout = 8_000) }) }.getOrNull() ?: return@launch41
        p41.sfPeople = objs34(o.optJSONArray("household")).mapNotNull { x -> x.s37("userId")?.let { it to (x.s37("name") ?: it) } }
        val last = o.optJSONObject("last")
        if (last != null) p41.sfLast = last.keys().asSequence().associateWith { k -> last.optJSONArray(k)?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet() }
    }
}

/** «+ 15 min» på Drar snart (PATCH /api/hjemlys/notice/:id {plus:15}). */
fun AppViewModel.plusNotice41(min: Int = 15) {
    val id = p41.sfNoticeId ?: return
    Haptics.select()
    launch41 { runCatching { api41 { request("PATCH", "/hjemlys/notice/" + URLEncoder.encode(id, "UTF-8"), JSONObject().put("plus", min), prefix = Api.HOMELAB) } } }
}

/** «Drar nå» fra Drar snart (POST /api/hjemlys/notice/:id/now). */
fun AppViewModel.nowNotice41() {
    val id = p41.sfNoticeId ?: return
    Haptics.select()
    launch41 {
        runCatching { api41 { hlPost("/hjemlys/notice/" + URLEncoder.encode(id, "UTF-8") + "/now") } }
        p41.sfSent = "«${firstName37(displayName)} drar nå» er sendt."
    }
}

/** Forslag til sted: kalenderhendelsen som pågår nå (f.eks. «Bursdag hos Mari»). */
fun AppViewModel.sfPlace41(): String? {
    val now = java.time.LocalDateTime.now()
    return kal26.events?.firstOrNull { e ->
        val st = e.start; val en = e.end
        !e.allDay && e.date == LocalDate.now() && st != null && en != null &&
            now.isAfter(e.date.atTime(st).minusMinutes(30)) && now.isBefore(e.endDate.atTime(en))
    }?.title
}

/** POST /api/hjemlys/notice {kind, place?, eta?, to:[userId], note?}. Bare beskjeden og stedet du valgte sendes, ikke posisjon. */
fun AppViewModel.sendNotice41(kind: String, place: String?, leaveMin: Int?, to: List<String>, note: String? = null, dest: String? = null) {
    val s = p41
    if (s.sfBusy) return
    if (to.isEmpty()) { s.sfErr = "Velg minst én som skal få beskjed"; return }
    s.sfBusy = true; s.sfErr = null
    val eta = leaveMin?.let { Instant.now().plusSeconds(it * 60L).toString() }
    launch41 {
        try {
            val body = JSONObject().put("kind", kind).put("to", JSONArray(to))
            place?.trim()?.takeIf { it.isNotBlank() }?.let { body.put("place", it) }
            if (kind == "leaving_soon") { body.put("leaveInMin", leaveMin ?: JSONObject.NULL); eta?.let { body.put("eta", it) } }
            // Drar nå med mål: serveren starter en vanlig Hjemlys-tur (session) med «Alt OK?» og forsinkelsesregler.
            if (kind == "leaving_now" && dest != null && dest != "none") body.put("destination", JSONObject().put("kind", dest).put("name", if (dest == "home") "Hjem" else place?.trim().orEmpty().ifBlank { "Annet sted" }))
            body.put("remember", true)
            note?.trim()?.takeIf { it.isNotBlank() }?.let { body.put("note", it) }
            val res = runCatching { JSONObject(api41 { hlPost("/hjemlys/notice", body) }) }.getOrElse { throw it }
            s.sfNoticeId = res.optJSONObject("notice")?.s37("id")
            prefs41().edit().putStringSet("sf_to_$kind", to.toSet()).apply()
            val names = sfPeople41().filter { it.first in to }.map { firstName37(it.second) }
            val who = when (names.size) { 0 -> "mottakerne"; 1 -> names[0]; 2 -> names[0] + " og " + names[1]; else -> names.take(2).joinToString(", ") + " og ${names.size - 2} til" }
            val first = firstName37(displayName)
            s.sfSent = when (kind) {
                "checkin" -> "«$first sjekket inn" + (place?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "") + "» er sendt til $who."
                "leaving_soon" -> "«$first drar om ca. ${leaveMin ?: 30} min» er sendt til $who."
                "arrived" -> "«$first er fremme» er sendt til $who."
                else -> "«$first drar nå" + (place?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "") + "» er sendt til $who."
            }
            Haptics.success()
            if (kind == "leaving_soon" && leaveMin != null) Notify.post(appCtx40, "Drar om ca. $leaveMin min", "Glimt minner deg på det når det er tid.", "hl41-soon", "hjemlys")
            loadHjemlys40(force = true)
            if (kind == "leaving_now" && dest != null && dest != "none") { s.sfKind = null; s.sfSent = null; p40.hlSheet = true }
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.sfErr = if (e.status == 404 || e.status == 405) "Serveren har ikke «Si fra» ennå. Oppdater Homelab-serveren." else (e.message ?: "Fikk ikke sendt")
            Haptics.error()
        } catch (e: Exception) { s.sfErr = e.message ?: "Fikk ikke sendt"; Haptics.error() } finally { s.sfBusy = false }
    }
}

/* ======================= Min reise ======================= */

private fun leg41(o: JSONObject): Leg41 = Leg41(
    o.s37("mode") ?: "foot", o.s37("line"), o.s37("from"), o.s37("to"), o.s37("dep") ?: o.s37("expected") ?: o.s37("aimed"), o.s37("arr"),
    o.optInt("delayMin", 0), if (o.has("walkMin")) o.optInt("walkMin") else null, if (o.has("meters")) o.optInt("meters") else null, o.s37("label"),
)

internal fun parseTrip41(raw: String): Trip41? {
    val o = JSONObject(raw)
    val opts = objs34(o.optJSONArray("options")).map { x ->
        TripOpt41(objs34(x.optJSONArray("legs")).map(::leg41), x.s37("dep"), x.s37("arr"), if (x.has("minutes")) x.optInt("minutes") else null,
            x.optBoolean("preferred", false), x.optJSONArray("badges")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } } ?: emptyList())
    }
    val al = o.optJSONObject("alert")?.let { a ->
        val w = a.optJSONObject("walk")
        TripAlert41(a.s37("text") ?: "", w?.let { if (it.has("minutes")) it.optInt("minutes") else null }, w?.optDouble("km")?.takeIf { !it.isNaN() }, w?.s37("catches"), a.s37("homeAt"), a.s37("body"))
    }
    return Trip41(o.s37("dir") ?: "toHome", o.s37("from") ?: "", o.s37("to") ?: "", opts, al, o.s37("updatedAt"))
}

fun AppViewModel.loadTrip41(force: Boolean = false) {
    val s = p41
    if (!force && System.currentTimeMillis() - s.tripAt < 25_000L && s.trip != null) return
    s.tripAt = System.currentTimeMillis()
    launch41 {
        s.tripBusy = true
        try {
            val raw = api41 { hlGet("/ruter/my-trip?dir=" + s.tripDir, timeout = 12_000) }
            s.trip = parseTrip41(raw); s.tripMissing = false
        } catch (e: ApiException) { if (e.status == 404 || e.status == 405 || e.status == 403) { s.tripMissing = true; s.trip = null } } catch (_: Exception) { } finally { s.tripBusy = false }
    }
}

fun AppViewModel.flipTrip41() {
    val s = p41
    val cur = s.trip?.dir ?: if (LocalTime.now().hour < 12) "toSchool" else "toHome"
    s.tripDir = if (cur == "toHome") "toSchool" else "toHome"
    Haptics.select()
    loadTrip41(force = true)
}

/** Aktiv «forlot skolen»-hendelse (utløper hjemme / etter 90 min). Innstillingen homeCard: over | instead | off. */
fun AppViewModel.loadJourney41() {
    val s = p41
    launch41 {
        val raw = try { api41 { hlGet("/ruter/journey", timeout = 8_000) } } catch (_: Exception) { null } ?: run { s.journey = null; return@launch41 }
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch41
        if (o.has("journey") && o.isNull("journey")) { s.journey = null; return@launch41 }
        val j = o.optJSONObject("journey") ?: o
        val at = j.s37("leftSchoolAt") ?: j.s37("leftAt") ?: j.s37("left_school_at") ?: j.s37("at")
        val active = (!j.has("active") || j.optBoolean("active", true)) && j.s37("endedAt") == null
        if (j.optBoolean("hidden", false) && at != null) { s.rtHide = at; prefs41().edit().putString("papir_rt_hide", at).apply() }
        j.optJSONObject("trip")?.let { tr -> runCatching { parseTrip41(tr.toString()) }.getOrNull()?.let { s.trip = it } }
        (j.s37("homeCard") ?: o.s37("homeCard") ?: o.optJSONObject("settings")?.s37("homeCard"))?.takeIf { it in setOf("over", "instead", "off") }?.let { s.homeCard = it; prefs41().edit().putString("rt_home_card", it).apply() }
        val exp = j.s37("expiresAt") ?: at?.let { epoch41(it) }?.let { Instant.ofEpochMilli(it + 90 * 60_000L).toString() }
        val alive = at != null && active && (epoch41(exp) ?: Long.MAX_VALUE) > System.currentTimeMillis()
        s.journey = if (alive) Journey41(at!!, exp) else null
        if (alive) { s.tripDir = "toHome"; loadTrip41() }
    }
}

/** Kortet på Hjem vises bare med aktiv hendelse som ikke er sveipet bort for denne turen. */
fun AppViewModel.tripOnHome41(): Boolean {
    val j = p41.journey ?: return false
    return p41.homeCard != "off" && p41.rtHide != j.leftAt && p41.trip?.options?.isNotEmpty() == true
}

fun AppViewModel.hideTrip41() {
    val j = p41.journey ?: return
    p41.rtHide = j.leftAt
    prefs41().edit().putString("papir_rt_hide", j.leftAt).apply()
    p41.rtToast = true
    launch41 { runCatching { api41 { hlPost("/ruter/journey/hide") } }; delay(4_500); p41.rtToast = false }
}

fun AppViewModel.undoHideTrip41() {
    p41.rtHide = null; p41.rtToast = false
    prefs41().edit().remove("papir_rt_hide").apply()
    launch41 { runCatching { api41 { hlDelete("/ruter/journey/hide") } } }
}

fun AppViewModel.setHomeCard41(v: String) {
    p41.homeCard = v; Haptics.select()
    prefs41().edit().putString("rt_home_card", v).apply()
    launch41 { runCatching { api41 { hlPut("/ruter/settings", JSONObject().put("homeCard", v)) } } }
}

/** Etiketter laget ferdig i koden («Gå 17 min», «Trikk 9 min»), aldri tekst rundt en verdi. */
fun legLabel41(l: Leg41): String {
    l.label?.takeIf { it.isNotBlank() }?.let { return it }
    val min = l.walkMin ?: run { val a = epoch41(l.arr); val d = epoch41(l.dep); if (a != null && d != null) ((a - d) / 60_000L).toInt() else null }
    return when (l.mode) {
        "foot", "walk", "gå" -> "Gå" + (min?.let { " $it" } ?: "")
        "tram" -> (l.line?.let { "Trikk $it" } ?: "Trikk") + (min?.let { " · $it min" } ?: "")
        "bus" -> l.line ?: "Buss"
        "metro" -> l.line?.let { "T-bane $it" } ?: "T-bane"
        else -> l.line ?: l.mode
    }
}

/* ======================= Gjøremål: Glimt i bakgrunnen ======================= */

private val LINK41 = Regex("(?i)\\b(før vi skal|før jeg skal|hvor vi må|hvor jeg må|og så|siden|fordi|deretter|etterpå)\\b")
private val VERB41 = Regex("(?i)\\b(må|skal|huske|husk)\\b")

/** AI brukes når teksten har ≥ 12 ord og et verb som «må/skal/huske», koblinger som «før vi skal», eller flere setninger. */
fun needsAi41(q: String): Boolean {
    val words = q.trim().split(Regex("\\s+")).count { it.isNotBlank() }
    val sentences = q.split(Regex("[.!?]\\s+")).count { it.isNotBlank() }
    return (words >= 12 && VERB41.containsMatchIn(q)) || LINK41.containsMatchIn(q) || sentences >= 2
}

/** Svar {jobId, placeholder}: raden «Glimt deler opp beskjeden …» øverst; lista hentes på nytt til jobben er ferdig. */
fun AppViewModel.glimtAsync41(r: JSONObject, q: String) {
    val s = p41
    val id = r.s37("jobId") ?: return
    val job = GJob41(id, q, System.currentTimeMillis())
    s.glimtJobs = s.glimtJobs + job
    p37.glimtOpen = false
    launch41 {
        val before = tasks?.items?.size ?: 0
        var done = false
        for (wait in listOf(3, 4, 5, 6, 8, 10, 12, 15)) {
            delay(wait * 1000L)
            val st = runCatching { JSONObject(api41 { hlGet("/tasks/glimt/jobs/" + URLEncoder.encode(id, "UTF-8"), timeout = 6_000) }) }.getOrNull()
            refreshTasks37()
            val status = st?.s37("state") ?: st?.s37("status") ?: st?.optJSONObject("job")?.let { it.s37("state") ?: it.s37("status") }
            if (status in setOf("done", "ferdig", "failed", "error") || (status == null && (tasks?.items?.size ?: 0) > before + 1)) {
                done = status !in setOf("failed", "error")
                val n = st?.optJSONArray("items")?.length() ?: st?.optInt("count", 0)?.takeIf { it > 0 } ?: ((tasks?.items?.size ?: 0) - before).coerceAtLeast(0)
                s.glimtDone = if (done) "✓ Glimt lagde $n punkter i riktig rekkefølge" else "Glimt fikk ikke delt opp beskjeden. Den ligger som ett punkt."
                break
            }
        }
        s.glimtJobs = s.glimtJobs.filter { it.id != id }
        if (s.glimtDone == null) s.glimtDone = "✦ Glimt er ferdig med beskjeden"
        if (done) Haptics.success()
        if (inBackground29) Notify.post(appCtx40, "Glimt", s.glimtDone ?: "", "glimt41-$id", "tasks")
        delay(10_000)
        s.glimtDone = null
    }
}

/* ======================= Bursdager: bilde av personer ======================= */

/** Kvadrat (midten), 256×256, JPEG 82 %. POST /api/birthdays/:id/photos (eldre: …/photo). Toast «Bilde lagt til for Emma». */
fun AppViewModel.bdPhoto41(b: Bd24, uri: Uri) {
    launch41 {
        try {
            val data = withContext(Dispatchers.IO) { appCtx40.contentResolver.openInputStream(uri)?.use { it.readBytes() } } ?: return@launch41
            val jpeg = withContext(Dispatchers.Default) { squareJpeg36(data, 256, 82) } ?: run { message = "Kunne ikke lese bildet"; return@launch41 }
            val id = URLEncoder.encode(b.id, "UTF-8")
            val part = listOf(Api.Part("file", "bilde.jpg", "image/jpeg", jpeg))
            try { api41 { upload("/birthdays/$id/photos", part, prefix = Api.HOMELAB) } } catch (e: ApiException) {
                if (e.status == 404 || e.status == 405) api41 { upload("/birthdays/$id/photo", part, prefix = Api.HOMELAB) } else throw e
            }
            Haptics.success()
            message = "Bilde lagt til for ${firstName37(b.name)}"
            loadBirthdays24(quiet = true)
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            message = if (e.status == 404 || e.status == 405) "Serveren har ikke bilder i Bursdager ennå. Oppdater Homelab-serveren." else (e.message ?: "Fikk ikke lastet opp bildet")
        } catch (e: Exception) { message = e.message ?: "Fikk ikke lastet opp bildet" }
    }
}

/** «Fjern bilde»: GET …/photos → DELETE …/photos/:pid for alle (eldre: DELETE …/photo). */
fun AppViewModel.bdPhotoRemove41(b: Bd24) {
    launch41 {
        val id = URLEncoder.encode(b.id, "UTF-8")
        try {
            val raw = api41 { hlGet("/birthdays/$id/photos") }
            val t = raw.trim()
            val arr = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("photos") ?: JSONArray()
            objs34(arr).mapNotNull { it.s37("id") ?: it.s37("pid") }.forEach { pid -> runCatching { api41 { hlDelete("/birthdays/$id/photos/" + URLEncoder.encode(pid, "UTF-8")) } } }
        } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) runCatching { api41 { hlDelete("/birthdays/$id/photo") } }
        } catch (_: Exception) { }
        message = "Bildet er fjernet"
        loadBirthdays24(quiet = true)
    }
}

/* ======================= 17. mai ======================= */

/**
 * Høytider → «17. mai» (claude-code-17-mai.md): auto (14.–17. mai i Norge) · av · pa (vis nå). Synkes med /api/glimt/settings mai17
 * (serveren sender også mai17Active). Figurene får sløyfe og norsk flagg som vaier (GlimtFigs35 → drawMai41). Ingen bunad.
 */
object Mai41 {
    var mode by mutableStateOf("auto")
    var serverActive by mutableStateOf<Boolean?>(null)
    private var loaded = false

    fun autoOn(d: LocalDate = java.time.ZonedDateTime.now(ZoneId.of("Europe/Oslo")).toLocalDate()): Boolean = d.monthValue == 5 && d.dayOfMonth in 14..17
    val on: Boolean get() = when (mode) { "av" -> false; "pa" -> true; else -> serverActive ?: autoOn() }

    fun ensure(ctx: Context) {
        if (loaded) return
        loaded = true
        mode = ctx.applicationContext.getSharedPreferences("p41", Context.MODE_PRIVATE).getString("mai17", "auto") ?: "auto"
    }

    fun apply(o: JSONObject, ctx: Context) {
        ensure(ctx)
        o.s37("mai17")?.takeIf { it in setOf("auto", "av", "pa") }?.let { if (it != mode) { mode = it; ctx.applicationContext.getSharedPreferences("p41", Context.MODE_PRIVATE).edit().putString("mai17", it).apply() } }
        if (o.has("mai17Active")) serverActive = o.optBoolean("mai17Active")
    }
}

fun AppViewModel.setMai41(m: String) {
    Mai41.ensure(appCtx40)
    Mai41.mode = m
    Mai41.serverActive = null
    prefs41().edit().putString("mai17", m).apply()
    Haptics.select()
    redrawWidgets40()
    launch41 { runCatching { api41 { hlPut("/glimt/settings", JSONObject().put("mai17", m)) } } }
}
