package no.kristo.finanshub.family

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/**
 * Helse fra Health Connect: et sammendrag (skritt, hvilepuls, puls, søvn, aktive kalorier og siste 7 dager) sendes til
 * /api/family/health hvert 15. minutt. Bare feltene brukeren har valgt å dele leses og sendes.
 */
object HealthSync {
    private const val PERIODIC = "finanshub-health"
    private const val NOW = "finanshub-health-now"

    /** Tillatelsene per felt (lese). */
    fun permissionsFor(keys: Set<String>): Set<String> = buildSet {
        if ("steps" in keys || "week" in keys) add(HealthPermission.getReadPermission(StepsRecord::class))
        if ("restingHr" in keys || "week" in keys) add(HealthPermission.getReadPermission(RestingHeartRateRecord::class))
        if ("hr" in keys) add(HealthPermission.getReadPermission(HeartRateRecord::class))
        if ("sleep" in keys || "week" in keys) add(HealthPermission.getReadPermission(SleepSessionRecord::class))
        if ("activeKcal" in keys || "week" in keys) add(HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class))
    }

    /** 0 = tilgjengelig, 1 = må installeres/oppdateres, 2 = finnes ikke på denne telefonen. */
    fun status(ctx: Context): Int = when (HealthConnectClient.getSdkStatus(ctx)) {
        HealthConnectClient.SDK_AVAILABLE -> 0
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> 1
        else -> 2
    }

    suspend fun granted(ctx: Context): Set<String> = if (status(ctx) != 0) emptySet() else
        runCatching { HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions() }.getOrDefault(emptySet())

    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<HealthWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
    }
    fun cancel(ctx: Context) { WorkManager.getInstance(ctx).cancelUniqueWork(PERIODIC) }
    fun now(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<HealthWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, req)
    }

    /** Leser dagens tall og de siste 7 dagene. Felter uten tillatelse eller uten data blir utelatt. */
    suspend fun summary(ctx: Context, keys: Set<String>): JSONObject? {
        if (status(ctx) != 0 || keys.isEmpty()) return null
        val client = HealthConnectClient.getOrCreate(ctx)
        val granted = runCatching { client.permissionController.getGrantedPermissions() }.getOrDefault(emptySet())
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        fun range(d: LocalDate) = TimeRangeFilter.between(d.atStartOfDay(zone).toInstant(), d.plusDays(1).atStartOfDay(zone).toInstant())
        // Søvnen som slutter i dag regnes fra kl. 18 i går.
        fun sleepRange(d: LocalDate) = TimeRangeFilter.between(d.minusDays(1).atTime(18, 0).atZone(zone).toInstant(), d.atTime(18, 0).atZone(zone).toInstant())
        val can = { c: kotlin.reflect.KClass<out androidx.health.connect.client.records.Record> -> HealthPermission.getReadPermission(c) in granted }

        suspend fun day(d: LocalDate, withHr: Boolean): JSONObject {
            val o = JSONObject().put("date", d.toString())
            if (can(StepsRecord::class)) runCatching {
                client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), range(d)))[StepsRecord.COUNT_TOTAL]
            }.getOrNull()?.let { o.put("steps", it) }
            if (can(ActiveCaloriesBurnedRecord::class)) runCatching {
                client.aggregate(AggregateRequest(setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), range(d)))[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]
            }.getOrNull()?.let { o.put("activeKcal", Math.round(it.inKilocalories)) }
            if (can(RestingHeartRateRecord::class)) runCatching {
                client.aggregate(AggregateRequest(setOf(RestingHeartRateRecord.BPM_AVG), range(d)))[RestingHeartRateRecord.BPM_AVG]
            }.getOrNull()?.let { o.put("restingHr", it) }
            if (can(SleepSessionRecord::class)) runCatching {
                client.aggregate(AggregateRequest(setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL), sleepRange(d)))[SleepSessionRecord.SLEEP_DURATION_TOTAL]
            }.getOrNull()?.let { o.put("sleepMin", it.toMinutes()) }
            if (withHr && can(HeartRateRecord::class)) runCatching {
                client.aggregate(AggregateRequest(setOf(HeartRateRecord.BPM_AVG), range(d)))[HeartRateRecord.BPM_AVG]
            }.getOrNull()?.let { o.put("hr", it) }
            return o
        }

        val t = day(today, "hr" in keys)
        val out = JSONObject().put("date", today.toString())
        if ("steps" in keys && t.has("steps")) out.put("steps", t.get("steps"))
        if ("restingHr" in keys && t.has("restingHr")) out.put("restingHr", t.get("restingHr"))
        if ("hr" in keys && t.has("hr")) out.put("hr", t.get("hr"))
        if ("sleep" in keys && t.has("sleepMin")) out.put("sleepMin", t.get("sleepMin"))
        if ("activeKcal" in keys && t.has("activeKcal")) out.put("activeKcal", t.get("activeKcal"))
        if ("week" in keys) {
            val w = JSONArray()
            for (i in 6 downTo 0) w.put(if (i == 0) t else day(today.minusDays(i.toLong()), false))
            out.put("week", w)
        }
        return out
    }
}

class HealthWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val keys = FamilyPrefs.health(ctx)
        if (keys.isEmpty()) return Result.success()
        val body = runCatching { HealthSync.summary(ctx, keys) }.getOrNull() ?: return Result.success()
        val api = FamilyPrefs.api(ctx) ?: return Result.success()
        return try { api.hlPost("/family/health", body); Result.success() } catch (e: Exception) { if (runAttemptCount < 2) Result.retry() else Result.success() }
    }
}
