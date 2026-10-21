package no.kristo.kalender

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlin.coroutines.coroutineContext

/*
 * Prompt 43: Kalender for Android – oppsett på stor skjerm og oppdatering fra appen.
 *
 * Oppsett (fasit Kalender Oppsett Stor Skjerm.dc.html 1b, Kalender App.dc.html → Innstillinger → Generelt):
 *   kal_wide_layout = tlf | delt | full (standard full), per enhet. Steg 2 av 2 etter innlogging når vinduet er ≥ 600 dp,
 *   én gang per enhet og igjen etter Logg ut. Smalere enn 600 dp (Fold sammenbrettet): telefonoppsett uten å endre valget.
 *
 * Oppdatering (fasit Kalender Oppdatering.dc.html variant android, «Valg» i kontrakten – ingen Sparkle/ny avhengighet):
 *   GET <server>/api/apps/kalender/latest?platform=android&channel=stabil|beta → {version, build, size, url, sha256, notes[]}
 *   → last ned APK til cache (fremdrift, Avbryt) → SHA-256 må stemme, og signeringssertifikatet må være det samme som den
 *   installerte appen (getPackageArchiveInfo GET_SIGNING_CERTIFICATES), ellers slettes fila → PackageInstaller-økt
 *   (REQUEST_INSTALL_PACKAGES). Systemet spør «Vil du installere en oppdatering av denne eksisterende appen?».
 *   Første gang: én linje forklaring + «Installer ukjente apper» for Kalender (ACTION_MANAGE_UNKNOWN_APP_SOURCES).
 *   Bakgrunn: WorkManager én gang om dagen; «Last ned i bakgrunnen på Wi-Fi» (UNMETERED) → varsel «Kalender 1.1 er klar · Installer».
 */

object Kal43Prefs {
    private fun p(ctx: Context) = ctx.getSharedPreferences("kal43", Context.MODE_PRIVATE)

    fun normalized(v: String?): String = when (v) { "tlf", "telefon", "phone" -> "tlf"; "delt", "split" -> "delt"; else -> "full" }
    fun wideLay(ctx: Context): String = normalized(p(ctx).getString("kal_wide_layout", "full"))
    fun setWideLay(ctx: Context, v: String) { p(ctx).edit().putString("kal_wide_layout", normalized(v)).apply() }
    fun layDone(ctx: Context): Boolean = p(ctx).getBoolean("lay_done", false)
    fun setLayDone(ctx: Context, v: Boolean) { p(ctx).edit().putBoolean("lay_done", v).apply() }

    fun auto(ctx: Context): Boolean = p(ctx).getBoolean("upd_auto", true)
    fun autoDl(ctx: Context): Boolean = p(ctx).getBoolean("upd_autodl", true)
    fun channel(ctx: Context): String = p(ctx).getString("upd_ch", "stabil") ?: "stabil"
    fun lastCheck(ctx: Context): Long = p(ctx).getLong("upd_last", 0L)
    fun setAuto(ctx: Context, v: Boolean) { p(ctx).edit().putBoolean("upd_auto", v).apply() }
    fun setAutoDl(ctx: Context, v: Boolean) { p(ctx).edit().putBoolean("upd_autodl", v).apply() }
    fun setChannel(ctx: Context, v: String) { p(ctx).edit().putString("upd_ch", v).apply() }
    fun setLastCheck(ctx: Context, v: Long) { p(ctx).edit().putLong("upd_last", v).apply() }
    fun expect(ctx: Context): Long = p(ctx).getLong("upd_expect", 0L)
    fun setExpect(ctx: Context, v: Long) { p(ctx).edit().putLong("upd_expect", v).apply() }
}

/** Oppsettet i Compose-tilstand (KalVm.k43). */
class K43State(private val app: android.app.Application) {
    var wideLay by mutableStateOf(Kal43Prefs.wideLay(app))
    var layDone by mutableStateOf(Kal43Prefs.layDone(app))
    /** Valgt kort før «Fortsett». */
    var pick by mutableStateOf(Kal43Prefs.wideLay(app))

    fun choose(v: String) {
        val m = Kal43Prefs.normalized(v)
        Hap.tick()
        wideLay = m; pick = m; layDone = true
        Kal43Prefs.setWideLay(app, m)
        Kal43Prefs.setLayDone(app, true)
    }

    /** Ved Logg ut: steget vises igjen etter neste innlogging. */
    fun reset() {
        layDone = false; pick = wideLay
        Kal43Prefs.setLayDone(app, false)
    }
}

data class KRel43(val version: String, val build: Long, val size: Long, val url: String, val sha256: String, val notes: List<String>) {
    val file: String get() = url.substringAfterLast('/').substringBefore('?').ifBlank { "kalender-$version.apk" }
    val label: String get() = "Kalender $version" + if (build > 0) " ($build)" else ""
}

/** Oppdateringen: tilstand for vinduet (Compose), og arbeidet (nett, hashing, installasjon) på IO-tråder. */
object Kal43Upd {
    /** idle | check | none | avail | dl | ready | inst | done | err */
    var phase by mutableStateOf("idle")
    var rel by mutableStateOf<KRel43?>(null)
    var got by mutableLongStateOf(0L)
    var total by mutableLongStateOf(0L)
    var speed by mutableLongStateOf(0L)
    var msg by mutableStateOf("")
    var pageOpen by mutableStateOf(false)
    /** «Installer ukjente apper» må slås på først (én linje forklaring vises). */
    var needPerm by mutableStateOf(false)
    var apk: File? = null
    @Volatile private var cancel = false
    private val main = Handler(Looper.getMainLooper())

    private fun ui(block: () -> Unit) { if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block) }

    fun versionName(ctx: Context): String = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "1.0"
    @Suppress("DEPRECATION")
    fun versionCode(ctx: Context): Long = runCatching {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else pi.versionCode.toLong()
    }.getOrDefault(0L)
    fun currentLabel(ctx: Context): String = "Kalender ${versionName(ctx)} (${versionCode(ctx)}) · Android"

    fun newer(r: KRel43, ver: String, code: Long): Boolean {
        val x = r.version.split('.').map { it.toIntOrNull() ?: 0 }
        val y = ver.split('.').map { it.substringBefore('-').toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(x.size, y.size)) {
            val p = x.getOrElse(i) { 0 }; val q = y.getOrElse(i) { 0 }
            if (p != q) return p > q
        }
        return r.build > 0 && code > 0 && r.build > code
    }

    private fun base(ctx: Context): String = KalAuth.session(ctx)?.server?.takeIf { it.isNotBlank() } ?: Kal41.DEFAULT_BASE

    fun parse(body: String, base: String): KRel43? {
        val o0 = runCatching { JSONObject(body) }.getOrNull() ?: return null
        val o = o0.optJSONObject("latest") ?: o0
        val v = o.optString("version").removePrefix("v")
        var url = o.optString("url")
        if (v.isBlank() || url.isBlank()) return null
        if (url.startsWith("/")) url = base.trimEnd('/') + url
        val notes = mutableListOf<String>()
        o.optJSONArray("notes")?.let { a -> for (i in 0 until a.length()) { val n = a.opt(i); if (n is String) notes += n else if (n is JSONObject) notes += n.optString("t", n.optString("text")) } }
        return KRel43(v, o.optLong("build", 0L), o.optLong("size", 0L), url, o.optString("sha256").lowercase().trim(), notes.filter { it.isNotBlank() })
    }

    /** Ser etter ny versjon. quiet = i bakgrunnen (ingen feil i vinduet). Returnerer utgivelsen når den er nyere. */
    suspend fun check(ctx: Context, quiet: Boolean = false): KRel43? {
        if (phase == "dl" || phase == "inst") return null
        if (!quiet) ui { phase = "check"; msg = "" }
        val b = base(ctx)
        val ch = Kal43Prefs.channel(ctx)
        return try {
            val body = KalApi(b, KalAuth.session(ctx)?.token).request("GET", "/api/apps/kalender/latest?platform=android&channel=" + Uri.encode(ch), timeout = 8_000, read = 8_000)
            Kal43Prefs.setLastCheck(ctx, System.currentTimeMillis())
            val r = parse(body, b)
            if (r != null && newer(r, versionName(ctx), versionCode(ctx))) { ui { rel = r; phase = "avail" }; r }
            else { ui { rel = null; phase = if (quiet) "idle" else (if (r == null) "err" else "none"); if (r == null && !quiet) msg = "Uventet svar fra serveren." }; null }
        } catch (e: KalApiException) {
            ui {
                if (quiet) phase = "idle" else {
                    phase = "err"
                    msg = if (e.status == 404) "Serveren har ingen oppdateringsinformasjon ennå." else (e.message ?: "Fikk ikke kontakt med serveren.")
                }
            }
            null
        }
    }

    fun cancelDownload() { cancel = true; ui { phase = if (rel != null) "avail" else "idle" } }

    /** Laster ned APK-en og sjekker SHA-256 og signeringssertifikatet. true = klar til å installere. */
    suspend fun download(ctx: Context): Boolean = withContext(Dispatchers.IO) {
        val r = rel ?: return@withContext false
        if (r.sha256.length != 64) { ui { phase = "err"; msg = "Oppdateringen kunne ikke bekreftes (mangler sjekksum) og ble ikke lastet ned." }; return@withContext false }
        cancel = false
        ui { phase = "dl"; got = 0; total = r.size; speed = 0; msg = "" }
        val dir = File(ctx.cacheDir, "upd43").apply { mkdirs() }
        val f = File(dir, r.file)
        f.delete()
        val t0 = System.currentTimeMillis()
        try {
            val conn = URL(r.url).openConnection() as HttpURLConnection
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.instanceFollowRedirects = true
            try {
                if (conn.responseCode >= 400) throw java.io.IOException("Serveren svarte med feil ${conn.responseCode}.")
                val len = conn.contentLengthLong
                if (len > 0) ui { total = len }
                val md = MessageDigest.getInstance("SHA-256")
                conn.inputStream.use { inp ->
                    f.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        var n: Int
                        var w = 0L
                        var lastUi = 0L
                        while (true) {
                            if (cancel || !coroutineContext.isActive) throw java.io.IOException("Nedlastingen ble avbrutt.")
                            n = inp.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            md.update(buf, 0, n)
                            w += n
                            val now = System.currentTimeMillis()
                            if (now - lastUi > 200) {
                                lastUi = now
                                val ww = w
                                val dt = (now - t0).coerceAtLeast(1)
                                ui { got = ww; speed = ww * 1000 / dt }
                            }
                        }
                        val ww = w
                        ui { got = ww }
                    }
                }
                val have = md.digest().joinToString("") { "%02x".format(it) }
                if (have != r.sha256 || !sameSigner(ctx, f)) {
                    f.delete()
                    ui { phase = "err"; msg = "Oppdateringen kunne ikke bekreftes og ble slettet." }
                    return@withContext false
                }
            } finally { conn.disconnect() }
        } catch (e: Exception) {
            f.delete()
            ui { if (phase == "dl") { phase = "err"; msg = e.message ?: "Nedlastingen stoppet." } }
            return@withContext false
        }
        apk = f
        ui { phase = "ready" }
        true
    }

    private fun sha(b: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }

    /** Samme pakkenavn og samme signeringssertifikat som appen som er installert. */
    @Suppress("DEPRECATION")
    fun sameSigner(ctx: Context, f: File): Boolean = runCatching {
        val pm = ctx.packageManager
        if (Build.VERSION.SDK_INT >= 28) {
            val a = pm.getPackageArchiveInfo(f.path, PackageManager.GET_SIGNING_CERTIFICATES) ?: return false
            if (a.packageName != ctx.packageName) return false
            val theirs = a.signingInfo?.apkContentsSigners?.map { sha(it.toByteArray()) }?.toSet() ?: return false
            val mine = pm.getPackageInfo(ctx.packageName, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo?.apkContentsSigners?.map { sha(it.toByteArray()) }?.toSet() ?: return false
            theirs.isNotEmpty() && theirs == mine
        } else {
            val a = pm.getPackageArchiveInfo(f.path, PackageManager.GET_SIGNATURES) ?: return false
            if (a.packageName != ctx.packageName) return false
            val theirs = a.signatures?.map { sha(it.toByteArray()) }?.toSet() ?: return false
            val mine = pm.getPackageInfo(ctx.packageName, PackageManager.GET_SIGNATURES).signatures?.map { sha(it.toByteArray()) }?.toSet() ?: return false
            theirs.isNotEmpty() && theirs == mine
        }
    }.getOrDefault(false)

    fun canInstall(ctx: Context): Boolean = ctx.packageManager.canRequestPackageInstalls()

    /** «Installer ukjente apper» for Kalender. */
    fun openUnknownSources(ctx: Context) {
        val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { ctx.startActivity(i) }
    }

    /** PackageInstaller-økt. Systemdialogen kommer via Kal43InstallReceiver (STATUS_PENDING_USER_ACTION). */
    suspend fun install(ctx: Context) {
        val f = apk ?: return
        if (!canInstall(ctx)) { ui { needPerm = true }; return }
        ui { needPerm = false; phase = "inst"; msg = "" }
        val ok = withContext(Dispatchers.IO) {
            runCatching {
                val pi = ctx.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                params.setAppPackageName(ctx.packageName)
                params.setSize(f.length())
                val id = pi.createSession(params)
                pi.openSession(id).use { s ->
                    s.openWrite("kalender.apk", 0, f.length()).use { out ->
                        f.inputStream().use { it.copyTo(out) }
                        s.fsync(out)
                    }
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                    val pend = PendingIntent.getBroadcast(ctx, id, Intent(ctx, Kal43InstallReceiver::class.java).setPackage(ctx.packageName), flags)
                    rel?.let { Kal43Prefs.setExpect(ctx, it.build) }
                    s.commit(pend.intentSender)
                }
                true
            }.getOrDefault(false)
        }
        if (!ok) ui { phase = "err"; msg = "Kunne ikke starte installasjonen." }
    }

    fun onStatus(status: Int, message: String?) = ui {
        when (status) {
            PackageInstaller.STATUS_SUCCESS -> phase = "done"
            PackageInstaller.STATUS_FAILURE_ABORTED -> { phase = "ready"; msg = "" }
            else -> { phase = "err"; msg = "Installasjonen ble ikke fullført" + (message?.let { ": $it" } ?: ".") }
        }
    }

    /** Etter at den nye versjonen starter: «✓ Kalender er oppdatert til …». */
    fun afterStart(ctx: Context) {
        val want = Kal43Prefs.expect(ctx)
        if (want <= 0) return
        Kal43Prefs.setExpect(ctx, 0)
        if (versionCode(ctx) >= want) ui { phase = "done" }
        runCatching { File(ctx.cacheDir, "upd43").deleteRecursively() }
    }

    /** WorkManager én gang om dagen (Wi-Fi når nedlasting i bakgrunnen er på). Av = avbestilt. */
    fun schedule(ctx: Context) {
        val wm = runCatching { WorkManager.getInstance(ctx) }.getOrNull() ?: return
        if (!Kal43Prefs.auto(ctx)) { wm.cancelUniqueWork(WORK); return }
        val net = if (Kal43Prefs.autoDl(ctx)) NetworkType.UNMETERED else NetworkType.CONNECTED
        val req = PeriodicWorkRequestBuilder<Kal43Worker>(24, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(net).build())
            .build()
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    const val WORK = "kal43-update"
    const val CH = "kal43-upd"

    /** Varsel «Kalender 1.1 er klar · Installer» (åpner kalender://oppdatering). */
    fun notifyReady(ctx: Context, r: KRel43) {
        if (!KalNotify.canPost(ctx)) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm?.createNotificationChannel(NotificationChannel(CH, "Oppdateringer", NotificationManager.IMPORTANCE_DEFAULT))
        val open = Intent(Intent.ACTION_VIEW, Uri.parse("kalender://oppdatering")).setPackage(ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val pend = PendingIntent.getActivity(ctx, 4301, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, CH)
            .setSmallIcon(R.drawable.ic_kal_notif)
            .setContentTitle("Kalender ${r.version} er klar")
            .setContentText("Trykk for å installere")
            .setAutoCancel(true)
            .setContentIntent(pend)
            .addAction(0, "Installer", pend)
            .build()
        runCatching { NotificationManagerCompat.from(ctx).notify("kal43-upd", 1, n) }
    }
}

/** Svar fra PackageInstaller: systemdialogen («Vil du installere en oppdatering …?»), ferdig eller feil. */
class Kal43InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val st = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            val confirm: Intent? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_INTENT)
            if (confirm != null) runCatching { context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            return
        }
        Kal43Upd.onStatus(st, intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
    }
}

/** Én gang om dagen: se etter ny versjon; med «Last ned i bakgrunnen på Wi-Fi» også last ned, sjekk og varsle. */
class Kal43Worker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val c = applicationContext
        if (!Kal43Prefs.auto(c)) return Result.success()
        val r = Kal43Upd.check(c, quiet = true) ?: return Result.success()
        if (Kal43Prefs.autoDl(c) && Kal43Upd.download(c)) Kal43Upd.notifyReady(c, r)
        return Result.success()
    }
}
