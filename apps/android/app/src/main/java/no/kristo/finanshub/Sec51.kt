package no.kristo.finanshub

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.SecureRandom

/*
 * Prompt 51 (APPAND51), punkt 1 – godkjenning av ny enhet (SEC51, $S/SERVER51-API.md):
 *  - Fast, tilfeldig X-Device-Key (32 byte, base64url) og X-Device-Id (flagg, QA51), lagret i EncryptedSharedPreferences («sec51»).
 *    Nøkkelen sendes bare på innlogging/token-kall og på finish (Api.request → Sec51Http.apply), aldri ellers.
 *  - Innlogging fra internett på en ukjent enhet gir 403 {code:'DEVICE_APPROVAL_REQUIRED', approvalId, pollKey, statusUrl, finishUrl}.
 *    Da vises «Venter på godkjenning» (ui/Sec51Ui.kt), statusUrl polles hvert 2,5 s med X-Approval-Key, og finishUrl gir tokenet når
 *    en kjent enhet (eller admin) har godkjent. Avbryt stopper alt. pollKey og token vises aldri og logges aldri.
 *  - Godkjenning fra appen: Innstillinger → Sikkerhet → «Enheter som venter» (Godkjenn krever fingeravtrykk/ansikt/PIN via Bio31,
 *    Avvis gjør det ikke) og «Mine enheter». Varsel «Ny enhet vil logge inn» (data.kind sec51.approval) fra varselkøen (Notify31.kt)
 *    og som banner i appen (ui/Sec51Ui.kt).
 */

const val APPROVAL_CODE51 = "DEVICE_APPROVAL_REQUIRED"

/** Enhetsnøkkel (innlogging) og installasjons-id (flagg). Krypterte prefs; reserve: vanlige private prefs. */
object DeviceIds51 {
    @Volatile var key: String? = null
        private set
    @Volatile var id: String? = null
        private set
    @Volatile var name: String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        private set

    @Volatile private var cached: SharedPreferences? = null

    /** Krypterte prefs åpnes én gang per prosess (Keystore-oppslaget er tregt). */
    private fun prefs(ctx: Context): SharedPreferences = cached ?: synchronized(this) { cached ?: open(ctx).also { cached = it } }

    private fun open(ctx: Context): SharedPreferences = runCatching {
        EncryptedSharedPreferences.create("sec51", MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), ctx.applicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    }.getOrNull() ?: ctx.applicationContext.getSharedPreferences("sec51_plain", Context.MODE_PRIVATE)

    internal fun store(ctx: Context): SharedPreferences = prefs(ctx)

    private fun random(n: Int): String {
        val b = ByteArray(n)
        SecureRandom().nextBytes(b)
        return Base64.encodeToString(b, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }

    /** Leser (eller lager) nøkkel og id. Trygt å kalle flere ganger. */
    fun init(ctx: Context) {
        if (key != null && id != null) return
        val p = prefs(ctx)
        val k = p.getString("deviceKey", null)?.takeIf { Regex("^[A-Za-z0-9_-]{16,128}$").matches(it) } ?: random(32).also { p.edit().putString("deviceKey", it).apply() }
        val i = p.getString("deviceId", null)?.takeIf { Regex("^[A-Za-z0-9_-]{8,64}$").matches(it) } ?: ("and" + random(18)).also { p.edit().putString("deviceId", it).apply() }
        key = k; id = i
    }
}

/** Headere fra Api.request: X-Device-Key bare på innlogging/token, X-Device-Id/-Name/-Platform bare på /api/flags. */
object Sec51Http {
    private fun auth(prefix: String, path: String): Boolean {
        val p = path.substringBefore('?')
        return when (prefix) {
            Api.FINANS -> p == "/login" || p.startsWith("/auth/")
            Api.HOMELAB -> p == "/login" || p.startsWith("/auth/") && p != "/auth/logout"
            else -> false
        }
    }

    fun apply(conn: HttpURLConnection, prefix: String, path: String) {
        if (auth(prefix, path)) DeviceIds51.key?.let { conn.setRequestProperty("X-Device-Key", it) }
        if (prefix == Api.HOMELAB && path.substringBefore('?') == "/flags") {
            DeviceIds51.id?.let { conn.setRequestProperty("X-Device-Id", it) }
            conn.setRequestProperty("X-Device-Name", ascii51(DeviceIds51.name).take(60))
            conn.setRequestProperty("X-Client-Platform", "android")
        }
    }
}

/** Headere må være ASCII. */
internal fun ascii51(s: String): String = s.map { if (it.code in 32..126) it else '?' }.joinToString("")

/** En innlogging som venter på godkjenning. pollKey vises aldri. */
data class Wait51(
    val server: String, val id: String, internal val pollKey: String, val statusUrl: String, val finishUrl: String,
    val device: String, val expiresAt: String?, val state: String = "pending", val note: String? = null,
)

/** Én forespørsel i lista (GET /api/security51/approvals). */
data class Approval51(
    val id: String, val userName: String, val device: String, val ip: String, val country: String, val methodLabel: String,
    val createdAt: String, val expiresAt: String, val state: String,
)

/** Én kjent enhet (GET /api/security51/devices). */
data class Device51(val id: String, val name: String, val kind: String, val approved: Boolean, val approvedByName: String, val lastSeen: String, val lastCountry: String, val current: Boolean)

class Sec51State {
    var wait by mutableStateOf<Wait51?>(null)
    var approvals by mutableStateOf<List<Approval51>?>(null)
    var devices by mutableStateOf<List<Device51>?>(null)
    var error by mutableStateOf<String?>(null)
    var busy by mutableStateOf<String?>(null)
    /** Banner «Ny enhet vil logge inn» er lukket for disse id-ene. */
    var dismissed by mutableStateOf<Set<String>>(emptySet())
    internal var job: kotlinx.coroutines.Job? = null
}

internal fun approvalOf51(o: JSONObject) = Approval51(
    o.optString("id"), o.optString("userName"), o.optString("device").ifBlank { "Ukjent enhet" }, o.optString("ip"),
    o.optString("countryName").ifBlank { o.optString("country") }, o.optString("methodLabel").ifBlank { o.optString("method") },
    o.optString("createdAt"), o.optString("expiresAt"), o.optString("state"),
)

/* ---------------- Liten HTTP-klient for statusUrl/finishUrl (egne headere, ingen token) ---------------- */

private class Http51(val status: Int, val body: JSONObject?)

private suspend fun http51(base: String, method: String, path: String, pollKey: String, json: JSONObject? = null): Http51 = withContext(Dispatchers.IO) {
    // Bare stier på samme server (aldri en vilkårlig adresse fra svaret).
    require(path.startsWith("/api/security51/approvals/")) { "Ugyldig adresse" }
    val conn = URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection
    try {
        conn.requestMethod = method
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("X-Approval-Key", pollKey)
        DeviceIds51.key?.let { conn.setRequestProperty("X-Device-Key", it) }
        if (json != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            conn.outputStream.use { it.write(json.toString().toByteArray()) }
        }
        val code = conn.responseCode
        val txt = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        Http51(code, runCatching { JSONObject(txt) }.getOrNull())
    } finally { conn.disconnect() }
}

/* ---------------- Innlogging som venter ---------------- */

/** Fra AppViewModel.login: 403 DEVICE_APPROVAL_REQUIRED. */
fun AppViewModel.startApproval51(server: String, body: JSONObject?) {
    val b = body
    val id = b?.optString("approvalId").orEmpty()
    val key = b?.optString("pollKey").orEmpty()
    val st = b?.optString("statusUrl").orEmpty().ifBlank { if (id.isNotBlank()) "/api/security51/approvals/$id/status" else "" }
    val fin = b?.optString("finishUrl").orEmpty().ifBlank { if (id.isNotBlank()) "/api/security51/approvals/$id/finish" else "" }
    if (id.isBlank() || key.isBlank() || st.isBlank()) { message = b?.optString("error")?.takeIf { it.isNotBlank() } ?: "Ny enhet må godkjennes. Logg inn fra en kjent enhet først."; return }
    sec51.wait = Wait51(server, id, key, st, fin, b?.optString("device").orEmpty(), b?.optString("expiresAt")?.takeIf { it.isNotBlank() })
    pollApproval51()
}

fun AppViewModel.cancelApproval51() {
    sec51.job?.cancel(); sec51.job = null
    sec51.wait = null
}

/** Prøv igjen etter avvist/utløpt: tilbake til innloggingen. */
fun AppViewModel.retryApproval51() = cancelApproval51()

private fun AppViewModel.pollApproval51() {
    sec51.job?.cancel()
    sec51.job = launchJob51 {
        var fails = 0
        var base = sec51.wait?.server ?: return@launchJob51
        while (true) {
            val w = sec51.wait ?: return@launchJob51
            val r = try { http51(base, "GET", w.statusUrl, w.pollKey) } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
            if (r == null) {
                fails++
                // Ekstern svarer ikke: prøv den lokale standardadressen hvis den er vår server (samme som innloggingen, P47.kt).
                if (fails == 2) loginVia47(w.server)?.let { base = it }
                if (sec51.wait?.id == w.id) sec51.wait = w.copy(note = "Får ikke kontakt med serveren – prøver igjen …")
                delay(if (fails < 5) 3_000L else 10_000L)
                continue
            }
            fails = 0
            val state = when (r.status) {
                404, 410 -> "expired"
                else -> r.body?.optString("state")?.ifBlank { null } ?: if (r.status >= 400) "error" else "pending"
            }
            when (state) {
                "approved" -> { finishApproval51(base, w); return@launchJob51 }
                "denied", "expired" -> { if (sec51.wait?.id == w.id) sec51.wait = w.copy(state = state, note = null); return@launchJob51 }
                "error" -> if (sec51.wait?.id == w.id) sec51.wait = w.copy(note = r.body?.optString("error")?.takeIf { it.isNotBlank() } ?: "Feil ${r.status} – prøver igjen …")
                else -> if (sec51.wait?.id == w.id && (w.note != null || w.state != "pending")) sec51.wait = w.copy(state = "pending", note = null)
            }
            delay(2_500L)
        }
    }
}

/** POST finishUrl → {token, user} → kontoen legges til som ved vanlig innlogging. */
private suspend fun AppViewModel.finishApproval51(base: String, w: Wait51) {
    var tries = 0
    while (tries < 6) {
        tries++
        val r = try { http51(base, "POST", w.finishUrl, w.pollKey, JSONObject().put("device", DeviceIds51.name).put("deviceName", DeviceIds51.name)) }
            catch (e: CancellationException) { throw e } catch (_: Exception) { null }
        if (r == null) { delay(3_000L); continue }
        when (r.status) {
            in 200..299 -> {
                val o = r.body ?: JSONObject()
                val token = o.optString("token").takeIf { it.isNotBlank() }
                if (token == null) { sec51.wait = w.copy(state = "error", note = "Uventet svar fra serveren. Logg inn på nytt."); return }
                val u = o.optJSONObject("user")
                val uname = u?.optString("username").orEmpty()
                val name = u?.optString("name")?.takeIf { it.isNotBlank() } ?: uname.ifBlank { "FinansHub" }
                val role = u?.optString("role")?.takeIf { it.isNotBlank() } ?: "user"
                sec51.wait = null
                sec51.job = null
                addAccount51(w.server, LoginResult(token, uname, name, role))
                return
            }
            409 -> delay(2_000L) // godkjent, men ikke klar ennå
            403 -> { sec51.wait = w.copy(state = "denied", note = null); return }
            404, 410 -> { sec51.wait = w.copy(state = "expired", note = null); return }
            else -> { sec51.wait = w.copy(state = "error", note = r.body?.optString("error")?.takeIf { it.isNotBlank() } ?: "Feil ${r.status}"); return }
        }
    }
    sec51.wait = w.copy(state = "error", note = "Fikk ikke fullført innloggingen. Prøv igjen.")
}

/* ---------------- Godkjenning fra appen (Innstillinger → Sikkerhet) ---------------- */

fun AppViewModel.loadApprovals51() = launch51 {
    try {
        val a = JSONObject(api51 { hlGet("/security51/approvals") }).optJSONArray("approvals")
        val list = ArrayList<Approval51>()
        if (a != null) for (i in 0 until a.length()) a.optJSONObject(i)?.let { list += approvalOf51(it) }
        sec51.approvals = list
        sec51.error = null
        // Varsel for nye som venter (i tillegg til varselkøen), én gang per id.
        list.filter { it.state == "pending" }.forEach { runCatching { Sec51Notify.once(appCtx51, it) } }
    } catch (e: ApiException) {
        sec51.approvals = sec51.approvals ?: emptyList()
        if (e.status != 404 && e.message?.startsWith(Api.TOKEN_REFUSED) != true) sec51.error = e.message
    }
}

fun AppViewModel.loadDevices51() = launch51 {
    try {
        val a = JSONObject(api51 { hlGet("/security51/devices") }).optJSONArray("devices")
        val list = ArrayList<Device51>()
        if (a != null) for (i in 0 until a.length()) a.optJSONObject(i)?.let { o ->
            list += Device51(o.optString("id"), o.optString("name").ifBlank { "Ukjent enhet" }, o.optString("kind"), o.optBoolean("approved"),
                o.optString("approvedByName"), o.optString("lastSeen"), o.optString("lastCountry"), o.optBoolean("current"))
        }
        sec51.devices = list
    } catch (e: ApiException) { sec51.devices = sec51.devices ?: emptyList() }
}

/** Godkjenn (etter biometri i UI-et) eller avvis. */
fun AppViewModel.decideApproval51(id: String, approve: Boolean) = launch51 {
    sec51.busy = id
    try {
        api51 { hlPost("/security51/approvals/" + URLEncoder.encode(id, "UTF-8"), JSONObject().put("approve", approve)) }
        Haptics.success()
        message = if (approve) "Enheten er godkjent" else "Enheten er avvist"
        Sec51Notify.cancel(appCtx51, id)
        sec51.dismissed = sec51.dismissed + id
    } catch (e: ApiException) {
        message = when (e.status) { 409 -> "Allerede behandlet"; 410 -> "Forespørselen er utløpt"; 403 -> "Bare kontoens eier eller admin kan godkjenne"; else -> e.message }
        Haptics.error()
    } finally {
        sec51.busy = null
        loadApprovals51()
    }
}

fun AppViewModel.removeDevice51(id: String) = launch51 {
    sec51.busy = id
    try {
        api51 { hlDelete("/security51/devices/" + URLEncoder.encode(id, "UTF-8")) }
        message = "Enheten er fjernet. Den må godkjennes på nytt neste gang fra internett."
    } finally { sec51.busy = null; loadDevices51() }
}

/* ---------------- Varsel «Ny enhet vil logge inn» ---------------- */

object Sec51Notify {
    private const val CH = "sikkerhet51"

    private fun channel(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CH) == null) nm.createNotificationChannel(NotificationChannel(CH, "Sikkerhet", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Nye enheter som vil logge inn, og innlogging fra nytt land"
        })
    }

    private fun allowed(ctx: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) &&
            ctx.getSharedPreferences("notify_prefs", Context.MODE_PRIVATE).getBoolean("on", true)

    private fun icon(ctx: Context): Int = ctx.resources.getIdentifier("ic_launcher_monochrome", "drawable", ctx.packageName).takeIf { it != 0 } ?: ctx.applicationInfo.icon

    private fun nid(id: String) = ("sec51-$id").hashCode()

    /** Varsel som åpner Innstillinger → Sikkerhet. */
    fun show(ctx: Context, title: String, body: String, approvalId: String) {
        if (!allowed(ctx)) return
        channel(ctx)
        val i = Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://settings/security")).setPackage(ctx.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        val pi = PendingIntent.getActivity(ctx, nid(approvalId), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(ctx, CH).setSmallIcon(icon(ctx)).setContentTitle(title).setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body)).setAutoCancel(true).setContentIntent(pi)
            .setCategory(Notification.CATEGORY_STATUS).setColor(0xFFB23A2A.toInt())
            .addAction(Notification.Action.Builder(null, "Se forespørselen", pi).build())
            .build()
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(nid(approvalId), n) } catch (_: SecurityException) {}
        ctx.getSharedPreferences("sec51_seen", Context.MODE_PRIVATE).edit().putLong(approvalId, System.currentTimeMillis()).apply()
    }

    fun cancel(ctx: Context, approvalId: String) { runCatching { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(nid(approvalId)) } }

    private fun seen(ctx: Context, id: String): Boolean = ctx.getSharedPreferences("sec51_seen", Context.MODE_PRIVATE).contains(id)

    /** Fra lista: bare én gang per forespørsel, og ikke mens appen er åpen (da vises banneret). */
    fun once(ctx: Context, a: Approval51) {
        if (seen(ctx, a.id)) return
        if (Notify31.isForeground(ctx)) { ctx.getSharedPreferences("sec51_seen", Context.MODE_PRIVATE).edit().putLong(a.id, System.currentTimeMillis()).apply(); return }
        show(ctx, "Ny enhet vil logge inn", listOf(a.device, a.countryOrIp()).filter { it.isNotBlank() }.joinToString(" · "), a.id)
    }

    /** Fra varselkøen (pending31): data.kind == 'sec51.approval'. true = håndtert. */
    fun pending(ctx: Context, x: JSONObject): Boolean {
        val d = x.optJSONObject("data") ?: return false
        if (d.optString("kind") != "sec51.approval") return false
        val id = d.optString("approvalId").ifBlank { x.optString("id") }
        if (id.isBlank() || seen(ctx, id)) return true
        show(ctx, x.optString("title").ifBlank { "Ny enhet vil logge inn" }, x.optString("body").ifBlank { "Godkjenn eller avvis i Innstillinger → Sikkerhet." }, id)
        return true
    }
}

internal fun Approval51.countryOrIp(): String = country.ifBlank { ip }
