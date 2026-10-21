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
            TasksStore.useAccount(ctx, null)
            Bd24WidgetStore.useAccount(ctx, null)
            Deps24Store.useAccount(ctx, null)
            Kal26WidgetStore.useAccount(ctx, null)
            Ruter27Store.useAccount(ctx, null)
            Trials32bStore.useAccount(ctx, null)
            WidgetStore.fail(ctx, "Logg inn i FinansHub", loggedIn = false)
            WidgetSync.redraw(ctx)
            return Result.success()
        }
        // Data fra en annen konto enn den aktive vises aldri (kontobytte uten nett).
        WidgetStore.useAccount(ctx, acc.id)
        TasksStore.useAccount(ctx, acc.id)
        Bd24WidgetStore.useAccount(ctx, acc.id)
        Deps24Store.useAccount(ctx, acc.id)
        Kal26WidgetStore.useAccount(ctx, acc.id)
        Ruter27Store.useAccount(ctx, acc.id)
        Trials32bStore.useAccount(ctx, acc.id)
        Brief34Store.useAccount(ctx, acc.id)
        Bible37Store.useAccount(ctx, acc.id)
        Media43Store.useAccount(ctx, acc.id)
        var err: String? = null
        for (base in listOf(acc.server, acc.local, acc.external).filter { it.isNotBlank() }.distinct()) {
            try {
                val json = Api(base, acc.token).hlGet("/mobile/widgets", timeout = 8_000)
                WidgetStore.save(ctx, json, System.currentTimeMillis(), acc.id)
                WidgetSync.redraw(ctx)
                // Huskeliste-widgeten har egne data (/api/tasks/next).
                runCatching { TasksStore.save(ctx, Api(base, acc.token).hlGet("/tasks/next?n=6", timeout = 8_000)); TasksWidgetSync.redraw(ctx) }
                // Prompt 24: bursdager og avganger (Bursdager-widgeten og Samsung-widgetene).
                runCatching { fetch24(ctx, Api(base, acc.token)); S24.redraw(ctx) }
                // Prompt 26: Kalender-widgetene (lagrer, tegner på nytt og planlegger neste timegrense).
                runCatching { fetchKal26(ctx, Api(base, acc.token), acc.id) }
                // Prompt 27: Ruter-widgetene (egen 5-minutters kjede i Ruter27Worker; her også hvert 15. minutt).
                runCatching { fetchRuter27(ctx, Api(base, acc.token), acc.id); Ruter27Widgets.redraw(ctx) }
                // Prompt 32: prøveperiode-widgetene (/api/widgets/trials) og logoene.
                runCatching { fetchTrials32b(ctx, Api(base, acc.token), acc.id); Trials32bWidgets.redraw(ctx) }
                // Prompt 34: Glimt-brief-widgetene (morgen/dag/kveld) og «Morgenbrief er klar».
                runCatching { fetchBrief34(ctx, Api(base, acc.token), acc.id); Brief34Widgets.redraw(ctx) }
                // Prompt 37: bibelvers-widgetene (bare med modulen; ellers slås mottakerne av).
                runCatching { fetchBible37(ctx, Api(base, acc.token), acc.id, acc.username) }
                // Prompt 43: Media-widgetene (/api/widgets/media; 404 = eldre server).
                runCatching { fetchMedia43(ctx, Api(base, acc.token), acc.id); Media43Widgets.redraw(ctx) }
                // Prompt 40: Hjemlys – varsler om husstanden og egen økt også når appen er lukket (404 = eldre server).
                runCatching { no.kristo.finanshub.pollHjemlys40(ctx, Api(base, acc.token)) }
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
        // Prompt 24: Samsung-widgetene (bare på Samsung) og bursdagene like etter midnatt.
        runCatching { S24.enableProviders(ctx) }
        // Prompt 33: Samsung-variantene av prøveperiode-widgetene er på fra installasjonen; av på andre telefoner.
        runCatching { no.kristo.finanshub.Widgets33.fix(ctx) }
        runCatching { S24.scheduleMidnight(ctx) }
        // Prompt 27: Ruter-widgetene hentes hvert 5. minutt så lenge en av dem ligger på hjemskjermen.
        runCatching { Ruter27Widgets.ensure(ctx) }
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
        S24.redraw(ctx)
        runCatching { Kal26Widgets.redraw(ctx) }
        runCatching { Ruter27Widgets.redraw(ctx) }
        runCatching { Trials32bWidgets.redraw(ctx) }
        runCatching { Brief34Widgets.redraw(ctx) }
        runCatching { Bible37Widgets.redraw(ctx) }
        // Prompt 40: låseskjerm-widgetene (RemoteViews) og genererte forhåndsvisninger i widgetvelgeren (Android 15+).
        runCatching { Lock40.syncBible(ctx); Lock40.redraw(ctx) }
        runCatching { Preview40.publish(ctx) }
        runCatching { HjemlysWidget40.redraw(ctx) }
        runCatching { Media43Widgets.redraw(ctx) } // prompt 43
    }
}
