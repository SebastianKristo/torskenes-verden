package no.kristo.finanshub.widget

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.flow.MutableStateFlow
import no.kristo.finanshub.AccountStore
import no.kristo.finanshub.Api
import no.kristo.finanshub.AppPrefs
import no.kristo.finanshub.Bd24
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.bdSort
import no.kristo.finanshub.family.FamilyPrefs
import no.kristo.finanshub.parseBdList24
import no.kristo.finanshub.parseStopDeps
import no.kristo.finanshub.ruterModeColor
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.time.Duration
import java.time.LocalDateTime
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.abs

/*
 * Prompt 24 (A):
 *  - Bursdager-widget (Glance, Material You): «Bursdager» med + (ny bursdag) og de tre neste som piller.
 *  - Samsung One UI-widgets i Samsungs egen størrelse: det synlige kortet er 134 × 155 dp (2×2) eller 296 × 155 dp (4×2),
 *    radius 20, innvendig 12 dp, innhold forankret nederst, stort tall 30 sp. Providerne er av i manifestet og slås på
 *    bare når Build.MANUFACTURER er samsung (andre telefoner beholder Material You-widgetene).
 *  - Bursdagene oppdateres hvert 15. minutt (WidgetWorker), når appen endrer dem, og like etter midnatt (00:05).
 */

/* ---------------- Data ---------------- */

/** Bursdagene i widgetene: lagres kompakt (navn, dato, år og hvem), dager igjen regnes ut når widgeten tegnes. */
object Bd24WidgetStore {
    private const val FILE = "bd24_widgets"
    val items = MutableStateFlow<List<Bd24>?>(null)
    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun current(ctx: Context): List<Bd24> = items.value ?: bdSort(runCatching { parseBdList24(sp(ctx).getString("json", null) ?: "[]") }.getOrDefault(emptyList())).also { items.value = it }

    /** Fra appen: lagrer og tegner widgetene på nytt. */
    fun save(ctx: Context, l: List<Bd24>) {
        val app = ctx.applicationContext
        val a = JSONArray().apply { bdSort(l).take(8).forEach { put(it.toJson()) } }
        sp(app).edit().putString("json", JSONObject().put("items", a).toString()).apply()
        items.value = bdSort(l)
        Thread { runCatching { kotlinx.coroutines.runBlocking { S24.redraw(app) } } }.start()
    }

    fun saveRaw(ctx: Context, raw: String) {
        val l = parseBdList24(raw)
        sp(ctx).edit().putString("json", JSONObject().put("items", JSONArray().apply { l.take(8).forEach { put(it.toJson()) } }).toString()).apply()
        items.value = l
    }

    /** Brukerskille: ny konto eller utlogging tømmer bursdagene i widgetene. */
    fun useAccount(ctx: Context, acct: String?) {
        val p = sp(ctx)
        if (acct != null && p.getString("acct", null) == acct) return
        p.edit().remove("json").apply { if (acct != null) putString("acct", acct) else remove("acct") }.apply()
        items.value = emptyList()
    }
}

/** Én avgang i Avganger-widgeten (minutter regnes ned fra hentetidspunktet). */
data class WDep24(val line: String, val to: String, val color: Long, val textColor: Long, val min: Int?, val time: String?)
data class WDeps24(val stop: String, val deps: List<WDep24>, val at: Long)

object Deps24Store {
    private const val FILE = "deps24_widgets"
    val data = MutableStateFlow<WDeps24?>(null)
    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun current(ctx: Context): WDeps24? = data.value ?: sp(ctx).getString("json", null)?.let { parse(it, sp(ctx).getLong("at", 0)) }.also { data.value = it }

    fun save(ctx: Context, raw: String, stopName: String?) {
        val at = System.currentTimeMillis()
        val o = JSONObject(raw)
        if (stopName != null) o.put("stopName", stopName)
        sp(ctx).edit().putString("json", o.toString()).putLong("at", at).apply()
        data.value = parse(o.toString(), at)
    }

    fun useAccount(ctx: Context, acct: String?) {
        val p = sp(ctx)
        if (acct != null && p.getString("acct", null) == acct) return
        p.edit().remove("json").remove("at").apply { if (acct != null) putString("acct", acct) else remove("acct") }.apply()
        data.value = null
    }

    private fun parse(raw: String, at: Long): WDeps24? = runCatching {
        val o = JSONObject(raw)
        val sd = parseStopDeps(raw)
        val name = o.optString("stopName").takeIf { it.isNotBlank() } ?: o.optJSONObject("stop")?.optString("name")?.takeIf { it.isNotBlank() }
            ?: o.optString("stop").takeIf { it.isNotBlank() && !it.startsWith("{") } ?: sd.stop.name
        WDeps24(name, sd.departures.filter { !it.cancelled }.map { d ->
            WDep24(d.line, d.to, d.color ?: ruterModeColor(d.mode, d.line), d.textColor ?: 0xFFFFFFFF, d.minutes, d.expected ?: d.aimed)
        }, at)
    }.getOrNull()
}

/** Henter bursdager og avganger til widgetene (fra WidgetWorker og midnattsjobben). */
internal suspend fun fetch24(ctx: Context, api: Api) {
    runCatching {
        val raw = runCatching { api.hlGet("/widgets/birthdays", timeout = 8_000) }.getOrNull() ?: api.hlGet("/birthdays", timeout = 8_000)
        Bd24WidgetStore.saveRaw(ctx, raw)
    }
    runCatching {
        val stops = runCatching { JSONObject(api.hlGet("/me/stops", timeout = 8_000)).optJSONArray("stops") }.getOrNull()
            ?: runCatching { JSONArray(api.hlGet("/me/stops", timeout = 8_000)) }.getOrNull()
        val first = stops?.optJSONObject(0)
        val id = first?.optString("id")?.takeIf { it.isNotBlank() }
        val raw = if (id != null) api.hlGet("/ruter/departures?stop=" + java.net.URLEncoder.encode(id, "UTF-8") + "&n=6", timeout = 12_000)
        else api.hlGet("/widgets/ruter", timeout = 12_000)
        Deps24Store.save(ctx, raw, first?.optString("name")?.takeIf { it.isNotBlank() })
    }
}

/** Like etter midnatt: dager igjen og «I dag» i bursdagswidgetene stemmer for den nye dagen. */
class Midnight24Worker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        Bd24WidgetStore.items.value = Bd24WidgetStore.current(ctx).let(::bdSort)
        FamilyPrefs.api(ctx)?.let { runCatching { fetch24(ctx, it) } }
        S24.redraw(ctx)
        return Result.success()
    }
}

/* ---------------- Samsung-providerne og oppsett ---------------- */

object S24 {
    private const val MIDNIGHT = "finanshub-bd24-midnight"

    /** Samsung-providerne (av i manifestet). */
    private val SAMSUNG: List<Class<*>> = listOf(
        S24ScanReceiver::class.java, S24TasksReceiver::class.java, S24TasksWideReceiver::class.java, S24BirthdaysReceiver::class.java,
        S24PackagesReceiver::class.java, S24DeparturesReceiver::class.java, S24DeparturesWideReceiver::class.java, S24BalanceReceiver::class.java,
        // Prompt 26: Kalender i 134 × 155, 296 × 155 og 296 × 330 dp.
        S24KalReceiver26S::class.java, S24KalReceiver26M::class.java, S24KalReceiver26L::class.java,
        // Prompt 27: Ruter liten, bred og stabel.
        S27RuterSmallReceiver::class.java, S27RuterWideReceiver::class.java, S27RuterStackReceiver::class.java,
    )

    val isSamsung: Boolean get() = Build.MANUFACTURER.equals("samsung", ignoreCase = true)

    /** Slår på Samsung-widgetene på Samsung-telefoner (bare når tilstanden må endres). */
    fun enableProviders(ctx: Context) {
        if (!isSamsung) return
        val pm = ctx.packageManager
        SAMSUNG.forEach { c ->
            runCatching {
                val cn = ComponentName(ctx, c)
                if (pm.getComponentEnabledSetting(cn) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED)
                    pm.setComponentEnabledSetting(cn, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
            }
        }
    }

    /** Daglig kl. 00:05 (WorkManager kan forskyve litt). */
    fun scheduleMidnight(ctx: Context) {
        val now = LocalDateTime.now()
        var at = now.toLocalDate().atTime(0, 5)
        if (!at.isAfter(now)) at = at.plusDays(1)
        val delay = Duration.between(now, at).toMinutes().coerceAtLeast(1)
        val req = PeriodicWorkRequestBuilder<Midnight24Worker>(24, TimeUnit.HOURS).setInitialDelay(delay, TimeUnit.MINUTES).build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(MIDNIGHT, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    val ALL: List<GlanceAppWidget> get() = listOf(
        BirthdaysWidget24(), S24ScanWidget(), S24TasksWidget(), S24TasksWideWidget(), S24BirthdaysWidget(),
        S24PackagesWidget(), S24DeparturesWidget(), S24DeparturesWideWidget(), S24BalanceWidget(),
    )

    suspend fun redraw(ctx: Context) { ALL.forEach { w -> runCatching { w.updateAll(ctx) } } }

    /** «Papir-farger» per widget (Rediger widget). Standard: One UI-/Material You-farger. */
    fun papir(ctx: Context, id: Int): Boolean = ctx.getSharedPreferences("bd24_widgets", Context.MODE_PRIVATE).getBoolean("papir_$id", false)
    fun setPapir(ctx: Context, id: Int, on: Boolean) {
        ctx.getSharedPreferences("bd24_widgets", Context.MODE_PRIVATE).edit().putBoolean("papir_$id", on).apply()
        papirFlow.value = papirFlow.value + (id to on)
    }
    val papirFlow = MutableStateFlow<Map<Int, Boolean>>(emptyMap())
}

/* ---------------- Felles ---------------- */

private val nb24 = Locale("nb", "NO")

private fun open24(ctx: Context, route: String): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://$route"), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

private fun cp(c: Long) = ColorProvider(Color(c))
private fun cp(c: Color) = ColorProvider(c)

@Composable
private fun Tx(text: String, size: TextUnit, color: ColorProvider, weight: FontWeight = FontWeight.Normal, maxLines: Int = 1, modifier: GlanceModifier = GlanceModifier) =
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight), maxLines = maxLines)

/** Rund avatar med initialer i fargen til «hvem» (Familie, Venn, Jobb, Annet). */
@Composable
private fun Ava(b: Bd24, size: Dp = 26.dp) {
    Box(GlanceModifier.size(size).cornerRadius(size / 2).background(cp(b.color)), contentAlignment = Alignment.Center) {
        Tx(b.initials, if (size >= 30.dp) 11.sp else 10.sp, cp(Color.White), FontWeight.Bold)
    }
}

/** Farger for Samsung-kortene: One UI/Material You (dynamisk) eller Papir (rød #b23a2a og hvit). */
private class SPal(val bg: ColorProvider, val fg: ColorProvider, val sub: ColorProvider, val chip: ColorProvider, val onChip: ColorProvider)

@Composable
private fun palette(papir: Boolean, accent: Boolean): SPal {
    val c = GlanceTheme.colors
    return when {
        papir && accent -> SPal(cp(0xFFB23A2A), cp(Color.White), cp(Color.White.copy(alpha = .85f)), cp(0x2EFFFFFF), cp(Color.White))
        papir -> SPal(cp(Color.White), cp(0xFF1B1A17), cp(0xFF7A7468), cp(0xFF1B1A17), cp(Color.White))
        accent -> SPal(c.primary, c.onPrimary, c.onPrimary, c.primaryContainer, c.onPrimaryContainer)
        else -> SPal(c.widgetBackground, c.onSurface, c.onSurfaceVariant, c.primary, c.onPrimary)
    }
}

/**
 * Det synlige kortet: 134 × 155 dp (2×2) eller 296 × 155 dp (4×2), sentrert i cellen så det flukter med Samsungs
 * egne widgets (samme ytre marg som Vær), radius 20 og innvendig 12 dp.
 */
@Composable
private fun SCard(route: String, bg: ColorProvider, wide: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    val ctx = LocalContext.current
    val size = LocalSize.current
    val w = if (wide) 296.dp else 134.dp
    val h = 155.dp
    val padH = ((size.width - w) / 2).coerceAtLeast(0.dp)
    val padV = ((size.height - h) / 2).coerceAtLeast(0.dp)
    Box(GlanceModifier.fillMaxSize().padding(horizontal = padH, vertical = padV)) {
        Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(20.dp).background(bg).padding(12.dp).clickable(open24(ctx, route)), content = content)
    }
}

@Composable
private fun ColumnScope.Grow() = Spacer(GlanceModifier.defaultWeight())

private fun kr24(ctx: Context, v: Double): String = if (AppPrefs(ctx).bool(AppPrefs.HIDE_AMOUNTS)) "•••"
    else (if (v < 0) "−" else "") + NumberFormat.getNumberInstance(nb24).apply { maximumFractionDigits = 0 }.format(abs(v)).replace(' ', ' ').replace(' ', ' ')

/** Felles for de nye widgetene: tegnes på nytt når dataene endres. */
abstract class W24(private val kind: String) : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val bd0 = Bd24WidgetStore.current(context)
        val d0 = WidgetStore.current(context)
        val dep0 = Deps24Store.current(context)
        val t0 = TasksStore.current(context)
        val appId = runCatching { GlanceAppWidgetManager(context).getAppWidgetId(id) }.getOrDefault(0)
        val pap0 = S24.papir(context, appId)
        provideContent {
            val bd by Bd24WidgetStore.items.collectAsState()
            val d by WidgetStore.data.collectAsState()
            val dep by Deps24Store.data.collectAsState()
            val t by TasksStore.items.collectAsState()
            val pap by S24.papirFlow.collectAsState()
            GlanceTheme { Body24(kind, bdSort(bd ?: bd0), d ?: d0, dep ?: dep0, t ?: t0, pap[appId] ?: pap0) }
        }
    }
}

class BirthdaysWidget24 : W24("bd")
class S24ScanWidget : W24("s_scan")
class S24TasksWidget : W24("s_tasks")
class S24TasksWideWidget : W24("s_tasks_wide")
class S24BirthdaysWidget : W24("s_bd")
class S24PackagesWidget : W24("s_pk")
class S24DeparturesWidget : W24("s_dep")
class S24DeparturesWideWidget : W24("s_dep_wide")
class S24BalanceWidget : W24("s_bal")

abstract class Receiver24 : GlanceAppWidgetReceiver() {
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetSync.schedule(context)
        WidgetSync.refresh(context)
    }
}

class BirthdaysReceiver24 : Receiver24() { override val glanceAppWidget: GlanceAppWidget = BirthdaysWidget24() }
class S24ScanReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24ScanWidget() }
class S24TasksReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24TasksWidget() }
class S24TasksWideReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24TasksWideWidget() }
class S24BirthdaysReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24BirthdaysWidget() }
class S24PackagesReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24PackagesWidget() }
class S24DeparturesReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24DeparturesWidget() }
class S24DeparturesWideReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24DeparturesWideWidget() }
class S24BalanceReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24BalanceWidget() }

private val TASK24 = ActionParameters.Key<String>("task24_id")

/** Ring i Samsung-Huskeliste: krysses av med en gang, serveren oppdateres, og alle oppgavewidgetene tegnes på nytt. */
class S24ToggleTask : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[TASK24] ?: return
        TasksStore.markDone(context, id)
        runCatching {
            val api = FamilyPrefs.api(context) ?: return@runCatching
            api.request("PATCH", "/tasks/" + java.net.URLEncoder.encode(id, "UTF-8"), JSONObject().put("done", true), prefix = Api.HOMELAB)
            TasksStore.save(context, api.hlGet("/tasks/next?n=6", timeout = 8_000))
        }
        runCatching { TasksWidgetSync.redraw(context) }
        S24.redraw(context)
    }
}

/* ---------------- Innholdet ---------------- */

@Composable
private fun Body24(kind: String, bd: List<Bd24>, d: WidgetData, dep: WDeps24?, tasks: List<WTask>, papir: Boolean) {
    when (kind) {
        "bd" -> MaterialBirthdays(bd)
        "s_bd" -> SBirthdays(bd, papir)
        "s_scan" -> SScan(papir)
        "s_tasks" -> STasks(tasks, papir, wide = false)
        "s_tasks_wide" -> STasks(tasks, papir, wide = true)
        "s_pk" -> SPackages(d, papir)
        "s_dep" -> SDepartures(dep, papir, wide = false)
        "s_dep_wide" -> SDepartures(dep, papir, wide = true)
        "s_bal" -> SBalance(d, papir)
    }
}

/** Material You (alle telefoner): «Bursdager» med +, og de tre neste som piller. */
@Composable
private fun MaterialBirthdays(bd: List<Bd24>) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    val size = LocalSize.current
    val rows = if (size.height < 150.dp) 2 else 3
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.primaryContainer).padding(14.dp).clickable(open24(ctx, "bursdager"))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Tx("Bursdager", 15.sp, c.onPrimaryContainer, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
            Box(GlanceModifier.size(30.dp).cornerRadius(15.dp).background(c.primary).clickable(open24(ctx, "bursdager/new")), contentAlignment = Alignment.Center) {
                Tx("+", 18.sp, c.onPrimary, FontWeight.Bold)
            }
        }
        if (bd.isEmpty()) {
            Spacer(GlanceModifier.height(8.dp))
            Tx("Ingen bursdager ennå. Trykk + for å legge til.", 12.5.sp, c.onPrimaryContainer, maxLines = 3)
        }
        bd.take(rows).forEach { b ->
            Spacer(GlanceModifier.height(8.dp))
            Row(GlanceModifier.fillMaxWidth().height(34.dp).cornerRadius(17.dp).background(c.surface).padding(start = 4.dp, end = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Ava(b)
                Spacer(GlanceModifier.width(8.dp))
                Tx(b.name, 12.5.sp, c.onSurface, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
                Tx(b.whenText, 11.5.sp, if (b.daysLeft <= 7) c.error else c.onSurface, FontWeight.Bold)
            }
        }
    }
}

/** Samsung 2×2: rød flate (Papir) eller aksentfarge, gaveikon øverst til høyre, nederst «15 dager», navn og «Fyller 41 · 2. nov». */
@Composable
private fun SBirthdays(bd: List<Bd24>, papir: Boolean) {
    val u = palette(papir, accent = true)
    val h = bd.firstOrNull()
    val same = if (h == null) emptyList() else bd.filter { it.daysLeft == h.daysLeft }
    SCard("bursdager", u.bg) {
        Row(GlanceModifier.fillMaxWidth()) {
            Spacer(GlanceModifier.defaultWeight())
            Box(GlanceModifier.size(40.dp).cornerRadius(20.dp).background(u.chip), contentAlignment = Alignment.Center) {
                Image(ImageProvider(no.kristo.finanshub.R.drawable.ic_gift24), contentDescription = null, modifier = GlanceModifier.size(22.dp), colorFilter = ColorFilter.tint(u.onChip))
            }
        }
        Grow()
        if (h == null) {
            Tx("Ingen", 14.sp, u.fg, FontWeight.Bold)
            Tx("Legg til i appen", 12.sp, u.sub, FontWeight.Medium)
        } else {
            Row(verticalAlignment = Alignment.Bottom) {
                Tx(if (h.daysLeft == 0) "I dag" else "${h.daysLeft}", 30.sp, u.fg, FontWeight.Bold)
                if (h.daysLeft > 0) { Spacer(GlanceModifier.width(4.dp)); Tx(if (h.daysLeft == 1) "dag" else "dager", 12.sp, u.sub, FontWeight.Medium) }
            }
            Spacer(GlanceModifier.height(6.dp))
            Tx(same.joinToString(" og ") { it.name }, 14.sp, u.fg, FontWeight.Bold)
            Tx(listOfNotNull(h.age?.takeIf { same.size == 1 }?.let { "Fyller $it" }, h.short).joinToString(" · "), 12.sp, u.sub, FontWeight.Medium)
        }
    }
}

/** Samsung 2×2: Skann med Kamera og Fra filer (samme som før, i riktig størrelse). */
@Composable
private fun SScan(papir: Boolean) {
    val ctx = LocalContext.current
    val u = palette(papir, accent = true)
    SCard("scan", u.bg) {
        Tx("Skann", 14.sp, u.fg, FontWeight.Bold)
        Tx("Kvittering eller dokument", 12.sp, u.sub, FontWeight.Medium, maxLines = 2)
        Grow()
        Box(GlanceModifier.fillMaxWidth().height(36.dp).cornerRadius(18.dp).background(if (papir) cp(Color.White) else GlanceTheme.colors.onPrimary).clickable(open24(ctx, "scan/camera")), contentAlignment = Alignment.Center) {
            Tx("Kamera", 13.sp, if (papir) cp(0xFFB23A2A) else GlanceTheme.colors.primary, FontWeight.Bold)
        }
        Spacer(GlanceModifier.height(6.dp))
        Box(GlanceModifier.fillMaxWidth().height(36.dp).cornerRadius(18.dp).background(u.chip).clickable(open24(ctx, "scan/files")), contentAlignment = Alignment.Center) {
            Tx("Fra filer", 13.sp, u.onChip, FontWeight.Medium)
        }
    }
}

private val RING = listOf(0xFFB23A2A, 0xFF2B5D8A, 0xFF2F7A4F, 0xFFA8661A)

/** Samsung 2×2 / 4×2: «Huskeliste · N», tre oppgaver med fargede ringer (trykk = ferdig) og «+ Ny oppgave» nederst. */
@Composable
private fun STasks(tasks: List<WTask>, papir: Boolean, wide: Boolean) {
    val ctx = LocalContext.current
    val u = palette(papir, accent = false)
    SCard("huske", u.bg, wide) {
        Tx("Huskeliste · ${tasks.size}", 13.sp, u.fg, FontWeight.Bold)
        Spacer(GlanceModifier.height(4.dp))
        if (tasks.isEmpty()) Tx("Ingen oppgaver.", 12.sp, u.sub, FontWeight.Medium)
        tasks.take(3).forEachIndexed { i, t ->
            Row(GlanceModifier.fillMaxWidth().height(24.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(GlanceModifier.size(16.dp).cornerRadius(8.dp).background(cp(RING[i % RING.size])).clickable(actionRunCallback<S24ToggleTask>(actionParametersOf(TASK24 to t.id))),
                    contentAlignment = Alignment.Center) { Box(GlanceModifier.size(11.dp).cornerRadius(6.dp).background(u.bg)) {} }
                Spacer(GlanceModifier.width(8.dp))
                Tx(t.title, 12.5.sp, u.fg, FontWeight.Medium, modifier = GlanceModifier.defaultWeight())
            }
        }
        Grow()
        Box(GlanceModifier.fillMaxWidth().height(30.dp).cornerRadius(15.dp).background(u.chip).clickable(open24(ctx, "huske/new")), contentAlignment = Alignment.Center) {
            Tx("+ Ny oppgave", 12.5.sp, u.onChip, FontWeight.Bold)
        }
    }
}

/** Samsung 2×2: Sporing, antall på vei stort, og neste pakke. */
@Composable
private fun SPackages(d: WidgetData, papir: Boolean) {
    val u = palette(papir, accent = false)
    val p = d.packages
    val first = p?.items?.sortedByDescending { it.ready }?.firstOrNull()
    SCard("tracking", u.bg) {
        Tx("Sporing", 13.sp, u.fg, FontWeight.Bold)
        Grow()
        if (!d.loggedIn) { Tx("Logg inn i appen", 12.sp, u.sub, FontWeight.Medium, maxLines = 2); return@SCard }
        val n = maxOf(p?.active ?: 0, p?.items?.size ?: 0)
        Row(verticalAlignment = Alignment.Bottom) {
            Tx("$n", 30.sp, u.fg, FontWeight.Bold)
            Spacer(GlanceModifier.width(4.dp))
            Tx(if (n == 1) "pakke" else "pakker", 12.sp, u.sub, FontWeight.Medium)
        }
        Spacer(GlanceModifier.height(6.dp))
        Tx(first?.name ?: "Ingen aktive pakker", 14.sp, u.fg, FontWeight.Bold)
        Tx(first?.let { if (it.ready) "Klar for henting" else it.statusText.ifBlank { it.carrierName } } ?: "Legg til et sporingsnummer", 12.sp, u.sub, FontWeight.Medium)
    }
}

private fun depMin(dp: WDep24, at: Long): Int? = dp.min?.let { it - ((System.currentTimeMillis() - at) / 60_000).toInt() }

/** Samsung 2×2: neste avgang stort; 4×2: de tre neste som rader. */
@Composable
private fun SDepartures(dep: WDeps24?, papir: Boolean, wide: Boolean) {
    val u = palette(papir, accent = false)
    val at = dep?.at ?: 0L
    val list = dep?.deps?.mapNotNull { x -> depMin(x, at)?.takeIf { it >= 0 }?.let { x to it } ?: if (x.min == null) x to -1 else null } ?: emptyList()
    SCard("avganger", u.bg, wide) {
        Tx(dep?.stop?.let { "Avganger · $it" } ?: "Avganger", 13.sp, u.fg, FontWeight.Bold)
        if (list.isEmpty()) { Grow(); Tx(if (dep == null) "Velg holdeplass i appen" else "Ingen avganger nå", 12.sp, u.sub, FontWeight.Medium, maxLines = 2); return@SCard }
        if (wide) {
            Spacer(GlanceModifier.height(4.dp))
            list.take(3).forEach { (x, m) ->
                Row(GlanceModifier.fillMaxWidth().height(32.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(GlanceModifier.width(34.dp).height(24.dp).cornerRadius(7.dp).background(cp(x.color)), contentAlignment = Alignment.Center) { Tx(x.line, 12.sp, cp(x.textColor), FontWeight.Bold) }
                    Spacer(GlanceModifier.width(10.dp))
                    Tx(x.to, 13.sp, u.fg, FontWeight.Medium, modifier = GlanceModifier.defaultWeight())
                    Tx(if (m < 0) x.time.orEmpty() else if (m == 0) "nå" else "$m min", 14.sp, u.fg, FontWeight.Bold)
                }
            }
        } else {
            Grow()
            val (x, m) = list.first()
            Row(verticalAlignment = Alignment.Bottom) {
                Tx(if (m <= 0) "nå" else "$m", 30.sp, u.fg, FontWeight.Bold)
                if (m > 0) { Spacer(GlanceModifier.width(4.dp)); Tx("min", 12.sp, u.sub, FontWeight.Medium) }
            }
            Spacer(GlanceModifier.height(6.dp))
            Tx("${x.line} ${x.to}", 14.sp, u.fg, FontWeight.Bold)
            Tx(list.getOrNull(1)?.let { (y, n) -> "Neste: ${y.line} om ${maxOf(n, 0)} min" } ?: "Siste avgang nå", 12.sp, u.sub, FontWeight.Medium)
        }
    }
}

/** Samsung 2×2: saldo stort, neste trekk og kvitteringer til gjennomgang. */
@Composable
private fun SBalance(d: WidgetData, papir: Boolean) {
    val ctx = LocalContext.current
    val u = palette(papir, accent = false)
    val f = d.finance
    SCard("finance", u.bg) {
        Tx("Saldo", 13.sp, u.fg, FontWeight.Bold)
        Grow()
        if (f == null) { Tx(if (!d.loggedIn) "Logg inn i appen" else d.error ?: "Henter saldo …", 12.sp, u.sub, FontWeight.Medium, maxLines = 2); return@SCard }
        Row(verticalAlignment = Alignment.Bottom) {
            Tx(kr24(ctx, f.balance), 30.sp, u.fg, FontWeight.Bold)
            Spacer(GlanceModifier.width(4.dp))
            Tx("kr", 12.sp, u.sub, FontWeight.Medium)
        }
        Spacer(GlanceModifier.height(6.dp))
        Tx(d.nextCharge?.let { "Neste: ${it.name}" } ?: "Ingen trekk snart", 14.sp, u.fg, FontWeight.Bold)
        Tx(if (f.toReview > 0) "${f.toReview} til gjennomgang" else "Alt er gjennomgått", 12.sp, u.sub, FontWeight.Medium)
    }
}
