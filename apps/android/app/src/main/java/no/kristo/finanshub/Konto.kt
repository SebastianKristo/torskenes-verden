package no.kristo.finanshub

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.io.File
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import no.kristo.felles.nett.openSikker
import org.json.JSONArray
import org.json.JSONObject

/* ======================= Profilbilde ======================= */

/** Kvadrat 512 × 512 (JPEG 85), lastes opp og vises med en gang i meny, hilsen og Konto. */
fun AppViewModel.uploadAvatar36(uri: Uri) {
    val s = p36
    s.avatarBusy = true
    launch36 {
        try {
            val ctx = appCtx35
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }
            val jpeg = withContext(Dispatchers.Default) { squareJpeg36(data, 512, 85) } ?: run { flash("Kunne ikke lese bildet"); return@launch36 }
            api36 { upload("/me/avatar", listOf(Api.Part("file", "avatar.jpg", "image/jpeg", jpeg)), prefix = Api.HOMELAB) }
            setAvatar36(android.graphics.BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size))
            reloadMe36()
            flash("Profilbildet er oppdatert")
        } finally { s.avatarBusy = false }
    }
}

data class Profile37(
    val id: String, val name: String, val color: Long, val avatar: String?, val userId: String?, val username: String?,
    val hasLoc: Boolean, val hasLists: Boolean, val hasSubs: Boolean, val suggested: Boolean,
    /** Koblet til en annen bruker (dempet: «Koblet til @sebastian»). */
    val other: Boolean = false,
)

/* ======================= Onboarding: koble bruker til profil ======================= */

private fun parseProfiles37(raw: String): Triple<List<Profile37>, String?, Boolean> {
    val o = JSONObject(raw)
    val list = objs34(o.optJSONArray("profiles")).mapNotNull { p ->
        val id = p.s37("id") ?: return@mapNotNull null
        val has = p.optJSONObject("has")
        Profile37(id, p.s37("name") ?: "Profil", hex37(p.s37("color")) ?: 0xFF2B5D8A, p.s37("avatar"), p.s37("userId"), p.s37("username"),
            has?.optBoolean("location", false) ?: false, has?.optBoolean("lists", false) ?: false, has?.optBoolean("subs", false) ?: false, p.optBoolean("suggested", false),
            p.optBoolean("linkedToOther", false))
    }
    return Triple(list, o.optJSONObject("me")?.s37("profileId"), o.optBoolean("locked", false))
}

private fun AppViewModel.obDoneKey37() = "ob37_done_" + acct37()

/** Etter innlogging: ikke koblet (og ikke låst) → «Hvem er du?». Låst og admin har koblet → bare bekreft. 404 = eldre server, ingenting. */
fun AppViewModel.checkOnboard37() {
    val s = p37
    val k = acct37()
    if (k.isBlank() || s.obFor == k) return
    s.obFor = k
    if (prefs.bool(obDoneKey37())) return
    launch37 {
        val raw = try { api37 { hlGet("/profiles") } } catch (e: CancellationException) { throw e } catch (_: Exception) { return@launch37 }
        val (list, mine, locked) = runCatching { parseProfiles37(raw) }.getOrNull() ?: return@launch37
        s.profiles = list
        s.obLocked = locked
        s.obMine = mine
        if (mine != null && !locked) { prefs.set(obDoneKey37(), true); return@launch37 }
        if (mine == null && locked) return@launch37
        val me0 = (me?.username ?: account?.username ?: "").lowercase()
        s.obSel = mine ?: list.firstOrNull { it.suggested && it.userId == null }?.id
            ?: list.firstOrNull { it.userId == null && (it.name.lowercase() == me0 || it.name.lowercase().startsWith(me0) || me0.startsWith(it.name.lowercase().split(' ').first())) && me0.isNotBlank() }?.id
        s.obNew = false
        s.obStep = 1
        s.obErr = null
        s.obOpen = true
    }
}

fun AppViewModel.linkProfile37() {
    val s = p37
    if (s.obBusy) return
    s.obBusy = true
    s.obErr = null
    launch37 {
        try {
            if (s.obLocked && s.obMine != null) {
                s.obLinked = s.profiles.firstOrNull { it.id == s.obMine }
            } else {
                val body = JSONObject().put("consents", JSONObject().apply { s.obConsent.forEach { (k, v) -> put(k, v) } })
                if (s.obNew) body.put("newProfileName", s.obNewName.trim()) else body.put("profileId", s.obSel)
                val raw = api37 { hlPost("/onboarding/link", body) }
                val p = runCatching { JSONObject(raw).optJSONObject("profile") }.getOrNull()
                s.obLinked = p?.let { o -> Profile37(o.s37("id") ?: "", o.s37("name") ?: s.obNewName.trim(), hex37(o.s37("color")) ?: 0xFF3D7F8A, o.s37("avatar"), o.s37("userId"), o.s37("username"), false, false, false, false) }
                    ?: s.profiles.firstOrNull { it.id == s.obSel } ?: Profile37("ny", s.obNewName.trim().ifBlank { displayName }, 0xFF3D7F8A, null, null, null, false, false, false, false)
            }
            prefs.set(obDoneKey37(), true)
            Haptics.success()
            s.obStep = 3
            runCatching { reloadMe36() }
        } catch (e: ApiException) {
            s.obErr = when (e.status) {
                409 -> "Profilen er allerede koblet til en annen bruker. Velg en annen."
                404 -> "Serveren kan ikke koble profiler ennå. Prøv igjen etter neste oppdatering."
                else -> e.message ?: "Fikk ikke koblet profilen"
            }
            if (e.status == 409) { s.obStep = 1; runCatching { s.profiles = parseProfiles37(api37 { hlGet("/profiles") }).first } }
            Haptics.error()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.obErr = uiErr73(e, "Fikk ikke koblet profilen")
        } finally { s.obBusy = false }
    }
}

fun AppViewModel.closeOnboard37(skip: Boolean) {
    if (skip) prefs.set(obDoneKey37(), true)
    p37.obOpen = false
}

/* ======================= Husstanden og meg ======================= */

/** id fra /api/me og husstandens brukere (id, navn, farge). */
fun AppViewModel.loadUsers37(force: Boolean = false) {
    val s = p37
    val k = acct37()
    if (!force && s.usersFor == k) return
    s.usersFor = k
    launch37 {
        runCatching { JSONObject(api37 { hlGet("/me") }) }.getOrNull()?.let { o ->
            s.myId = o.s37("id") ?: o.s37("userId") ?: o.optJSONObject("user")?.s37("id")
        }
        val raw = runCatching { api37 { hlGet("/users") } }.getOrNull() ?: return@launch37
        val t = raw.trim()
        val a = runCatching { if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("users") ?: it.optJSONArray("items") ?: JSONArray() } }.getOrNull() ?: return@launch37
        s.users = objs34(a).mapNotNull { u ->
            TaskMember(u.s37("id") ?: u.s37("userId") ?: return@mapNotNull null, u.s37("name") ?: u.s37("username") ?: "", hex37(u.s37("color")), u.s37("role"))
        }
    }
}

fun firstName37(n: String) = n.trim().split(' ').firstOrNull().orEmpty()

/* ======================= Konto → Profil ======================= */

var profilesMissing37 = false

/** Profilene og min kobling (Konto → Profil). */
fun AppViewModel.loadProfiles37() = launch37 {
    val s = p37
    try {
        val (list, mine, locked) = parseProfiles37(api37 { hlGet("/profiles") })
        s.profiles = list; s.obMine = mine; s.obLocked = locked
        profilesMissing37 = false
    } catch (e: ApiException) { if (e.status == 404 || e.status == 405) profilesMissing37 = true } catch (e: CancellationException) { throw e } catch (_: Exception) {}
}

/** Åpner «Hvem er du?» igjen (ikke koblet ennå). */
fun AppViewModel.reopenOnboard37() {
    prefs.set("ob37_done_" + (account?.id ?: ""), false)
    p37.obFor = null
    checkOnboard37()
}

/* ======================= Konto → ØKT ======================= */

fun AppViewModel.loadSessions38() = launch38 {
    p38.sessions = try {
        val o = JSONObject(api38 { hlGet("/me/sessions", timeout = 6_000) })
        n34(o, "count", "total") ?.toInt() ?: o.optJSONArray("sessions")?.length()
    } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
}

fun AppViewModel.logoutAll38() {
    val s = p38
    if (s.allBusy) return
    if (s.allPw.isBlank()) { s.allErr = "Skriv inn passordet"; Haptics.error(); return }
    s.allBusy = true
    s.allErr = null
    launch38 {
        try {
            val o = runCatching { JSONObject(api38 { hlPost("/auth/logout-all", JSONObject().put("password", s.allPw)) }) }.getOrElse { e -> throw e }
            val n = n34(o, "count", "sessions")?.toInt()
            s.allOpen = false
            s.allPw = ""
            Haptics.success()
            message = if (n != null) "Logget ut av $n ${if (n == 1) "enhet" else "enheter"}" else "Logget ut av alle enheter"
            // Denne økten er også ugyldig nå.
            logout()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.allErr = when {
                e is ApiException && (e.status == 404 || e.status == 405) -> "Serveren støtter ikke dette ennå. Oppdater Homelab-serveren."
                e is ApiException && (e.status == 401 || e.status == 403) -> "Feil passord"
                e is ApiException && e.status == 429 -> "For mange forsøk. Vent litt."
                else -> uiErr73(e, "Fikk ikke kontakt med serveren")
            }
            Haptics.error()
        } finally { s.allBusy = false }
    }
}

class P39State {
    var aiIn by mutableStateOf(true)
    internal var aiInFor: String? = null
    /** Sist viste profilbilde-URL (med ?v=/hash), så et nytt bilde fra web hentes uten å logge ut. */
    internal var avatarUrl: String? = null
    internal var meAt = 0L
    /** Chat: standardmodellen fra rutingen (id, sky) – vises før modellisten er hentet. */
    var chatRoute by mutableStateOf<Pair<String, Boolean>?>(null)
    internal var chatRouteAt = 0L
    /** Kvitteringer: «✦ På nytt» med fremdrift, per kvittering-id. */
    var re by mutableStateOf<Map<String, Re39>>(emptyMap())
    /** Kvitteringer som nettopp ble lest på nytt og fikk endrede felt (gul markering i 2 s). */
    var reFlash by mutableStateOf<Map<String, Long>>(emptyMap())
    /** AI-kontroll: «✦ Glimt anbefaler» (GET /api/ai/recommend?full=1). */
    var rec by mutableStateOf<Rec39?>(null)
    var recMissing by mutableStateOf(false)
    internal var recAt = 0L
    var recAsk by mutableStateOf("")
    var recAnswer by mutableStateOf<RecAnswer39?>(null)
    var recBusy by mutableStateOf(false)
    var recUndo by mutableStateOf<String?>(null)
}

/* ======================= Profilbilde ======================= */

private const val AV_TAG = "Avatar39"

private fun AppViewModel.avatarFile39(): File? {
    val id = account?.id ?: return null
    return File(File(appCtx39.filesDir, "avatar39").apply { mkdirs() }, id.replace(Regex("[^\\w-]"), "_") + ".img")
}

private fun decode39(b: ByteArray): Bitmap? {
    BitmapFactory.decodeByteArray(b, 0, b.size)?.let { return it }
    // HEIC/AVIF (fra iPhone) som BitmapFactory ikke klarer på eldre Android.
    if (Build.VERSION.SDK_INT >= 28) runCatching {
        return android.graphics.ImageDecoder.decodeBitmap(android.graphics.ImageDecoder.createSource(java.nio.ByteBuffer.wrap(b))) { dec, info, _ ->
            val big = maxOf(info.size.width, info.size.height)
            if (big > 512) { val k = 512f / big; dec.setTargetSize((info.size.width * k).toInt().coerceAtLeast(1), (info.size.height * k).toInt().coerceAtLeast(1)) }
            dec.allocator = android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE
        }
    }
    return null
}

/** Henter bildet: relativ sti mot serveren med Bearer, absolutt URL med token bare når verten er vår egen (signert URL ellers). */
private suspend fun AppViewModel.fetch39(url: String): Pair<Int, ByteArray?> = withContext(Dispatchers.IO) {
    val root = base39.trimEnd('/')
    val abs = url.startsWith("http://") || url.startsWith("https://")
    val full = if (abs) url else root + (if (url.startsWith("/")) url else "/$url")
    val own = !abs || runCatching { URL(full).host.equals(URL(root).host, ignoreCase = true) }.getOrDefault(false)
    var code = -1
    try {
        val c = URL(full).openSikker()
        try {
            c.connectTimeout = 10_000; c.readTimeout = 15_000
            c.useCaches = false
            c.instanceFollowRedirects = true
            c.setRequestProperty("Accept", "image/webp,image/jpeg;q=0.9,image/png;q=0.8,*/*;q=0.5")
            if (own) token39?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            code = c.responseCode
            Log.i(AV_TAG, "GET $full → $code ${c.contentType ?: ""}")
            if (code in 200..299) code to c.inputStream.use { it.readBytes() } else code to null
        } finally { c.disconnect() }
    } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) {
        Log.w(AV_TAG, "GET $full feilet: ${e.message}")
        code to null
    }
}

/** Sist lagrede bilde fra disk (oppstart, fly-modus, feil på nettet). */
internal suspend fun AppViewModel.avatarFromDisk39(): Boolean {
    val f = avatarFile39() ?: return false
    if (!f.exists()) return false
    val b = withContext(Dispatchers.IO) { runCatching { f.readBytes() }.getOrNull() } ?: return false
    val bmp = withContext(Dispatchers.Default) { decode39(b) } ?: return false
    setAvatar39(bmp)
    return true
}

/**
 * Erstatter loadAvatar: url null betyr «ingen bilde» bare når /me faktisk svarte (ellers beholdes det lagrede).
 * Samme URL som sist (og bildet vises) hentes ikke på nytt.
 */
internal suspend fun AppViewModel.avatar39(url: String?, url192: String? = null) {
    val s = p39
    if (url.isNullOrBlank()) {
        if (me != null) {
            s.avatarUrl = null
            setAvatar39(null)
            avatarFile39()?.let { f -> withContext(Dispatchers.IO) { runCatching { f.delete() } } }
        } else if (avatar == null) avatarFromDisk39()
        return
    }
    if (avKey39(url) == s.avatarUrl && avatar != null) return
    if (avatar == null) avatarFromDisk39()
    var bmp: Bitmap? = null
    var bytes: ByteArray? = null
    for (u in listOfNotNull(url, url192?.takeIf { it != url })) {
        val (_, b) = fetch39(u)
        val d = b?.let { withContext(Dispatchers.Default) { decode39(it) } }
        if (d != null) { bmp = d; bytes = b; break }
        if (b != null) Log.w(AV_TAG, "Kunne ikke lese bildet fra $u (${b.size} byte)")
    }
    if (bmp == null) return // beholder det som vises (disk eller forrige), ellers initialer
    s.avatarUrl = avKey39(url)
    setAvatar39(bmp)
    val f = avatarFile39()
    if (f != null && bytes != null) withContext(Dispatchers.IO) { runCatching { f.writeBytes(bytes) } }
}

/** Versjonen av bildet (?v=<hash> eller hash=), så /api/me/avatar og /api/users/<id>/avatar med samme versjon er samme bilde. */
private fun avKey39(url: String): String = Regex("[?&](?:v|hash)=([^&]+)").find(url)?.groupValues?.get(1) ?: url

/** avatarUrl eller avatar:{url, url192, hash} fra /api/me. */
internal fun avatarOf39(raw: String): Pair<String?, String?>? = runCatching {
    val o0 = JSONObject(raw)
    val o = o0.optJSONObject("user") ?: o0
    val a = o.optJSONObject("avatar")
    val url = a?.optStr("url") ?: o.optStr("avatarUrl") ?: (if (o.has("avatar") && !o.isNull("avatar") && a == null) o.optStr("avatar") else null)
    url to a?.optStr("url192")
}.getOrNull()

/** Tilbake i appen / «me» i sanntid: nytt bilde fra web vises uten å logge ut (høyst hvert 5. sekund). */
fun AppViewModel.refreshMe39(force: Boolean = false) {
    if (!loggedIn) return
    val s = p39
    val now = System.currentTimeMillis()
    if (!force && now - s.meAt < 5_000L) return
    s.meAt = now
    launch39 {
        val raw = runCatching { api39 { hlGet("/me", timeout = 6_000) } }.getOrNull()
        if (raw == null) { if (avatar == null) avatarFromDisk39(); return@launch39 }
        val (u, u192) = avatarOf39(raw) ?: return@launch39
        if (u == null || avKey39(u) != s.avatarUrl || avatar == null) avatar39(u, u192)
    }
}

/* ======================= 2FA i appen ======================= */

data class Tf40(val enabled: Boolean, val method: String?, val backupLeft: Int?, val enabledAt: String?)

data class TfSetup40(val secret: String, val otpauth: String, val qrPng: String?, val issuer: String, val account: String)

/** Hemmeligheten i grupper på 4 («JBSW Y3DP …»). */
fun tfGroups40(secret: String): String = secret.replace(" ", "").chunked(4).joinToString(" ")

fun AppViewModel.loadTf40() {
    launch40 {
        val raw = try { api40 { hlGet("/auth/2fa/status", timeout = 8_000) } } catch (e: ApiException) { null } catch (e: Exception) { null }
        p40.tf = raw?.let { r -> runCatching { JSONObject(r) }.getOrNull()?.let { o ->
            Tf40(o.optBoolean("enabled", me?.totp == true), o.s37("method") ?: "totp", if (o.has("backupLeft")) o.optInt("backupLeft") else null, o.s37("enabledAt"))
        } } ?: Tf40(me?.totp == true, if (me?.totp == true) "totp" else null, null, null)
    }
}

fun AppViewModel.openTf40() {
    val s = p40
    s.tfOpen = true; s.tfErr = null; s.tfCodes = emptyList(); s.tfNeedPw = false
    s.tfManage = null
    s.tfStep = if (s.tf?.enabled == true || me?.totp == true) 10 else 0
    loadTf40()
}

/** Steg 2: POST /api/auth/2fa/setup (krever kanskje passord / fersk økt) → hemmelighet, otpauth-URI og QR. */
fun AppViewModel.setupTf40(password: String? = null) {
    val s = p40
    if (s.tfBusy) return
    s.tfBusy = true; s.tfErr = null
    launch40 {
        try {
            val body = JSONObject().apply { password?.takeIf { it.isNotBlank() }?.let { put("password", it) } }
            val o = JSONObject(api40 { hlPost("/auth/2fa/setup", body) })
            val secret = o.s37("secret") ?: throw IllegalStateException("Serveren sendte ingen nøkkel")
            val acct = o.s37("account") ?: account?.username ?: "bruker"
            val issuer = o.s37("issuer") ?: "Nordlys OS"
            val uri = o.s37("otpauth") ?: o.s37("otpauth_uri") ?: o.s37("uri")
                ?: "otpauth://totp/${java.net.URLEncoder.encode("$issuer:$acct", "UTF-8").replace("+", "%20")}?secret=$secret&issuer=${java.net.URLEncoder.encode(issuer, "UTF-8").replace("+", "%20")}&digits=6&period=30"
            s.tfSetup = TfSetup40(secret, uri, o.s37("qrPng")?.takeIf { it.startsWith("data:image") }, issuer, acct)
            s.tfNeedPw = false
            s.tfStep = 1
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            when {
                e.status == 404 -> s.tfErr = "Serveren støtter ikke oppsett fra appen ennå. Oppdater Homelab."
                e.status == 401 || e.status == 403 || (e.message ?: "").contains("passord", true) -> { s.tfNeedPw = true; s.tfErr = if (password != null) "Feil passord. Prøv igjen." else null }
                else -> s.tfErr = e.message
            }
        } catch (e: Exception) { s.tfErr = uiErr73(e, "Fikk ikke kontakt med serveren") } finally { s.tfBusy = false }
    }
}

/** Steg 3: koden fra appen. Riktig kode slår på 2FA og gir reservekodene (steg 4). Serveren tillater ±1 tidsvindu. */
fun AppViewModel.enableTf40(code: String) {
    val s = p40
    val c = code.filter { it.isDigit() }
    if (c.length != 6 || s.tfBusy) { if (c.length != 6) s.tfErr = "Skriv de 6 sifrene fra autentiseringsappen."; return }
    s.tfBusy = true; s.tfErr = null
    launch40 {
        try {
            val o = JSONObject(api40 { hlPost("/auth/2fa/enable", JSONObject().put("code", c)) })
            if (o.has("ok") && !o.optBoolean("ok")) { s.tfErr = "Koden stemmer ikke. Prøv den neste som vises."; Haptics.error(); return@launch40 }
            s.tfCodes = codes40(o.optJSONArray("backupCodes") ?: o.optJSONArray("codes"))
            s.tfStep = 3
            Haptics.success()
            reloadMe40()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.tfErr = if (e.status == 400 || e.status == 401 || e.status == 422) "Koden stemmer ikke. Prøv den neste som vises." else e.message
            Haptics.error()
        } catch (e: Exception) { s.tfErr = e.message } finally { s.tfBusy = false }
    }
}

private fun codes40(a: JSONArray?): List<String> = a?.let { (0 until it.length()).mapNotNull { i -> it.optString(i).takeIf { c -> c.isNotBlank() } } }?.map { c ->
    val x = c.replace("-", "").replace(" ", "")
    if (x.length == 8) x.substring(0, 4) + "-" + x.substring(4) else c
} ?: emptyList()

fun AppViewModel.regenTf40() {
    val s = p40
    if (s.tfBusy) return
    s.tfBusy = true; s.tfErr = null
    launch40 {
        try {
            val o = JSONObject(api40 { hlPost("/auth/2fa/backup/regenerate") })
            s.tfCodes = codes40(o.optJSONArray("backupCodes") ?: o.optJSONArray("codes"))
            s.tfManage = "codes"
            loadTf40()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.tfErr = e.message } finally { s.tfBusy = false }
    }
}

/** Slå av: krever passord (eller en kode). */
fun AppViewModel.disableTf40(secret: String) {
    val s = p40
    if (s.tfBusy || secret.isBlank()) return
    s.tfBusy = true; s.tfErr = null
    launch40 {
        try {
            val body = if (secret.filter { it.isDigit() }.length == 6 && secret.length <= 7) JSONObject().put("code", secret.filter { it.isDigit() }) else JSONObject().put("password", secret)
            api40 { hlPost("/auth/2fa/disable", body) }
            s.tfManage = null; s.tfStep = 0
            s.tf = Tf40(false, null, null, null)
            flash("Totrinnsbekreftelse er slått av")
            reloadMe40()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.tfErr = if (e.status == 400 || e.status == 401 || e.status == 403) "Feil passord eller kode." else e.message
        } catch (e: Exception) { s.tfErr = e.message } finally { s.tfBusy = false }
    }
}

data class AsUser44(val id: String, val name: String, val role: String?, val color: Long?, val device: String?, val locked: Boolean)

data class Owner44(val id: String?, val name: String, val since: String?, val me: Boolean, val canTransfer: Boolean, val pending: String?)

/* ======================= Logg inn som (impersonering) ======================= */

private const val AS_PREF44 = "as44_state"

fun AppViewModel.loadAsUsers44() = launch44 {
    val myId = runCatching { JSONObject(api44 { hlGet("/me") }).let { it.s37("id") ?: it.optJSONObject("user")?.s37("id") } }.getOrNull()
    val raw = runCatching { api44 { hlGet("/users/directory") } }.getOrNull() ?: runCatching { api44 { hlGet("/users") } }.getOrNull() ?: return@launch44
    p44.asUsers = arr43(raw, "users", "items").mapNotNull { u ->
        val id = u.s37("id") ?: u.s37("userId") ?: return@mapNotNull null
        if (id == myId) return@mapNotNull null
        AsUser44(id, u.s37("name") ?: u.s37("username") ?: id, u.s37("role"), hex37(u.s37("color")), u.s43("device", "lastDevice"), u.b43(false, "locked", "layoutLocked"))
    }
}

/** Admin → «Logg inn som X» uten passord: kortlevd token, appen lastes som X. Admin-kontoen ligger urørt i kontolista. */
fun AppViewModel.loginAs44(u: AsUser44) = launch44 {
    val admin = account ?: return@launch44
    if (admin.id.startsWith("as44:")) return@launch44
    p44.asBusy = true
    try {
        val o = JSONObject(api44 { hlPost("/admin/impersonate", JSONObject().put("userId", u.id)) })
        val tok = o.s43("token", "accessToken") ?: throw ApiException("Serveren sendte ikke noe token")
        val usr = o.optJSONObject("user")
        val acc = UserAccount("as44:" + u.id, admin.server, usr?.s37("username") ?: u.name, usr?.s37("name") ?: u.name, usr?.s37("role") ?: u.role ?: "user", tok, admin.local, admin.external)
        prefs.set(AS_PREF44, JSONObject().put("admin", admin.id).put("adminName", admin.name).put("id", acc.id).put("name", acc.name)
            .put("color", u.color ?: 0L).put("at", System.currentTimeMillis()).toString())
        p44.asName = acc.name; p44.asColor = u.color; p44.asSheet = null
        Haptics.success()
        swapAccount44(acc, null, acc.id)
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        flash(when (e.status) { 403 -> "Bare admin kan logge inn som andre (og ikke som en annen admin)."; 404 -> "Logg inn som finnes ikke på serveren ennå. Oppdater Homelab."; else -> e.message ?: "Fikk ikke logget inn" })
    } finally { p44.asBusy = false }
}

/** «Gå ut»: X-tokenet forkastes, admin-tokenet brukes igjen. */
fun AppViewModel.exitAs44(quiet: Boolean = false) {
    val st = runCatching { JSONObject(prefs.str(AS_PREF44, "")) }.getOrNull()
    val cur = account
    val adminId = st?.s37("admin") ?: accounts.firstOrNull { !it.id.startsWith("as44:") }?.id ?: return
    val name = st?.s37("name") ?: cur?.name ?: ""
    prefs.set(AS_PREF44, "")
    p44.asName = null; p44.asColor = null
    val drop = cur?.id?.takeIf { it.startsWith("as44:") } ?: st?.s37("id")
    val target = drop?.removePrefix("as44:")
    val me = st?.s37("adminName")?.let { firstName37(it) } ?: "deg selv"
    launch44 {
        // SERVER44: POST /api/admin/impersonate/exit (med X-tokenet) forkaster tokenet og svarer {changes, message, undo}.
        val r = if (cur?.id?.startsWith("as44:") == true) runCatching { JSONObject(api44 { hlPost("/admin/impersonate/exit") }) }.getOrNull() else null
        swapAccount44(null, drop, adminId)
        if (!quiet) {
            val n = r?.i43("changes") ?: 0
            p44.asToast = "Logget ut av ${firstName37(name)}" + (if (n > 0) " · $n endringer lagret" else "") + ". Du er $me igjen."
            p44.asUndo = if (n > 0 && target != null) target else null
            Haptics.success()
        }
    }
}

/** «Angre» etter Gå ut: ruller tilbake endringene (POST /api/users/:id/layout/undo som admin). */
fun AppViewModel.undoAs44() {
    val id = p44.asUndo ?: return
    p44.asUndo = null; p44.asToast = null
    launch44 { try { api44 { hlPost("/users/" + enc44(id) + "/layout/undo") }; flash("Endringene er rullet tilbake") } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke angret: ${e.message}") } }
}

/** Ved oppstart: pågående «Logg inn som» vises med stripa; eldre enn 30 min (tokenet har gått ut) avsluttes stille. */
internal fun AppViewModel.restoreAs44() {
    val st = runCatching { JSONObject(prefs.str(AS_PREF44, "")) }.getOrNull()
    val cur = account
    if (st == null) { if (cur?.id?.startsWith("as44:") == true) exitAs44(quiet = true); return }
    if (cur?.id != st.s37("id") || System.currentTimeMillis() - st.optLong("at") > 30 * 60_000L) { exitAs44(quiet = true); return }
    p44.asName = st.s37("name"); p44.asColor = st.optLong("color").takeIf { it != 0L }
}

val AppViewModel.impersonating44: Boolean get() = account?.id?.startsWith("as44:") == true

/* ======================= Overfør eierskap ======================= */

fun AppViewModel.loadOwner44() = launch44 {
    val raw = try { api44 { hlGet("/server/owner") } } catch (e: CancellationException) { throw e } catch (e: Exception) { null } ?: return@launch44
    val o = JSONObject(raw)
    val ow = o.optJSONObject("owner") ?: o
    val me = o.optJSONObject("me")
    val pend = o.optJSONObject("pending") ?: objs34(o.optJSONArray("pending")).firstOrNull()
    p44.owner = Owner44(ow.s43("id", "userId"), ow.s43("name", "username") ?: "Ukjent", ow.s43("since") ?: o.s43("since", "startedAt", "createdAt"),
        me?.b43(false, "isOwner") ?: o.b43(false, "isMe"), me?.b43(userIsAdmin, "canTransfer") ?: o.b43(userIsAdmin, "canTransfer"),
        pend?.let { pd -> listOfNotNull(pd.optJSONObject("to")?.s43("name") ?: pd.s43("toName", "to"), pd.s43("expiresAt")?.let { "venter til ${it.take(16).replace('T', ' ')}" }).joinToString(" · ") })
    // SERVER44: candidates [{id, name, role, totp, eligible, reason}] – de som kan bli eier.
    objs34(o.optJSONArray("candidates")).takeIf { it.isNotEmpty() }?.let { cs ->
        p44.ownCands = cs.mapNotNull { u -> AsUser44(u.s37("id") ?: return@mapNotNull null, u.s37("name") ?: "", u.s37("role"), hex37(u.s37("color")),
            if (u.b43(true, "eligible")) null else (u.s43("reason") ?: "kan ikke bli eier ennå"), false) }
    }
    if (p44.asUsers == null) loadAsUsers44()
}

fun AppViewModel.transferOwner44(to: AsUser44, password: String) = launch44 {
    p44.ownBusy = true; p44.ownErr = null
    try {
        val body = JSONObject().put("toUserId", to.id)
        if (password.isNotBlank()) body.put("password", password)
        val o = JSONObject(api44 { hlPost("/server/owner/transfer", body) })
        p44.ownSheet = false; p44.ownStep = 0; p44.ownPick = null
        flash(o.s43("message") ?: if (o.has("pending")) "Sendt til eieren for godkjenning (48 t)." else "${to.name} eier nå serveren. Du er fortsatt admin. ${firstName37(to.name)} har fått e-post og varsel.")
        loadOwner44()
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        p44.ownErr = when {
            e.status == 404 -> "Overføring finnes ikke på serveren ennå. Oppdater Homelab."
            e.code == "needs_2fa" || e.message?.contains("2FA", true) == true -> "${firstName37(to.name)} må slå på 2FA først."
            e.status == 401 || e.code == "reauth" -> "Skriv passordet ditt for å bekrefte."
            else -> e.message
        }
    } catch (e: Exception) { p44.ownErr = e.message } finally { p44.ownBusy = false }
}

/* ======================= Oppsettet til en annen bruker (admin) ======================= */

/** «Kopier mitt oppsett hit» / «Tilbakestill til standard» / «X kan endre selv» (PUT …/layout/lock {locked}). */
fun AppViewModel.layoutAct44(u: AsUser44, act: String, locked: Boolean = false) = launch44 {
    try {
        val path = "/users/" + enc44(u.id) + "/layout/" + act
        if (act == "lock") api44 { hlPut(path, JSONObject().put("locked", locked)) } else api44 { hlPost(path) }
        if (act == "lock") { p44.asUsers = p44.asUsers?.map { if (it.id == u.id) it.copy(locked = locked) else it }; p44.asSheet = p44.asSheet?.let { if (it.id == u.id) it.copy(locked = locked) else it } }
        flash(when (act) { "copy-from-me" -> "Oppsettet ditt er kopiert til ${firstName37(u.name)}"; "reset" -> "${firstName37(u.name)} har standardoppsettet"; else -> if (locked) "${firstName37(u.name)} kan ikke endre selv" else "${firstName37(u.name)} kan endre selv" })
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        flash(if (e.status == 404) "Fikk ikke endret: finnes ikke på serveren ennå. Oppdater Homelab." else "Fikk ikke endret: ${e.message}")
    }
}
