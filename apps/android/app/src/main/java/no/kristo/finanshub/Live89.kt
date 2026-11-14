package no.kristo.finanshub

import android.Manifest
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.TimeUnit

/*
 * Prompt 89 (AND89): Live Updates for Live Activities-API-et (CONTRACT89 / claude-code-live-activities.md, fasit Live Activities.dc.html).
 *  - GET /api/live/aktiviteter → ett varsel per aktivitet (nedlasting, backup, spiller, avtale, pakke).
 *  - Android 16 (SDK 36): Notification.ProgressStyle med aksentfarget sporingsikon (setProgressTrackerIcon), segmenter for pakke,
 *    setRequestPromotedOngoing(true) og setShortCriticalText(«62 %») → brikke i statuslinja. compileSdk er 35, så API 36 nås med
 *    refleksjon (som Live41). Eldre Android: vanlig pågående varsel med setProgress.
 *  - Knappene (Pause/Fortsett/Stopp/Utsett) går til Live89Receiver → POST /api/live/handling uten å åpne appen. «Vis rute» trenger en
 *    kartapp og går via Live89Route (usynlig aktivitet) som henter kartlenken og åpner den.
 *  - Ingen Firebase: forgrunnstjenesten Live89Service poller hvert 5. s (nedlasting/backup) eller 30. s mens noe er aktivt og stopper
 *    når ingenting er aktivt. Live89Worker (WorkManager, hvert 15. min) fanger opp nye aktiviteter når appen ikke er åpen.
 *  - Tid tikker av seg selv (kronometer mot «slutt»). Ferdig: varselet blir liggende i 15 min (pakke 30 min), avtale forsvinner ved starttid.
 */

data class Akt89(
    val id: String, val type: String, val tittel: String, val undertittel: String, val verdi: String, val progress: Double?,
    val segAntall: Int, val segFerdig: Int, val meta: String, val start: String?, val slutt: String?, val status: String,
    val handlinger: List<Pair<String, String>>, val url: String?,
)

private fun JSONObject.s89(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() }

/** Én aktivitet fra serveren. Ukjent type eller ugyldig id → null. */
fun parseAkt89(o: JSONObject): Akt89? {
    val id = o.s89("id") ?: return null
    if (!Regel89.validId(id)) return null
    val type = o.s89("type") ?: return null
    if (type !in Regel89.TYPES) return null
    val seg = o.optJSONObject("segmenter")
    val h = o.optJSONArray("handlinger") ?: JSONArray()
    val acts = (0 until h.length()).mapNotNull { i ->
        val a = h.optJSONObject(i) ?: return@mapNotNull null
        val hid = a.s89("id")?.takeIf { it in Regel89.ACTIONS } ?: return@mapNotNull null
        hid to (a.s89("tittel") ?: Regel89.actionTitle(hid))
    }
    val p = if (!o.has("progress") || o.isNull("progress")) null else o.optDouble("progress").takeIf { !it.isNaN() }
    val st = o.s89("status")?.takeIf { it == "aktiv" || it == "pause" || it == "ferdig" } ?: "aktiv"
    return Akt89(
        id, type, o.s89("tittel") ?: Regel89.label(type), o.s89("undertittel").orEmpty(), o.s89("verdi").orEmpty(), p,
        seg?.optInt("antall", 0) ?: 0, seg?.optInt("ferdig", 0) ?: 0, o.s89("meta").orEmpty(), o.s89("start"), o.s89("slutt"), st, acts, o.s89("url"),
    )
}

fun parseAkts89(raw: String): List<Akt89> {
    val a = runCatching { JSONObject(raw).optJSONArray("aktiviteter") }.getOrNull() ?: return emptyList()
    return (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { runCatching { parseAkt89(it) }.getOrNull() } }.distinctBy { it.id }
}

/** GET/PUT /api/live/innstillinger → {nedlasting, backup, spiller, avtale, pakke}. Mangler et felt, gjelder standarden (på). */
fun parseLiveSettings89(raw: String): Map<String, Boolean> {
    val o = runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject()
    return Regel89.TYPES.associateWith { if (o.has(it) && !o.isNull(it)) o.optBoolean(it, true) else true }
}

private fun epoch89(s: String?): Long? = s?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

object Live89 {
    const val CH = "live89"
    private const val PREF = "live89"
    private const val WORK = "live89_poll"

    private fun sp(ctx: Context) = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
    private fun nm(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun canPost(ctx: Context) = Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    internal fun channel(ctx: Context) {
        val nm = nm(ctx)
        if (nm.getNotificationChannel(CH) == null) nm.createNotificationChannel(NotificationChannel(CH, "Live Updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Nedlastinger, backup, spilles nå, neste avtale og pakkesporing som pågående varsel"
            setSound(null, null); enableVibration(false); setShowBadge(false)
        })
    }

    suspend fun fetch(api: Api): List<Akt89> = parseAkts89(api.request("GET", "/live/aktiviteter", prefix = Api.HOMELAB, timeout = 8_000, read = 10_000))

    /* ---------- Varselet ---------- */

    private fun open(ctx: Context, a: Akt89): PendingIntent = PendingIntent.getActivity(ctx, Regel89.notifId(a.id),
        Intent(Intent.ACTION_VIEW, Uri.parse(Regel89.link(a.url, a.type)), ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP).intern86(ctx),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun action(ctx: Context, a: Akt89, hid: String, i: Int): PendingIntent {
        val code = Regel89.notifId(a.id) + 1 + i
        if (hid == "rute") return PendingIntent.getActivity(ctx, code,
            Intent(ctx, Live89Route::class.java).putExtra("id", a.id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_HISTORY),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return PendingIntent.getBroadcast(ctx, code,
            Intent(ctx, Live89Receiver::class.java).setAction(Live89Receiver.ACTION).putExtra("id", a.id).putExtra("handling", hid),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Sporingsikonet: aksentfarget sirkel med symbolet i mørkt (som brikken i fasiten). */
    private fun tracker(type: String, status: String, color: Int, size: Int = 72): Bitmap {
        val bm = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bm)
        c.drawCircle(size / 2f, size / 2f, size / 2f, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color; style = Paint.Style.FILL })
        val k = size * 0.62f / 24f
        val off = size * 0.19f
        val pen = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = 0xFF0B0B0D.toInt(); style = Paint.Style.STROKE; strokeWidth = 2.6f * k
            strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
        }
        Regel89.polylines(Regel89.icon(type, status)).forEach { pl ->
            val path = Path()
            pl.pts.forEachIndexed { i, (x, y) -> if (i == 0) path.moveTo(off + x * k, off + y * k) else path.lineTo(off + x * k, off + y * k) }
            if (pl.closed) path.close()
            c.drawPath(path, pen)
        }
        return bm
    }

    /** Android 16: Notification.ProgressStyle via refleksjon (compileSdk 35). false = ikke tilgjengelig → vanlig setProgress. */
    private fun progressStyle36(b: Notification.Builder, a: Akt89, color: Int, pct: Int?): Boolean {
        if (Build.VERSION.SDK_INT < 36) return false
        val lengths = if (a.type == "pakke") Regel89.segLengths(a.segAntall) else emptyList()
        if (lengths.isEmpty() && pct == null) return false
        return runCatching {
            val cls = Class.forName("android.app.Notification\$ProgressStyle")
            val segCls = Class.forName("android.app.Notification\$ProgressStyle\$Segment")
            val style = cls.getConstructor().newInstance()
            val intT = Int::class.javaPrimitiveType
            fun seg(len: Int): Any = segCls.getConstructor(intT).newInstance(len).also { segCls.getMethod("setColor", intT).invoke(it, color) }
            val segs: List<Any> = if (lengths.isNotEmpty()) lengths.map { seg(it) } else listOf(seg(100))
            cls.getMethod("setProgressSegments", java.util.List::class.java).invoke(style, segs)
            cls.getMethod("setProgress", intT).invoke(style, if (lengths.isNotEmpty()) Regel89.segProgress(a.segAntall, a.segFerdig) else pct ?: 0)
            cls.getMethod("setStyledByProgress", Boolean::class.javaPrimitiveType).invoke(style, true)
            cls.getMethod("setProgressTrackerIcon", Icon::class.java).invoke(style, Icon.createWithBitmap(tracker(a.type, a.status, color)))
            b.setStyle(style as Notification.Style)
            true
        }.getOrDefault(false)
    }

    private fun colored(t: String, color: Int): CharSequence =
        SpannableString(t).apply { setSpan(ForegroundColorSpan(color), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }

    fun build(ctx: Context, a: Akt89, now: Long = System.currentTimeMillis()): Notification {
        channel(ctx)
        val color = Regel89.accent(a.type)
        val done = a.status == "ferdig"
        val chip = Regel89.chip(a.verdi, a.status)
        val text = listOf(a.undertittel, a.meta).filter { it.isNotBlank() }.joinToString(" · ")
        val b = Notification.Builder(ctx, CH)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(a.tittel)
            .setContentText(text)
            .setSubText(Regel89.label(a.type) + (if (chip.isNotBlank()) " · $chip" else ""))
            .setColor(color)
            .setOngoing(!done).setAutoCancel(done).setOnlyAlertOnce(true)
            .setCategory(when (a.type) { "nedlasting", "backup" -> Notification.CATEGORY_PROGRESS; "spiller" -> Notification.CATEGORY_TRANSPORT; "avtale" -> Notification.CATEGORY_EVENT; else -> Notification.CATEGORY_STATUS })
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(open(ctx, a))
            .setShowWhen(false)
        val end = epoch89(a.slutt)
        Regel89.timeoutMs(a.type, a.status, now, end)?.let { b.setTimeoutAfter(it) }
        // Tid som tikker uten nye kall (avtale: nedtelling til starttid; spiller: posisjon fra «start»).
        val start = epoch89(a.start)
        if (!done && a.status == "aktiv" && end != null && end > now) b.setWhen(end).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
        else if (!done && a.status == "aktiv" && a.type == "spiller" && start != null && start <= now) b.setWhen(start).setShowWhen(true).setUsesChronometer(true)
        if (!done) a.handlinger.take(3).forEachIndexed { i, (hid, t) ->
            b.addAction(Notification.Action.Builder(null, colored(t, color), action(ctx, a, hid, i)).build())
        }
        val pct = Regel89.pct(a.progress)
        if (!done && !progressStyle36(b, a, color, pct)) {
            val l = if (a.type == "pakke") Regel89.segLengths(a.segAntall) else emptyList()
            if (l.isNotEmpty()) b.setProgress(100, Regel89.segProgress(a.segAntall, a.segFerdig), false)
            else if (pct != null) b.setProgress(100, pct, false)
        }
        // Samsung One UI 7+ (Now Bar) leser disse feltene; Android 16 leser «promoted ongoing».
        val ex = Bundle()
        ex.putInt("android.ongoingActivityNoti.style", 1)
        ex.putString("android.ongoingActivityNoti.primaryInfo", a.tittel)
        ex.putString("android.ongoingActivityNoti.secondaryInfo", a.undertittel)
        ex.putString("android.ongoingActivityNoti.chipExpandedText", chip)
        ex.putInt("android.ongoingActivityNoti.chipBgColor", color)
        ex.putString("android.ongoingActivityNoti.nowbarPrimaryInfo", chip)
        ex.putString("android.ongoingActivityNoti.nowbarSecondaryInfo", a.tittel)
        if (Build.VERSION.SDK_INT >= 36 && !done) {
            ex.putBoolean("android.requestPromotedOngoing", true)
            b.addExtras(ex)
            runCatching { Notification.Builder::class.java.getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType).invoke(b, true) }
            if (chip.isNotBlank()) runCatching { Notification.Builder::class.java.getMethod("setShortCriticalText", String::class.java).invoke(b, chip) }
        } else if (!done) b.addExtras(ex)
        return b.build()
    }

    /* ---------- Vise / fjerne ---------- */

    /**
     * Viser listen: ett varsel per aktivitet, fjerner de som er borte. Ferdige vises én gang (utløpet nullstilles ikke ved hver polling).
     * [svc] ≠ null: den første aktive aktiviteten er forgrunnstjenestens varsel. Returnerer pollingintervallet (null = ingenting aktivt).
     */
    @Synchronized
    fun show(ctx: Context, list: List<Akt89>, svc: Service? = null): Long? {
        if (!canPost(ctx)) return null
        val p = sp(ctx)
        val old = p.getStringSet("ids", emptySet()) ?: emptySet()
        val doneBefore = p.getStringSet("done", emptySet()) ?: emptySet()
        val now = System.currentTimeMillis()
        val fg = list.firstOrNull { Regel89.active(it.status) }
        val doneNow = HashSet<String>()
        for (a in list) {
            val nid = Regel89.notifId(a.id)
            if (a.status == "ferdig") { doneNow += a.id; if (a.id in doneBefore) continue }
            val n = build(ctx, a, now)
            if (svc != null && a === fg) foreground(svc, nid, n) else runCatching { nm(ctx).notify(nid, n) }
        }
        val ids = list.map { it.id }.toSet()
        // Borte fra serveren: fjernes (ferdige får ligge til utløpet).
        (old - ids).filter { it !in doneBefore }.forEach { runCatching { nm(ctx).cancel(Regel89.notifId(it)) } }
        p.edit().putStringSet("ids", ids).putStringSet("done", doneNow + (doneBefore - ids).take(20)).apply()
        return Regel89.intervalMs(list.map { it.type to it.status })
    }

    /** Én aktivitet fra svaret på en handling (POST /api/live/handling → aktivitet). */
    fun showOne(ctx: Context, a: Akt89) {
        if (!canPost(ctx)) return
        runCatching { nm(ctx).notify(Regel89.notifId(a.id), build(ctx, a)) }
    }

    private fun foreground(svc: Service, id: Int, n: Notification) {
        runCatching {
            if (Build.VERSION.SDK_INT >= 34) svc.startForeground(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else svc.startForeground(id, n)
        }.onFailure { runCatching { nm(svc).notify(id, n) } }
    }

    /** Utlogging / kontobytte: alle Live Updates bort, polling stopper. */
    fun stopAll(ctx: Context) {
        val p = sp(ctx)
        ((p.getStringSet("ids", emptySet()) ?: emptySet()) + (p.getStringSet("done", emptySet()) ?: emptySet()))
            .forEach { runCatching { nm(ctx).cancel(Regel89.notifId(it)) } }
        p.edit().clear().apply()
        runCatching { ctx.stopService(Intent(ctx, Live89Service::class.java)) }
        runCatching { WorkManager.getInstance(ctx).cancelUniqueWork(WORK) }
    }

    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<Live89Worker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        runCatching { WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req) }
    }

    /** Start forgrunnstjenesten (lov når appen er åpen eller etter et trykk på varselet; ellers tar arbeideren over). */
    fun startService(ctx: Context) {
        if (Live89Service.running) return
        runCatching { ctx.startForegroundService(Intent(ctx, Live89Service::class.java)) }
    }

    /** Appen kom i forgrunnen / en handling er utført: hent nå, vis, og poll videre hvis noe er aktivt. */
    fun kick(ctx: Context) {
        val app = ctx.applicationContext
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            val api = bgApi41(app) ?: return@launch stopAll(app)
            val list = try { fetch(api) } catch (e: CancellationException) { throw e } catch (e: ApiException) {
                // 404: eldre server uten /api/live. 401/403: ikke innlogget lenger.
                if (e.status == 404 || e.status == 401 || e.status == 403) stopAll(app)
                return@launch
            } catch (_: Exception) { return@launch }
            schedule(app)
            if (show(app, list) != null) startService(app)
        }
    }
}

/** Pause / Fortsett / Stopp / Utsett fra varselet – uten å åpne appen. */
class Live89Receiver : BroadcastReceiver() {
    companion object { const val ACTION = "no.kristo.finanshub.LIVE89" }

    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != ACTION) return
        val id = intent.getStringExtra("id")?.takeIf { Regel89.validId(it) } ?: return
        val h = intent.getStringExtra("handling")?.takeIf { it in Regel89.ACTIONS && it != "rute" } ?: return
        val pend = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val api = bgApi41(ctx) ?: return@launch
                val r = runCatching { JSONObject(api.request("POST", "/live/handling", JSONObject().put("id", id).put("handling", h), prefix = Api.HOMELAB, timeout = 8_000, read = 10_000)) }.getOrNull()
                r?.optJSONObject("aktivitet")?.let { parseAkt89(it) }?.let { Live89.showOne(ctx, it) }
                Live89.kick(ctx)
            } finally { pend.finish() }
        }
    }
}

/** «Vis rute»: POST /api/live/handling {handling:"rute"} → {ok, url}, åpner kartlenken. Usynlig, ikke eksportert. */
class Live89Route : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent?.getStringExtra("id")?.takeIf { Regel89.validId(it) }
        if (id == null || savedInstanceState != null) { finish(); return }
        scope.launch {
            val url = withContext(Dispatchers.IO) {
                runCatching {
                    val api = bgApi41(this@Live89Route) ?: return@runCatching null
                    JSONObject(api.request("POST", "/live/handling", JSONObject().put("id", id).put("handling", "rute"), prefix = Api.HOMELAB, timeout = 8_000, read = 10_000)).optString("url")
                }.getOrNull()
            }
            if (Regel89.routeOk(url)) runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            finish()
        }
    }

    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}

/** Poller mens noe er aktivt; stopper av seg selv når alt er ferdig, ved utlogging eller når serveren ikke svarer. */
class Live89Service : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var started = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Android krever startForeground() raskt: et midlertidig varsel til første svar er hentet.
        try {
            val n = Notification.Builder(this, Live89.CH).setSmallIcon(R.drawable.ic_launcher_monochrome).setContentTitle("Live Updates")
                .setContentText("Oppdaterer …").setOngoing(true).setShowWhen(false).setCategory(Notification.CATEGORY_SERVICE).build()
            if (!started) {
                Live89.channel(this)
                if (Build.VERSION.SDK_INT >= 34) startForeground(FG_TMP, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else startForeground(FG_TMP, n)
            }
        } catch (_: Exception) { stopSelf(); return START_NOT_STICKY }
        if (started) return START_NOT_STICKY
        started = true; running = true
        scope.launch { loop() }
        return START_NOT_STICKY
    }

    private suspend fun loop() {
        var fails = 0
        var first = true
        try {
            while (scope.isActive) {
                val api = bgApi41(this) ?: break
                val list = try { Live89.fetch(api) } catch (e: CancellationException) { throw e } catch (e: ApiException) {
                    if (e.status == 404 || e.status == 401 || e.status == 403) break
                    null
                } catch (_: Exception) { null }
                if (list == null) { if (++fails >= 6) break; delay(15_000); continue }
                fails = 0
                val iv = Live89.show(this, list, this)
                if (first) { first = false; runCatching { (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).cancel(FG_TMP) } }
                if (iv == null) break
                delay(iv)
            }
        } finally {
            runCatching { stopForeground(STOP_FOREGROUND_DETACH) }
            runCatching { (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).cancel(FG_TMP) }
            running = false
            stopSelf()
        }
    }

    /** Android 15: dataSync har en tidsgrense (6 t per døgn). Arbeideren tar over. */
    override fun onTimeout(startId: Int, fgsType: Int) { scope.cancel(); runCatching { stopForeground(STOP_FOREGROUND_DETACH) }; stopSelf() }

    override fun onDestroy() { running = false; scope.cancel(); super.onDestroy() }

    companion object {
        private const val FG_TMP = 78_899_999
        /** Kjører tjenesten allerede? Da startes den ikke på nytt (startForegroundService krever ny startForeground). */
        @Volatile var running = false
    }
}

/** Hvert 15. min: nye aktiviteter dukker opp også når appen ikke er åpen (ingen push på Android). */
class Live89Worker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val api = bgApi41(ctx) ?: run { Live89.stopAll(ctx); return Result.success() }
        val list = try { Live89.fetch(api) } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404 || e.status == 401 || e.status == 403) Live89.stopAll(ctx)
            return Result.success()
        } catch (_: Exception) { return Result.success() }
        if (Live89.show(ctx, list) != null) Live89.startService(ctx)
        return Result.success()
    }
}
