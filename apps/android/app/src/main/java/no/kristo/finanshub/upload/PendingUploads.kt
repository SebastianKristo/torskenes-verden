package no.kristo.finanshub.upload

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import no.kristo.finanshub.AccountStore
import no.kristo.finanshub.Api
import no.kristo.finanshub.ApiException
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Én kvittering som venter på opplasting: delene (original, skannekopi, miniatyr) ligger som filer i filesDir/pending/<id>/. */
data class PendingUpload(
    val id: String, val path: String, val name: String, val created: Long, val attempts: Int, val lastError: String?,
    val parts: List<PendingPart>,
    /** Kontoen som la kvitteringen i køen (prompt 21). Den lastes bare opp med denne kontoens innlogging. Tom = eldre versjon. */
    val account: String = "",
)
data class PendingPart(val field: String, val filename: String, val mime: String, val file: String)

/**
 * «Venter på opplasting»: kvitteringer som ikke kom fram (uten nett, mistet forbindelse eller feil på serveren) lagres
 * på telefonen og lastes opp av seg selv når nettet er tilbake (WorkManager med nettverkskrav), eller med «Prøv igjen».
 * Overlever at appen lukkes og at telefonen startes på nytt.
 */
object PendingUploads {
    private const val WORK = "finanshub-pending-uploads"
    private fun root(ctx: Context) = File(ctx.filesDir, "pending").apply { mkdirs() }
    private val lock = Any()

    fun list(ctx: Context): List<PendingUpload> = synchronized(lock) {
        root(ctx).listFiles()?.mapNotNull { dir -> runCatching { read(File(dir, "meta.json")) }.getOrNull() }?.sortedBy { it.created } ?: emptyList()
    }

    /**
     * Køen for én konto. Elementer uten konto (fra før prompt 21) regnes som kontoens bare når det bare finnes én konto
     * på telefonen (legacy = true); ellers blir de liggende til brukeren fjerner dem.
     */
    fun listFor(ctx: Context, account: String, legacy: Boolean): List<PendingUpload> =
        list(ctx).filter { it.account == account || (legacy && it.account.isEmpty()) }

    /** Legger kvitteringen i køen. path er endepunktet under /finans/api (f.eks. /receipts eller /folders/3/receipts). */
    fun add(ctx: Context, path: String, name: String, parts: List<Api.Part>, error: String?, account: String = ""): PendingUpload = synchronized(lock) {
        val id = UUID.randomUUID().toString().take(12)
        val dir = File(root(ctx), id).apply { mkdirs() }
        val saved = parts.mapIndexed { i, p ->
            val f = "part$i.bin"
            File(dir, f).writeBytes(p.data)
            PendingPart(p.name, p.filename, p.mime, f)
        }
        val u = PendingUpload(id, path, name, System.currentTimeMillis(), 0, error, saved, account)
        write(File(dir, "meta.json"), u)
        u
    }

    fun remove(ctx: Context, id: String) = synchronized(lock) { File(root(ctx), id).deleteRecursively() }

    private fun parts(ctx: Context, u: PendingUpload): List<Api.Part> =
        u.parts.map { p -> Api.Part(p.field, p.filename, p.mime, File(File(root(ctx), u.id), p.file).readBytes()) }

    private fun mark(ctx: Context, u: PendingUpload, error: String) = synchronized(lock) {
        val f = File(File(root(ctx), u.id), "meta.json")
        if (f.exists()) write(f, u.copy(attempts = u.attempts + 1, lastError = error))
    }

    /**
     * Prøver å laste opp alt i køen med kontoen og adressen. Returnerer antall som kom fram.
     * Feil fra serveren som ikke går over av seg selv (4xx, f.eks. ugyldig fil) fjernes ikke, men merkes, så brukeren kan velge.
     */
    suspend fun flush(ctx: Context, api: Api, account: String, legacy: Boolean): Int {
        var ok = 0
        for (u in listFor(ctx, account, legacy)) {
            try {
                api.upload(u.path, parts(ctx, u))
                remove(ctx, u.id); ok++
            } catch (e: ApiException) {
                mark(ctx, u, e.message ?: "Feil")
                if (e.status == 0) break // fortsatt uten nett: resten venter også
            } catch (e: Exception) {
                mark(ctx, u, e.message ?: "Feil")
            }
        }
        return ok
    }

    /** Ber WorkManager laste opp når det finnes nett (bare Wi-Fi hvis det er valgt i appen). */
    fun schedule(ctx: Context, wifiOnly: Boolean) {
        if (list(ctx).isEmpty()) return
        val req = OneTimeWorkRequestBuilder<PendingUploadWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, req)
    }

    private fun read(f: File): PendingUpload {
        val o = JSONObject(f.readText())
        val parts = o.optJSONArray("parts") ?: JSONArray()
        return PendingUpload(
            o.getString("id"), o.getString("path"), o.optString("name"), o.optLong("created"), o.optInt("attempts"),
            o.optString("lastError").takeIf { it.isNotBlank() && it != "null" },
            (0 until parts.length()).map { i -> parts.getJSONObject(i).let { PendingPart(it.getString("field"), it.optString("filename"), it.optString("mime"), it.getString("file")) } },
            o.optString("account", ""),
        )
    }

    private fun write(f: File, u: PendingUpload) {
        val parts = JSONArray()
        u.parts.forEach { p -> parts.put(JSONObject().put("field", p.field).put("filename", p.filename).put("mime", p.mime).put("file", p.file)) }
        f.writeText(JSONObject().put("id", u.id).put("path", u.path).put("name", u.name).put("created", u.created).put("attempts", u.attempts)
            .put("lastError", u.lastError ?: "").put("parts", parts).put("account", u.account).toString())
    }
}

/** Laster opp køen i bakgrunnen, også når appen er lukket. Prøver alle adressene til den aktive kontoen. */
class PendingUploadWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (PendingUploads.list(ctx).isEmpty()) return Result.success()
        val store = AccountStore(ctx)
        val accs = runCatching { store.load() }.getOrDefault(emptyList())
        if (accs.isEmpty()) return Result.success()
        // Hver konto laster opp sine egne kvitteringer med sin egen innlogging (aldri til en annen brukers konto).
        val legacy = accs.size == 1
        for (acc in accs) {
            if (PendingUploads.listFor(ctx, acc.id, legacy).isEmpty()) continue
            for (base in listOf(acc.server, acc.local, acc.external).filter { it.isNotBlank() }.distinct()) {
                runCatching { PendingUploads.flush(ctx, Api(base, acc.token), acc.id, legacy) }
                if (PendingUploads.listFor(ctx, acc.id, legacy).isEmpty()) break
            }
        }
        if (PendingUploads.list(ctx).none { legacy || it.account.isNotEmpty() }) return Result.success()
        // Noe står igjen: prøv igjen senere (WorkManager venter med økende pause).
        val known = accs.map { it.id }.toSet()
        return if (PendingUploads.list(ctx).any { it.attempts < 8 && (it.account in known || (legacy && it.account.isEmpty())) }) Result.retry() else Result.success()
    }
}
