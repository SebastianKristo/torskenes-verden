package no.kristo.finanshub

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID

/*
 * Prompt 32 (APKUPD): appen oppdaterer sin egen APK.
 *
 * Serveren (server/app-update.js) svarer på GET /api/app/android/latest med siste GitHub-release og strømmer APK-en
 * gjennom seg selv (GET /api/app/android/apk/X.Y.Z), så telefonen trenger ikke nå github.com. Flyten:
 *   1. Ved oppstart og maks hver 6. time: sammenlign versionName/versionCode med /latest.
 *   2. «Last ned og installer»: HttpURLConnection med app-tokenet til cacheDir/updates/, fremdrift i %, SHA-256 sjekkes
 *      mot SHA256SUMS.txt før noe installeres. Gamle filer slettes.
 *   3. Mangler «Installer ukjente apper»: forklar og åpne Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES; fortsett når
 *      brukeren kommer tilbake (ON_RESUME → resumeAppUpd32).
 *   4. PackageInstaller-økt; STATUS_PENDING_USER_ACTION → bekreftelsesdialogen fra systemet. Feiler økten, faller vi
 *      tilbake til ACTION_VIEW via FileProvider (${applicationId}.files, cache/updates).
 * APK-ene er alltid signert med samme nøkkel (sideload-nøkkelen eller release-nøkkelen), så de installeres rett over.
 *
 * Tilstanden ligger i et eget objekt (AppUpd32.s) i stedet for i AppViewModel, så delte filer bare trenger små kall.
 */

data class AppRel32(
    val version: String,
    val versionCode: Long?,
    val publishedAt: String?,
    val notes: List<String>,
    val apkUrl: String,
    val size: Long?,
    val sha256: String?,
    val releaseUrl: String?,
)

class AppUpd32State {
    var current by mutableStateOf("")
    var currentCode by mutableStateOf(0L)
    var latest by mutableStateOf<AppRel32?>(null)
    var loaded by mutableStateOf(false)
    /** none | avail | dl | perm | install | failed */
    var phase by mutableStateOf("none")
    var pct by mutableStateOf(0)
    var error by mutableStateOf("")
    var notesOpen by mutableStateOf(false)
    var hiddenUntil by mutableStateOf(0L)
    var file: File? = null
}

object AppUpd32 {
    val s = AppUpd32State()
    internal val scope = MainScope()
    internal const val ACTION = "no.kristo.finanshub.APP_UPDATE32_STATUS"
    internal const val EXTRA_NONCE = "nonce32"
    internal var nonce: String = UUID.randomUUID().toString()
    internal var receiverOn = false
    private const val PREFS = "app_update32"
    private const val CHECK_EVERY = 6 * 3_600_000L
    private const val HIDE_FOR = 24 * 3_600_000L
    const val ERR_KEY = "Appen er signert med en annen nøkkel – avinstaller og installer på nytt"

    internal fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    internal fun checkDue(ctx: Context): Boolean = System.currentTimeMillis() - prefs(ctx).getLong("checked", 0L) > CHECK_EVERY
    internal fun hide(ctx: Context) {
        val until = System.currentTimeMillis() + HIDE_FOR
        prefs(ctx).edit().putLong("hide_until", until).putString("hide_ver", s.latest?.version ?: "").apply()
        s.hiddenUntil = until
    }
    internal fun hiddenNow(ctx: Context): Boolean {
        val p = prefs(ctx)
        return System.currentTimeMillis() < p.getLong("hide_until", 0L) && p.getString("hide_ver", "") == (s.latest?.version ?: "")
    }

    fun parse(json: String): AppRel32? = runCatching {
        val o = JSONObject(json)
        val v = o.optString("version")
        if (!Regex("""^\d{1,4}\.\d{1,4}\.\d{1,4}$""").matches(v)) return null
        val n = o.optJSONArray("notes")
        val notes: List<String> = if (n == null) emptyList() else (0 until n.length()).map { n.optString(it) }.filter { it.isNotBlank() }
        AppRel32(
            version = v,
            versionCode = if (o.isNull("versionCode")) null else o.optLong("versionCode").takeIf { it > 0 },
            publishedAt = o.optString("publishedAt").takeIf { it.isNotBlank() && it != "null" },
            notes = notes,
            apkUrl = o.optString("apkUrl").takeIf { it.startsWith("/api/app/android/apk/") } ?: "/api/app/android/apk/$v",
            size = if (o.isNull("size")) null else o.optLong("size").takeIf { it > 0 },
            sha256 = o.optString("sha256").lowercase().takeIf { Regex("^[0-9a-f]{64}$").matches(it) },
            releaseUrl = o.optString("releaseUrl").takeIf { it.startsWith("https://github.com/") },
        )
    }.getOrNull()

    /** «4.24.0» mot «4.23.1»: 1, 0 eller -1. Ukjente deler teller som 0. */
    fun compare(a: String, b: String): Int {
        val pa = a.split('.').map { it.toIntOrNull() ?: 0 }
        val pb = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val d = (pa.getOrNull(i) ?: 0) - (pb.getOrNull(i) ?: 0)
            if (d != 0) return if (d > 0) 1 else -1
        }
        return 0
    }

    fun isNewer(r: AppRel32, cur: String, curCode: Long): Boolean {
        val c = compare(r.version, cur)
        return c > 0 || (c == 0 && r.versionCode != null && r.versionCode > curCode)
    }

    internal fun readCurrent(ctx: Context) {
        val info = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0) }.getOrNull()
        s.current = info?.versionName ?: ""
        @Suppress("DEPRECATION")
        s.currentCode = if (info == null) 0L else if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
    }

    internal fun applyRel(ctx: Context, r: AppRel32?) {
        s.latest = r
        s.loaded = true
        if (s.phase in setOf("dl", "perm", "install")) return
        s.phase = if (r != null && isNewer(r, s.current, s.currentCode)) "avail" else "none"
        s.hiddenUntil = if (hiddenNow(ctx)) prefs(ctx).getLong("hide_until", 0L) else 0L
    }

    internal fun updatesDir(ctx: Context): File = File(ctx.cacheDir, "updates").apply { mkdirs() }

    /** Sletter alt i cache/updates bortsett fra [keep]. */
    internal fun cleanup(ctx: Context, keep: File? = null) {
        updatesDir(ctx).listFiles()?.forEach { f -> if (keep == null || f.absolutePath != keep.absolutePath) runCatching { f.delete() } }
    }

    internal fun fail(msg: String) { s.phase = "failed"; s.error = msg; Haptics.error() }

    /* ---------------- Installasjon ---------------- */

    internal fun canInstall(ctx: Context): Boolean = ctx.packageManager.canRequestPackageInstalls()

    internal fun openUnknownSources(ctx: Context) {
        val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { ctx.startActivity(i) }.onFailure { fail("Fant ikke innstillingen. Åpne Innstillinger → Apper → Homelab → Installer ukjente apper.") }
    }

    internal fun install(ctx: Context) {
        val f = s.file
        if (f == null || !f.exists()) { s.phase = if (s.latest != null) "avail" else "none"; return }
        if (!canInstall(ctx)) { s.phase = "perm"; return }
        s.phase = "install"
        s.error = ""
        val app = ctx.applicationContext
        try {
            installSession(app, f)
        } catch (e: Exception) {
            // Noen telefoner (eller arbeidsprofiler) stopper PackageInstaller-økter fra apper: prøv systemets installasjonsdialog.
            try { installView(app, f) } catch (e2: Exception) { fail("Kunne ikke starte installasjonen: ${e2.message ?: e.message ?: "ukjent feil"}") }
        }
    }

    private fun installSession(ctx: Context, f: File) {
        registerReceiver(ctx)
        val pi = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(ctx.packageName)
        params.setSize(f.length())
        val id = pi.createSession(params)
        val session = pi.openSession(id)
        try {
            f.inputStream().use { inp ->
                session.openWrite("base.apk", 0, f.length()).use { out -> inp.copyTo(out, 64 * 1024); session.fsync(out) }
            }
            nonce = UUID.randomUUID().toString()
            val intent = Intent(ACTION).setPackage(ctx.packageName).putExtra(EXTRA_NONCE, nonce)
            // FLAG_MUTABLE: systemet fyller inn status og bekreftelses-intent.
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val pending = PendingIntent.getBroadcast(ctx, 3200, intent, flags)
            session.commit(pending.intentSender)
        } catch (e: Exception) {
            runCatching { session.abandon() }
            throw e
        } finally {
            runCatching { session.close() }
        }
    }

    private fun installView(ctx: Context, f: File) {
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
        // Systemdialogen tar over; status kommer ikke tilbake hit. Står vi fortsatt her etterpå, kan brukeren prøve igjen.
        s.phase = "avail"
    }

    private fun registerReceiver(ctx: Context) {
        if (receiverOn) return
        val filter = IntentFilter(ACTION)
        if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(InstallReceiver32, filter, Context.RECEIVER_NOT_EXPORTED)
        else @Suppress("UnspecifiedRegisterReceiverFlag") ctx.registerReceiver(InstallReceiver32, filter)
        receiverOn = true
    }

    internal fun unregister(ctx: Context) {
        if (!receiverOn) return
        runCatching { ctx.applicationContext.unregisterReceiver(InstallReceiver32) }
        receiverOn = false
    }

    /** Statuskoden fra PackageInstaller → norsk melding (null = ingen feil). */
    fun statusMessage(status: Int, msg: String?): String? {
        val m = msg ?: ""
        return when {
            status == PackageInstaller.STATUS_SUCCESS -> null
            status == PackageInstaller.STATUS_FAILURE_CONFLICT || status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ||
                m.contains("UPDATE_INCOMPATIBLE") || m.contains("INCONSISTENT_CERTIFICATES") || m.contains("signatures do not match", ignoreCase = true) -> ERR_KEY
            status == PackageInstaller.STATUS_FAILURE_STORAGE -> "Ikke nok lagringsplass til å installere oppdateringen."
            status == PackageInstaller.STATUS_FAILURE_BLOCKED -> "Installasjonen ble blokkert av telefonen."
            status == PackageInstaller.STATUS_FAILURE_INVALID -> "APK-filen er ugyldig. Last ned på nytt."
            else -> "Installasjonen feilet${if (m.isNotBlank()) ": $m" else "."}"
        }
    }
}

/** Svar fra PackageInstaller-økten. */
internal object InstallReceiver32 : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AppUpd32.ACTION || intent.getStringExtra(AppUpd32.EXTRA_NONCE) != AppUpd32.nonce) return
        val s = AppUpd32.s
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm: Intent? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                    else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_INTENT)
                if (confirm == null) { AppUpd32.fail("Telefonen ba ikke om bekreftelse. Prøv igjen."); return }
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { context.startActivity(confirm) }.onFailure { AppUpd32.fail("Kunne ikke åpne installasjonsdialogen.") }
            }
            PackageInstaller.STATUS_SUCCESS -> {
                // Appen erstattes og startes på nytt av systemet; rydder i tilfelle vi lever litt til.
                AppUpd32.unregister(context)
                AppUpd32.cleanup(context)
                s.phase = "none"
            }
            PackageInstaller.STATUS_FAILURE_ABORTED -> {
                AppUpd32.unregister(context)
                s.phase = "avail"
                s.error = "Installasjonen ble avbrutt."
            }
            else -> {
                AppUpd32.unregister(context)
                val msg = AppUpd32.statusMessage(status, intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
                AppUpd32.fail(msg ?: "Installasjonen feilet.")
            }
        }
    }
}

/* ---------------- AppViewModel-utvidelser ---------------- */

/** Ved oppstart og maks hver 6. time (force = trykk på raden). Feil vises ikke: eldre servere har ikke ruten. */
fun AppViewModel.checkAppUpd32(force: Boolean = false) {
    val ctx = appCtx29
    val s = AppUpd32.s
    AppUpd32.readCurrent(ctx)
    val base0 = base
    if (base0.isBlank() || account?.token == null) return
    val cached = AppUpd32.prefs(ctx).getString("latest", null)
    if (!force && !AppUpd32.checkDue(ctx) && cached != null) { AppUpd32.applyRel(ctx, AppUpd32.parse(cached)); cleanupOld32(); return }
    AppUpd32.scope.launch {
        try {
            val body = api30 { request("GET", "/app/android/latest", prefix = Api.HOMELAB, timeout = 6_000, read = 15_000) }
            val r = AppUpd32.parse(body)
            AppUpd32.prefs(ctx).edit().putLong("checked", System.currentTimeMillis()).putString("latest", body).apply()
            AppUpd32.applyRel(ctx, r)
        } catch (e: Exception) {
            AppUpd32.prefs(ctx).edit().putLong("checked", System.currentTimeMillis()).apply()
            AppUpd32.applyRel(ctx, cached?.let { AppUpd32.parse(it) })
        }
        cleanupOld32()
    }
    if (!s.loaded && cached != null) AppUpd32.applyRel(ctx, AppUpd32.parse(cached))
}

/** Gamle nedlastinger (samme eller eldre versjon enn den som kjører) slettes. */
private fun AppViewModel.cleanupOld32() {
    val s = AppUpd32.s
    if (s.phase == "dl" || s.phase == "install" || s.phase == "perm") return
    val dir = AppUpd32.updatesDir(appCtx29)
    dir.listFiles()?.forEach { f ->
        val v = Regex("""FinansHub-(\d+\.\d+\.\d+)\.apk(\.part)?""").matchEntire(f.name)?.groupValues?.getOrNull(1)
        if (v == null || AppUpd32.compare(v, s.current) <= 0 || f.name.endsWith(".part")) runCatching { f.delete() }
    }
}

fun AppViewModel.hideAppUpd32() = AppUpd32.hide(appCtx29)

/** Skal banneret på Hjem vises? ✕ skjuler «Ny versjon» i 24 timer; nedlasting, tillatelse og feil vises alltid. */
fun AppViewModel.appUpd32OnHome(): Boolean {
    val s = AppUpd32.s
    return when (s.phase) {
        "avail" -> !(System.currentTimeMillis() < s.hiddenUntil)
        "dl", "perm", "install", "failed" -> true
        else -> false
    }
}

/** «Last ned og installer»: laster ned (med fremdrift), sjekker SHA-256 og installerer. */
fun AppViewModel.startAppUpd32() {
    val ctx = appCtx29
    val s = AppUpd32.s
    val r = s.latest ?: return
    if (s.phase == "dl" || s.phase == "install") return
    val existing = s.file
    if (existing != null && existing.exists() && existing.name == "FinansHub-${r.version}.apk") { AppUpd32.install(ctx); return }
    val token = account?.token
    val url = base.trimEnd('/') + r.apkUrl
    s.phase = "dl"; s.pct = 0; s.error = ""
    Haptics.select()
    AppUpd32.scope.launch {
        val dir = AppUpd32.updatesDir(ctx)
        val part = File(dir, "FinansHub-${r.version}.apk.part")
        val done = File(dir, "FinansHub-${r.version}.apk")
        AppUpd32.cleanup(ctx)
        val result: String? = withContext(Dispatchers.IO) { download32(url, token, part, r.size) { p -> AppUpd32.scope.launch { s.pct = p } } }
        when {
            result == null -> { runCatching { part.delete() }; AppUpd32.fail("Nedlastingen feilet. Sjekk forbindelsen til serveren og prøv igjen.") }
            r.sha256 == null -> { runCatching { part.delete() }; AppUpd32.fail("Serveren oppga ingen sjekksum for APK-en. Installerer ikke.") }
            result != r.sha256 -> { runCatching { part.delete() }; AppUpd32.fail("Sjekksummen stemmer ikke. Filen kan være skadet, så den installeres ikke. Prøv igjen.") }
            !part.renameTo(done) -> AppUpd32.fail("Kunne ikke lagre APK-en.")
            else -> {
                s.pct = 100
                s.file = done
                AppUpd32.install(ctx)
            }
        }
    }
}

/** Laster ned til [out] og returnerer SHA-256 (hex), eller null ved feil. */
private fun download32(url: String, token: String?, out: File, size: Long?, onPct: (Int) -> Unit): String? {
    val conn = URL(url).openConnection() as HttpURLConnection
    return try {
        conn.connectTimeout = 15_000
        conn.readTimeout = 60_000
        conn.instanceFollowRedirects = true
        conn.setRequestProperty("Accept", "application/vnd.android.package-archive")
        token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
        if (conn.responseCode != 200) return null
        val total: Long = conn.contentLengthLong.takeIf { it > 0 } ?: size ?: -1L
        val md = MessageDigest.getInstance("SHA-256")
        var read = 0L
        var last = -1
        conn.inputStream.use { inp ->
            out.outputStream().use { o ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = inp.read(buf)
                    if (n < 0) break
                    o.write(buf, 0, n)
                    md.update(buf, 0, n)
                    read += n
                    if (total > 0) {
                        val p = ((read * 100) / total).toInt().coerceIn(0, 99)
                        if (p != last) { last = p; onPct(p) }
                    }
                }
            }
        }
        if (total > 0 && read != total) return null
        md.digest().joinToString("") { "%02x".format(it) }
    } catch (e: Exception) {
        null
    } finally {
        conn.disconnect()
    }
}

/** Kalles når appen kommer tilbake (f.eks. fra «Installer ukjente apper»). */
fun AppViewModel.resumeAppUpd32() {
    val ctx = appCtx29
    val s = AppUpd32.s
    if (s.phase == "perm" && AppUpd32.canInstall(ctx)) AppUpd32.install(ctx)
}

fun AppViewModel.openUnknownSources32() = AppUpd32.openUnknownSources(appCtx29)

fun AppViewModel.retryAppUpd32() {
    val s = AppUpd32.s
    val r = s.latest
    s.error = ""
    s.phase = if (r != null && AppUpd32.isNewer(r, s.current, s.currentCode)) "avail" else "none"
    if (s.phase == "avail") startAppUpd32()
}
