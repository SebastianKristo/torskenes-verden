package no.kristo.finanshub.widget

import android.content.Context
import androidx.glance.appwidget.updateAll
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import no.kristo.finanshub.AccountStore
import no.kristo.finanshub.Api
import no.kristo.finanshub.ApiException
import java.util.concurrent.TimeUnit

/**
 * Henter widgetdataene fra serveren hvert 15. minutt (WorkManagers korteste intervall) og når appen åpnes eller
 * en widget legges til. Bruker den aktive kontoen og prøver de andre adressene til kontoen hvis den første ikke svarer.
 */
class WidgetWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val store = AccountStore(ctx)
        val list = runCatching { store.load() }.getOrDefault(emptyList())
        val acc = list.firstOrNull { it.id == store.active() } ?: list.firstOrNull()
        if (acc == null) {
            WidgetStore.fail(ctx, "Logg inn i FinansHub", loggedIn = false)
            WidgetSync.redraw(ctx)
            return Result.success()
        }
        var err: String? = null
        for (base in listOf(acc.server, acc.local, acc.external).filter { it.isNotBlank() }.distinct()) {
            try {
                val json = Api(base, acc.token).hlGet("/mobile/widgets", timeout = 8_000)
                WidgetStore.save(ctx, json, System.currentTimeMillis())
                WidgetSync.redraw(ctx)
                return Result.success()
            } catch (e: ApiException) {
                err = e.message
                if (e.status == 401 || e.status == 404) break
            } catch (e: Exception) {
                err = e.message
            }
        }
        WidgetStore.fail(ctx, err ?: "Fikk ikke kontakt med serveren")
        WidgetSync.redraw(ctx)
        return if (runAttemptCount < 2) Result.retry() else Result.success()
    }
}

object WidgetSync {
    private const val PERIODIC = "finanshub-widgets"
    private const val NOW = "finanshub-widgets-now"

    /** Hver 15. minutt med nett. Beholdes hvis den allerede er satt opp. */
    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<WidgetWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** Henter med en gang (appen åpnet, widget lagt til, innlogging eller kontobytte). */
    fun refresh(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<WidgetWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, req)
    }

    /** Nytt utseende for Samsung-widgetene: tegnes på nytt uten ny henting. */
    fun styleChanged(ctx: Context) {
        WidgetStore.reloadStyle(ctx)
        refresh(ctx)
    }

    /** Tegner alle widgetene på nytt (også dem som ikke har en åpen økt). */
    suspend fun redraw(ctx: Context) {
        ALL_WIDGETS.forEach { w -> runCatching { w.updateAll(ctx) } }
    }
}
