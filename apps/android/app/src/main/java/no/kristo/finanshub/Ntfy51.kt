package no.kristo.finanshub

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/*
 * Prompt 51 (APPAND51), punkt 5 – ntfy (OBS51), bare FinansHub Android:
 *  - Valgfri bryter «Varsler via ntfy (hjemmeserver)» i Innstillinger → Varsler (ui/Sec51Ui.kt). På: GET /api/me/ntfy51, finn eller lag
 *    emnet for denne enheten (POST /api/me/ntfy51/topics {device}), lagre subscribeUrl kryptert (DeviceIds51.store) og start
 *    Ntfy51Service. Av: tjenesten stoppes og emnet slettes på serveren.
 *  - Ntfy51Service er en forgrunnstjeneste (type remoteMessaging på Android 14+) med et lavprioritets, varig varsel. Den holder én
 *    strøm mot <subscribeUrl>/json (ntfy sender keepalive hvert ~45 s), viser meldingene som vanlige varsler i riktig kanal
 *    («Hent meg» → sjekkinn-hast, ellers egne kanaler etter prioritet) og husker siste meldings-id (since=) så ingenting går tapt
 *    ved brudd. Kobler til på nytt med eksponentiell backoff (2 s → 5 min), straks nettet kommer tilbake.
 *  - Batterisparing: med strømsparing på holdes ingen strøm åpen; i stedet hentes nye meldinger (poll=1&since=) hvert 15. min, og
 *    strømmen startes igjen når strømsparingen slås av. Ingen wakelocks.
 *  - Varselkøen (Notify31Worker, hvert 15. min) hopper over et varsel ntfy allerede har vist (Ntfy51.seen), så det ikke kommer to ganger.
 *  - ntfy er bare på hjemmenettet (NTFY_PUBLIC_URL). Klartekst-http er bare tillatt til hjemmeserveren (network_security_config).
 */

object Ntfy51 {
    private const val P_ON = "ntfy51_on"
    private const val P_URL = "ntfy51_url"
    private const val P_TOPIC = "ntfy51_topic"
    private const val P_SINCE = "ntfy51_since"
    private const val P_ACCT = "ntfy51_acct"

    /** Status for Innstillinger (skrives fra tjenesten). */
    var status by mutableStateOf("Av")
    var connected by mutableStateOf(false)

    fun on(ctx: Context): Boolean = runCatching { DeviceIds51.store(ctx).getBoolean(P_ON, false) }.getOrDefault(false)
    internal fun url(ctx: Context): String? = runCatching { DeviceIds51.store(ctx).getString(P_URL, null) }.getOrNull()?.takeIf { it.startsWith("http") }
    internal fun topicId(ctx: Context): String? = runCatching { DeviceIds51.store(ctx).getString(P_TOPIC, null) }.getOrNull()
    internal fun account(ctx: Context): String? = runCatching { DeviceIds51.store(ctx).getString(P_ACCT, null) }.getOrNull()
    internal fun since(ctx: Context): String? = ctx.getSharedPreferences("ntfy51", Context.MODE_PRIVATE).getString(P_SINCE, null)
    internal fun setSince(ctx: Context, id: String) = ctx.getSharedPreferences("ntfy51", Context.MODE_PRIVATE).edit().putString(P_SINCE, id).apply()

    internal fun save(ctx: Context, on: Boolean, url: String?, topic: String?, acct: String?) {
        DeviceIds51.store(ctx).edit().putBoolean(P_ON, on).putString(P_URL, url).putString(P_TOPIC, topic).putString(P_ACCT, acct).apply()
        if (!on) ctx.getSharedPreferences("ntfy51", Context.MODE_PRIVATE).edit().remove(P_SINCE).apply()
    }

    /** Starter eller stopper tjenesten etter valget. */
    fun sync(ctx: Context) {
        val app = ctx.applicationContext
        val i = Intent(app, Ntfy51Service::class.java)
        if (on(app) && url(app) != null) runCatching { app.startForegroundService(i) }.onFailure { status = "Kunne ikke starte (åpne appen)" }
        else { runCatching { app.stopService(i) }; status = "Av"; connected = false }
    }

    /* ---------- Duplikater mot varselkøen ---------- */

    private fun norm(s: String) = s.replace(Regex("\\s+"), " ").trim().lowercase().take(60)

    /** Husker hva ntfy viste (30 min), så pending31 ikke viser det samme på nytt. */
    internal fun remember(ctx: Context, title: String, body: String) {
        val sp = ctx.getSharedPreferences("ntfy51", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val keep = (sp.getString("recent", "") ?: "").split('\n').filter { it.isNotBlank() }
            .filter { (it.substringBefore('|').toLongOrNull() ?: 0L) > now - 30 * 60_000L }.takeLast(40)
        sp.edit().putString("recent", (keep + "$now|${norm(title)}|${norm(body)}").joinToString("\n")).apply()
    }

    /** Har ntfy allerede vist dette varselet (tittel + begynnelsen av teksten)? */
    fun seen(ctx: Context, x: JSONObject): Boolean {
        if (!on(ctx)) return false
        val t = norm(x.optString("title"))
        val b = norm(x.optString("body").ifBlank { x.optString("text") })
        if (t.isEmpty()) return false
        val now = System.currentTimeMillis()
        return (ctx.getSharedPreferences("ntfy51", Context.MODE_PRIVATE).getString("recent", "") ?: "").split('\n').any { line ->
            val p = line.split('|')
            p.size >= 3 && (p[0].toLongOrNull() ?: 0L) > now - 30 * 60_000L && p[1] == t && (b.isEmpty() || p[2].isEmpty() || p[2].startsWith(b.take(30)) || b.startsWith(p[2].take(30)))
        }
    }

    /* ---------- Varsler ---------- */

    const val CH_FG = "ntfy51_tilkobling"
    const val CH_LOW = "ntfy51_lav"
    const val CH_NORMAL = "ntfy51"
    const val CH_DRIFT = "ntfy51_drift"
    const val CH_CRIT = "ntfy51_kritisk"
    /** Samme kanal som «Hent meg» i Sjekk inn (P50Fam.kt, Checkin50Notify.CH_HIGH). */
    const val CH_PICKUP = "sjekkinn-hast"

    internal fun channels(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        fun mk(id: String, name: String, imp: Int, desc: String, block: NotificationChannel.() -> Unit = {}) {
            if (nm.getNotificationChannel(id) == null) nm.createNotificationChannel(NotificationChannel(id, name, imp).apply { description = desc; block() })
        }
        mk(CH_FG, "ntfy · tilkobling", NotificationManager.IMPORTANCE_MIN, "Det varige varselet mens appen lytter etter ntfy-varsler") { setShowBadge(false) }
        mk(CH_LOW, "ntfy · lav prioritet", NotificationManager.IMPORTANCE_LOW, "Glimt og andre stille varsler via ntfy")
        mk(CH_NORMAL, "ntfy · varsler", NotificationManager.IMPORTANCE_DEFAULT, "Varsler fra Homelab via ntfy på hjemmenettet")
        mk(CH_DRIFT, "ntfy · drift", NotificationManager.IMPORTANCE_HIGH, "Driftsvarsler (disk, containere, Ollama)")
        mk(CH_CRIT, "ntfy · kritisk", NotificationManager.IMPORTANCE_HIGH, "Kritiske varsler") { enableVibration(true) }
        mk(CH_PICKUP, "Sjekk inn · Hent meg (haster)", NotificationManager.IMPORTANCE_HIGH, "«Hent meg» fra familien – tidskritisk, med posisjon") {
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 600)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            runCatching { setBypassDnd(true) }
        }
    }

    private fun icon(ctx: Context): Int = ctx.resources.getIdentifier("ic_launcher_monochrome", "drawable", ctx.packageName).takeIf { it != 0 } ?: ctx.applicationInfo.icon

    private fun allowed(ctx: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) &&
            ctx.getSharedPreferences("notify_prefs", Context.MODE_PRIVATE).getBoolean("on", true)

    /** Adressen i ntfy-meldingen (click) → lenke i appen. */
    internal fun linkFor(click: String?): String {
        val u = click.orEmpty().lowercase()
        return when {
            u.isBlank() -> "finanshub://homelab"
            u.contains("sikkerhet") -> "finanshub://settings/security"
            u.contains("familie") || u.contains("sjekk") -> "finanshub://familie/sjekk"
            u.contains("/chat/") -> "finanshub://chat/" + click.orEmpty().substringAfterLast("/chat/").substringBefore('?')
            u.contains("system") || u.contains("oppdater") -> "finanshub://nordlys"
            u.contains("sporing") || u.contains("pakke") -> "finanshub://tracking"
            u.contains("abo") || u.contains("subscriptions") -> "finanshub://subs"
            u.contains("kalender") -> "finanshub://kalender"
            u.contains("media") -> "finanshub://media"
            else -> "finanshub://homelab"
        }
    }

    /** En ntfy-melding {id, event:'message', title, message, priority, tags, click} som vanlig varsel. */
    internal fun show(ctx: Context, m: JSONObject) {
        val title = m.optString("title").ifBlank { "Homelab" }
        val body = m.optString("message")
        if (body.isBlank() && m.optString("title").isBlank()) return
        val pr = m.optInt("priority", 3)
        val click = m.optString("click").takeIf { it.isNotBlank() }
        val pickup = pr >= 5 && (title.contains("Hent meg", true) || body.contains("Hent meg", true) || click?.contains("familie", true) == true)
        val ch = when {
            pickup -> CH_PICKUP
            pr >= 5 -> CH_CRIT
            pr == 4 -> CH_DRIFT
            pr <= 2 -> CH_LOW
            else -> CH_NORMAL
        }
        remember(ctx, title, body)
        if (!allowed(ctx)) return
        channels(ctx)
        val link = linkFor(click)
        val nid = ("ntfy51-" + m.optString("id").ifBlank { (title + body).hashCode().toString() }).hashCode()
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(ctx.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        val pi = PendingIntent.getActivity(ctx, nid, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val b = Notification.Builder(ctx, ch).setSmallIcon(icon(ctx)).setContentTitle(title).setContentText(body.ifBlank { title })
            .setStyle(Notification.BigTextStyle().bigText(body.ifBlank { title })).setAutoCancel(true).setContentIntent(pi)
            .setWhen(m.optLong("time", System.currentTimeMillis() / 1000) * 1000).setShowWhen(true)
            .setGroup("ntfy51")
        if (pickup) b.setCategory(Notification.CATEGORY_ALARM).setColor(0xFFB23A2A.toInt())
        else if (pr >= 4) b.setCategory(Notification.CATEGORY_STATUS)
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(nid, b.build()) } catch (_: SecurityException) {}
    }
}

/* ---------------- Bryteren (AppViewModel) ---------------- */

class Ntfy51State {
    var on by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var help by mutableStateOf<String?>(null)
    var serverEnabled by mutableStateOf<Boolean?>(null)
}

private fun deviceLabel51(): String = "Android · ${DeviceIds51.name}".take(60)

/** Leser serverens status (Innstillinger → Varsler). */
fun AppViewModel.loadNtfy51() = launch51 {
    ntfy51.on = Ntfy51.on(appCtx51)
    try {
        val o = JSONObject(api51 { hlGet("/me/ntfy51") })
        ntfy51.serverEnabled = o.optBoolean("enabled")
        ntfy51.help = o.optString("help").takeIf { it.isNotBlank() }
        // Emnet er slettet fra web: slå av her også.
        val tid = Ntfy51.topicId(appCtx51)
        val a = o.optJSONArray("topics")
        if (ntfy51.on && tid != null && a != null && (0 until a.length()).none { a.optJSONObject(it)?.optString("id") == tid }) {
            Ntfy51.save(appCtx51, false, null, null, null); Ntfy51.sync(appCtx51); ntfy51.on = false
            ntfy51.error = "Emnet for denne enheten er fjernet. Slå på igjen for å få et nytt."
        }
    } catch (e: ApiException) {
        ntfy51.serverEnabled = if (e.status == 404) false else ntfy51.serverEnabled
        if (e.status == 404) ntfy51.help = "Serveren har ikke ntfy ennå. Oppdater homelab."
    }
}

fun AppViewModel.setNtfy51(on: Boolean) = launch51 {
    if (ntfy51.busy) return@launch51
    ntfy51.busy = true
    ntfy51.error = null
    val ctx = appCtx51
    try {
        if (on) {
            val st = JSONObject(api51 { hlGet("/me/ntfy51") })
            if (!st.optBoolean("enabled")) { ntfy51.error = st.optString("help").ifBlank { "ntfy er ikke satt opp på serveren (NTFY_URL i .env)." }; return@launch51 }
            val label = deviceLabel51()
            val a = st.optJSONArray("topics")
            var t: JSONObject? = null
            if (a != null) for (i in 0 until a.length()) a.optJSONObject(i)?.takeIf { it.optString("device") == label }?.let { t = it }
            if (t == null) t = JSONObject(api51 { hlPost("/me/ntfy51/topics", JSONObject().put("device", label)) }).optJSONObject("topic")
            val tt = t
            val sub = tt?.optString("subscribeUrl")?.takeIf { it.startsWith("http") }
                ?: st.optString("publicUrl").takeIf { it.startsWith("http") }?.let { pu -> tt?.optString("topic")?.takeIf { it.isNotBlank() }?.let { pu.trimEnd('/') + "/" + it } }
            if (tt == null || sub == null) { ntfy51.error = "Serveren mangler den offentlige ntfy-adressen (NTFY_PUBLIC_URL i .env)."; return@launch51 }
            if (cleartextBlocked47(sub)) { ntfy51.error = "ntfy-adressen ($sub) må være https eller ligge på hjemmeserveren (${DEFAULT_LOCAL47.substringAfter("://").substringBefore(':')})."; return@launch51 }
            Ntfy51.save(ctx, true, sub.trimEnd('/'), tt.optString("id"), activeId)
            Ntfy51.sync(ctx)
            ntfy51.on = true
            message = "Varsler via ntfy er på"
        } else {
            val tid = Ntfy51.topicId(ctx)
            Ntfy51.save(ctx, false, null, null, null)
            Ntfy51.sync(ctx)
            ntfy51.on = false
            if (tid != null) runCatching { api51 { hlDelete("/me/ntfy51/topics/" + URLEncoder.encode(tid, "UTF-8")) } }
        }
    } catch (e: ApiException) {
        ntfy51.error = if (e.status == 404) "Serveren har ikke ntfy ennå. Oppdater homelab." else e.message
    } finally { ntfy51.busy = false }
}

fun AppViewModel.testNtfy51() = launch51 {
    try {
        val o = JSONObject(api51 { hlPost("/me/ntfy51/test") })
        message = if (o.optInt("sent") > 0) "Testvarsel sendt" else "Ingen emner tok imot testvarselet"
    } catch (e: ApiException) {
        message = when (e.status) { 400 -> "Ingen emner – slå på ntfy først"; 502 -> "ntfy-serveren svarer ikke"; else -> e.message }
    }
}

/* ---------------- Tjenesten ---------------- */

class Ntfy51Service : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val kick = Channel<Unit>(Channel.CONFLATED)
    @Volatile private var conn: HttpURLConnection? = null
    private var netCb: ConnectivityManager.NetworkCallback? = null
    private var powerRx: BroadcastReceiver? = null
    private var started = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        runCatching { Crash51.install(this) }
        runCatching { DeviceIds51.init(this) }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Ntfy51.on(this) || Ntfy51.url(this) == null) { stopSelf(); return START_NOT_STICKY }
        try { foreground() } catch (e: Exception) {
            // Android 12+: forgrunnstjeneste kan ikke startes fra bakgrunnen i alle tilfeller. Prøves igjen når appen åpnes.
            Ntfy51.status = "Venter – åpne appen for å koble til"
            stopSelf(); return START_NOT_STICKY
        }
        if (!started) { started = true; watch(); scope.launch { loop() } } else kick.trySend(Unit)
        return START_STICKY
    }

    private fun foreground() {
        Ntfy51.channels(this)
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let { PendingIntent.getActivity(this, 5101, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
        val n = Notification.Builder(this, Ntfy51.CH_FG)
            .setSmallIcon(resources.getIdentifier("ic_launcher_monochrome", "drawable", packageName).takeIf { it != 0 } ?: applicationInfo.icon)
            .setContentTitle("Varsler via ntfy")
            .setContentText("Lytter etter varsler fra hjemmeserveren")
            .setOngoing(true).setShowWhen(false).setCategory(Notification.CATEGORY_SERVICE)
            .apply { if (open != null) setContentIntent(open) }
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(5101, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING) else startForeground(5101, n)
    }

    private fun powerSave(): Boolean = (getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isPowerSaveMode == true

    private fun online(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true
        val n = cm.activeNetwork ?: return false
        return cm.getNetworkCapabilities(n)?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    /** Nett tilbake eller strømsparing endret: bryt ventetid/strøm og vurder på nytt. */
    private fun watch() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { kick.trySend(Unit) }
            override fun onLost(network: Network) { runCatching { conn?.disconnect() } }
        }
        runCatching { cm?.registerDefaultNetworkCallback(cb); netCb = cb }
        val rx = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) { runCatching { conn?.disconnect() }; kick.trySend(Unit) }
        }
        runCatching { registerReceiver(rx, IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)); powerRx = rx }
    }

    private suspend fun pause(ms: Long) { withTimeoutOrNull(ms) { kick.receive() } }

    private suspend fun loop() {
        var backoff = 2_000L
        while (scope.isActive) {
            val url = Ntfy51.url(this) ?: break
            if (!Ntfy51.on(this)) break
            if (!online()) { Ntfy51.connected = false; Ntfy51.status = "Venter på nett"; pause(5 * 60_000L); continue }
            if (powerSave()) {
                Ntfy51.connected = false
                Ntfy51.status = "Strømsparing: henter hvert 15. min"
                runCatching { poll(url) }
                pause(15 * 60_000L)
                continue
            }
            val ok = try { stream(url) { backoff = 2_000L } } catch (e: CancellationException) { throw e } catch (_: Exception) { false }
            Ntfy51.connected = false
            if (!scope.isActive) break
            Ntfy51.status = if (ok) "Kobler til igjen …" else "Får ikke kontakt med ntfy – prøver igjen om ${backoff / 1000} s"
            pause(backoff)
            backoff = (backoff * 2).coerceAtMost(5 * 60_000L)
        }
        Ntfy51.connected = false
        stopSelf()
    }

    private fun q(since: String?, poll: Boolean): String {
        val p = ArrayList<String>()
        if (poll) p += "poll=1"
        p += "since=" + URLEncoder.encode(since ?: if (poll) "15m" else "1m", "UTF-8")
        return "?" + p.joinToString("&")
    }

    private fun handleLine(line: String) {
        val o = runCatching { JSONObject(line) }.getOrNull() ?: return
        if (o.optString("event") != "message") return
        val id = o.optString("id")
        if (id.isNotBlank()) Ntfy51.setSince(this, id)
        runCatching { Ntfy51.show(this, o) }
    }

    /** Henter det som har kommet (strømsparing). */
    private fun poll(url: String) {
        val c = URL(url.trimEnd('/') + "/json" + q(Ntfy51.since(this), true)).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 15_000; c.readTimeout = 30_000
            c.setRequestProperty("Accept", "application/x-ndjson")
            if (c.responseCode !in 200..299) { Ntfy51.status = "ntfy svarte ${c.responseCode}"; return }
            c.inputStream.bufferedReader().useLines { seq -> seq.forEach { handleLine(it) } }
        } finally { c.disconnect() }
    }

    /** Holder strømmen åpen til den brytes. true = var tilkoblet (rask ny tilkobling). */
    private fun stream(url: String, onOpen: () -> Unit): Boolean {
        val c = URL(url.trimEnd('/') + "/json" + q(Ntfy51.since(this), false)).openConnection() as HttpURLConnection
        conn = c
        try {
            c.connectTimeout = 15_000
            c.readTimeout = 120_000 // keepalive hvert ~45 s; uteblir to, er forbindelsen død
            c.setRequestProperty("Accept", "application/x-ndjson")
            val code = c.responseCode
            if (code !in 200..299) { Ntfy51.status = "ntfy svarte $code"; return false }
            onOpen()
            Ntfy51.connected = true
            Ntfy51.status = "Tilkoblet"
            c.inputStream.bufferedReader().use { r ->
                while (true) {
                    val line = r.readLine() ?: break
                    if (line.isNotBlank()) handleLine(line)
                }
            }
            return true
        } finally { conn = null; c.disconnect() }
    }

    override fun onDestroy() {
        runCatching { conn?.disconnect() }
        runCatching { netCb?.let { (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(it) } }
        runCatching { powerRx?.let { unregisterReceiver(it) } }
        scope.cancel()
        Ntfy51.connected = false
        if (!Ntfy51.on(this)) Ntfy51.status = "Av"
        super.onDestroy()
    }
}

/** Etter omstart av telefonen eller oppdatering av appen: start ntfy-tjenesten igjen når den er på. */
class Ntfy51Boot : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) runCatching { Ntfy51.sync(ctx) }
    }
}
