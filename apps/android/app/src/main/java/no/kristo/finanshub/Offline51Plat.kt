package no.kristo.finanshub

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

/*
 * Prompt 51 (ANDPLAT51): offline-modus for skrivinger som tåler å vente – gjøremål og handleliste (ny oppgave, avkryssing/endring),
 * Sjekk inn (fra widgeten, snarveien og Android Auto) og notater/innlegg som går som enkle JSON-kall. Samme mønster som køen for
 * kvitteringsopplasting (upload/PendingUploads.kt): filer i filesDir/offline51/, WorkManager med nettverkskrav, overlever omstart.
 *
 * Regler:
 *  - Bare når kallet ikke kom fram (ApiException.status == 0: ingen nett, fant ikke serveren, tidsavbrudd) – aldri ved 4xx/5xx.
 *  - Per konto: et element sendes bare med kontoen som la det i køen (som kvitteringskøen, prompt 21).
 *  - Konflikt: «siste skriving vinner». For gjøremål sjekkes oppgaven før endringen sendes: er den endret på serveren etter at
 *    endringen ble lagt i køen, sendes endringen likevel, og brukeren får et varsel («… ble endret av andre mens du var frakoblet»).
 *    Er den slettet (404) eller avvist (409/410), fjernes elementet og brukeren får varsel. Andre 4xx: fjernes med varsel.
 *  - Maks 200 elementer, og elementer eldre enn 7 dager kastes (med varsel), så køen aldri vokser uten grense.
 */

data class Offline51Item(
    val id: String, val method: String, val path: String, val prefix: String, val body: String?, val label: String,
    val account: String, val created: Long, val attempts: Int = 0, val lastError: String? = null,
    /** «task» = gjøremål/handleliste (konfliktsjekk mot oppgaven), «checkin», «other». */
    val kind: String = "other", val taskId: String? = null,
)

object Offline51 {
    private const val WORK = "finanshub-offline51"
    private const val MAX = 200
    private const val MAX_AGE = 7L * 24 * 3600_000
    const val CH = "offline51"
    private val lock = Any()
    private fun root(ctx: Context) = File(ctx.applicationContext.filesDir, "offline51").apply { mkdirs() }

    /** true når feilen betyr at kallet ikke kom fram (ingen nett eller serveren svarer ikke). */
    fun isOffline(e: Throwable?): Boolean = e is ApiException && e.status == 0 && e.code == null

    /** Har telefonen et nett som er validert akkurat nå? */
    fun online(ctx: Context): Boolean = runCatching {
        val cm = ctx.getSystemService(ConnectivityManager::class.java) ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }.getOrDefault(true)

    fun list(ctx: Context): List<Offline51Item> = synchronized(lock) {
        root(ctx).listFiles { f -> f.name.endsWith(".json") }?.mapNotNull { f -> runCatching { read(JSONObject(f.readText())) }.getOrNull() }?.sortedBy { it.created } ?: emptyList()
    }

    fun count(ctx: Context): Int = list(ctx).size

    /** Legger skrivingen i køen og ber WorkManager sende den når nettet er tilbake. account = kontoen som er aktiv nå. */
    fun enqueue(ctx: Context, method: String, path: String, body: JSONObject?, label: String, prefix: String = Api.HOMELAB,
                kind: String = "other", taskId: String? = null, account: String? = null): Offline51Item = synchronized(lock) {
        val acct = account ?: runCatching { AccountStore(ctx).active() }.getOrNull() ?: ""
        val all = list(ctx)
        // Samme oppgave endret flere ganger uten nett: bare den siste endringen trengs (siste skriving vinner også lokalt).
        if (kind == "task" && method == "PATCH" && taskId != null) all.filter { it.kind == "task" && it.method == "PATCH" && it.taskId == taskId && it.account == acct }.forEach { remove(ctx, it.id) }
        if (all.size >= MAX) all.take(all.size - MAX + 1).forEach { remove(ctx, it.id) }
        val it = Offline51Item(UUID.randomUUID().toString().take(12), method, path, prefix, body?.toString(), label.take(80), acct, System.currentTimeMillis(), kind = kind, taskId = taskId)
        File(root(ctx), it.id + ".json").writeText(json(it).toString())
        schedule(ctx)
        it
    }

    fun remove(ctx: Context, id: String) { synchronized(lock) { File(root(ctx), "$id.json").delete() } }

    private fun mark(ctx: Context, it: Offline51Item, err: String) = synchronized(lock) {
        val f = File(root(ctx), it.id + ".json")
        if (f.exists()) f.writeText(json(it.copy(attempts = it.attempts + 1, lastError = err)).toString())
    }

    fun schedule(ctx: Context) {
        runCatching {
            val req = OneTimeWorkRequestBuilder<Offline51Worker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx.applicationContext).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, req)
        }
    }

    /**
     * Sender køen for kontoene på telefonen. Returnerer true når alt som kunne sendes er sendt (eller kastet),
     * false når nettet forsvant underveis (WorkManager prøver igjen).
     */
    suspend fun flush(ctx: Context): Boolean {
        val items = list(ctx)
        if (items.isEmpty()) return true
        val store = runCatching { AccountStore(ctx) }.getOrNull() ?: return true
        val accounts = runCatching { store.load() }.getOrDefault(emptyList())
        val now = System.currentTimeMillis()
        var allOk = true
        for ((acctId, group) in items.groupBy { it.account }) {
            val acc = accounts.firstOrNull { it.id == acctId } ?: if (acctId.isEmpty() && accounts.size == 1) accounts.first() else null
            if (acc == null) continue // kontoen er fjernet: blir liggende til appen tømmer køen for den
            val base = listOf(acc.server, acc.external, acc.local).firstOrNull { it.isNotBlank() } ?: continue
            val api = Api(base, acc.token)
            // Konfliktsjekk for gjøremål: én henting for hele gruppen.
            val tasks = if (group.any { it.kind == "task" && it.method == "PATCH" }) runCatching { taskStamps(api.hlGet("/tasks", timeout = 12_000)) }.getOrNull() else null
            for (it in group) {
                if (now - it.created > MAX_AGE) { remove(ctx, it.id); notify(ctx, "Ble ikke sendt", "«${it.label}» lå i køen i over en uke og er fjernet."); continue }
                if (it.kind == "task" && it.method == "PATCH" && it.taskId != null && tasks != null) {
                    val st = tasks[it.taskId]
                    if (st == null) { remove(ctx, it.id); notify(ctx, "Konflikt i Gjøremål", "«${it.label}» er slettet på serveren. Endringen din ble ikke lagret."); continue }
                    if (st > it.created) notify(ctx, "Konflikt i Gjøremål", "«${it.label}» ble endret av andre mens du var frakoblet. Din endring er lagret (siste skriving vinner).")
                }
                try {
                    api.request(it.method, it.path, it.body?.let { b -> JSONObject(b) }, prefix = it.prefix, timeout = 12_000, read = 30_000)
                    remove(ctx, it.id)
                } catch (e: ApiException) {
                    when {
                        isOffline(e) || e.status >= 500 || e.status == 429 -> { mark(ctx, it, e.message ?: "Nettverksfeil"); allOk = false }
                        e.status == 401 -> { mark(ctx, it, "Logg inn på nytt"); allOk = false }
                        e.status == 404 || e.status == 409 || e.status == 410 -> { remove(ctx, it.id); notify(ctx, "Konflikt", "«${it.label}» kunne ikke lagres: ${e.message ?: "finnes ikke lenger"}") }
                        else -> { remove(ctx, it.id); notify(ctx, "Ble ikke lagret", "«${it.label}»: ${e.message ?: "avvist av serveren"}") }
                    }
                    if (!allOk && isOffline(e)) return false
                } catch (e: Exception) { mark(ctx, it, e.message ?: "Feil"); allOk = false }
            }
        }
        return allOk
    }

    /** /api/tasks → id → updatedAt (ms). */
    private fun taskStamps(raw: String): Map<String, Long> {
        val a = JSONObject(raw).optJSONArray("items") ?: JSONArray()
        val out = HashMap<String, Long>()
        for (i in 0 until a.length()) {
            val o = a.optJSONObject(i) ?: continue
            val id = o.optString("id").ifBlank { null } ?: continue
            out[id] = o.optLong("updatedAt", 0L)
        }
        return out
    }

    private fun notify(ctx: Context, title: String, text: String) {
        runCatching {
            val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
            if (!nm.areNotificationsEnabled()) return
            if (nm.getNotificationChannel(CH) == null) nm.createNotificationChannel(NotificationChannel(CH, "Frakoblet: synk og konflikter", NotificationManager.IMPORTANCE_DEFAULT))
            val open = PendingIntent.getActivity(ctx, 5100, Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://huske"), ctx, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = android.app.Notification.Builder(ctx, CH)
                .setSmallIcon(R.drawable.ic_lock40_huske)
                .setContentTitle(title).setContentText(text)
                .setStyle(android.app.Notification.BigTextStyle().bigText(text))
                .setContentIntent(open).setAutoCancel(true).build()
            nm.notify(("offline51-" + title + text).hashCode(), n)
        }
    }

    private fun json(it: Offline51Item) = JSONObject().put("id", it.id).put("method", it.method).put("path", it.path).put("prefix", it.prefix)
        .put("body", it.body ?: JSONObject.NULL).put("label", it.label).put("account", it.account).put("created", it.created)
        .put("attempts", it.attempts).put("lastError", it.lastError ?: JSONObject.NULL).put("kind", it.kind).put("taskId", it.taskId ?: JSONObject.NULL)

    private fun read(o: JSONObject) = Offline51Item(
        o.getString("id"), o.optString("method", "POST"), o.getString("path"), o.optString("prefix", Api.HOMELAB),
        if (o.isNull("body")) null else o.optString("body"), o.optString("label"), o.optString("account"), o.optLong("created"),
        o.optInt("attempts"), if (o.isNull("lastError")) null else o.optString("lastError"), o.optString("kind", "other"),
        if (o.isNull("taskId")) null else o.optString("taskId").ifBlank { null },
    )
}

class Offline51Worker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ok = runCatching { Offline51.flush(applicationContext) }.getOrDefault(false)
        return if (ok || runAttemptCount >= 8) Result.success() else Result.retry()
    }
}

/**
 * Sender et JSON-kall, eller legger det i offline-køen når det ikke kommer fram. true = sendt nå, false = lagt i køen.
 * Kaster videre for alle andre feil (4xx/5xx), så kalleren viser feilen som før.
 */
internal suspend fun sendOrQueue51(ctx: Context, api: Api, method: String, path: String, body: JSONObject?, label: String,
                                   kind: String = "other", taskId: String? = null, prefix: String = Api.HOMELAB): Boolean {
    if (!Offline51.online(ctx)) { Offline51.enqueue(ctx, method, path, body, label, prefix, kind, taskId); return false }
    return try { api.request(method, path, body, prefix = prefix, timeout = 10_000, read = 30_000); true } catch (e: ApiException) {
        if (!Offline51.isOffline(e)) throw e
        Offline51.enqueue(ctx, method, path, body, label, prefix, kind, taskId)
        false
    }
}
