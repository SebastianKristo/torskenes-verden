package no.kristo.kalender.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlinx.coroutines.flow.MutableStateFlow
import no.kristo.kalender.KCALS
import no.kristo.kalender.KEv
import no.kristo.kalender.KalNotify
import no.kristo.kalender.KalStore
import no.kristo.kalender.MainActivity
import no.kristo.kalender.MN
import no.kristo.kalender.WD
import no.kristo.kalender.WS
import no.kristo.kalender.cap
import no.kristo.kalender.hm
import no.kristo.kalender.jsDay
import no.kristo.kalender.nowMin
import no.kristo.kalender.today
import no.kristo.kalender.withOverrides
import java.time.LocalDate

/*
 * Prompt 70 (KAL70): Kalender-widgets etter «Kalender Widgets.dc.html» (Android · Material You og Samsung · One UI).
 *  Material You (Glance): dynamiske farger fra bakgrunnen (GlanceTheme.colors), radius 28, systemfonten.
 *   - 2 × 2 (KalDateWidget): ukedag-pille, stor dato, neste hendelse.
 *   - 4 × 2 (KalWeek70Widget): mørk datoblokk (ukedag, dato, uke) + tre hendelser som avrundede rader.
 *   - 4 × 3 agenda (KalAgendaWidget, SizeMode.Responsive): dato, «N hendelser igjen i dag», «+ Ny», gruppert
 *     I dag / I morgen / ukedag i en LazyColumn som kan scrolles.
 *  One UI (samme mottakere, når Build.MANUFACTURER == "samsung"): hvit 78 % flate, radius 28.
 *   - 2 × 2: dato + ukedag og to neste med prikk. 4 × 2: «Mandag 26. oktober · uke 44», + og tre rader (tid · prikk · tittel · dag).
 *   - 4 × 4 (KalMonth70Widget): måned med ‹ › (blar uten å åpne appen) og blå + (#1259C3), i dag i blå sirkel, to neste under.
 *  Felles: kommende hendelser fra nå (ferdige i dag skjules – Innstillinger → Widgets), «Hele dagen», «Frist 23:59»,
 *  kalenderfargen som strek/prikk. Trykk: dato → kalender://dag/…, hendelse → kalender://hendelse?id=…, + → kalender://ny.
 *  Tom dag: «Ingen flere i dag» + neste dag med hendelser.
 *  Merk: Glance kan ikke tegne blur, og One UI-glidebryteren for gjennomsiktighet gjelder bare Samsungs egne widgets –
 *  flaten er derfor fast 78 % hvit (mørk modus: 78 % mørk) etter systemets lys/mørk.
 */

/* ---------------- Innstillinger → Widgets (per enhet) ---------------- */

object KalW70Prefs {
    private const val FILE = "kal70_widgets"
    private fun sp(ctx: Context) = ctx.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    /** Kalender-id-er som ikke vises i widgetene (tom = alle). */
    fun off(ctx: Context): Set<String> = sp(ctx).getStringSet("off", emptySet())?.toSet() ?: emptySet()

    fun setShown(ctx: Context, id: String, shown: Boolean) {
        val s = off(ctx).toMutableSet()
        if (shown) s.remove(id) else s.add(id)
        sp(ctx).edit().putStringSet("off", s).apply()
    }

    /** «Skjul fullførte i dag» (standard på). */
    fun hideDone(ctx: Context): Boolean = sp(ctx).getBoolean("hideDone", true)
    fun setHideDone(ctx: Context, v: Boolean) { sp(ctx).edit().putBoolean("hideDone", v).apply() }

    /** Kortet «Kalender på hjemskjermen» er vist (én gang etter oppdateringen). */
    fun introSeen(ctx: Context): Boolean = sp(ctx).getBoolean("introSeen", false)
    fun setIntroSeen(ctx: Context) { sp(ctx).edit().putBoolean("introSeen", true).apply() }

    /** Måneden 4 × 4-widgeten viser (forskyvning fra denne måneden), per widget. */
    fun monthOffset(ctx: Context, appWidgetId: Int): Int = sp(ctx).getInt("mo_$appWidgetId", 0)
    fun setMonthOffset(ctx: Context, appWidgetId: Int, v: Int) { sp(ctx).edit().putInt("mo_$appWidgetId", v).apply() }
}

object KalW70 {
    /** One UI-stil på Samsung. */
    val samsung: Boolean get() = Build.MANUFACTURER.equals("samsung", ignoreCase = true)

    /** Endrer innstillingene → tegn alle widgetene på nytt. */
    suspend fun redraw(ctx: Context) = KalSync.redraw(ctx)

    /**
     * «Legg til widget»: launcheren spør selv (Android 8+, requestPinAppWidget). false når launcheren ikke støtter det.
     * kind: "small" (2 × 2) · "week" (4 × 2) · "agenda" (4 × 3) · "month" (4 × 4).
     */
    fun pin(ctx: Context, kind: String): Boolean {
        val cls: Class<*> = when (kind) {
            "small" -> KalDateReceiver::class.java
            "week" -> KalWeek70Receiver::class.java
            "month" -> KalMonth70Receiver::class.java
            else -> KalAgendaReceiver::class.java
        }
        return runCatching {
            val m = AppWidgetManager.getInstance(ctx)
            if (!m.isRequestPinAppWidgetSupported) false
            else m.requestPinAppWidget(ComponentName(ctx, cls), null, null)
        }.getOrDefault(false)
    }

    /** Månedene 4 × 4-widgetene viser akkurat nå (appWidgetId → forskyvning). Leses i komposisjonen, så ‹ › tegner på nytt. */
    val months = MutableStateFlow<Map<Int, Int>>(emptyMap())
}

/* ---------------- Tidslinje: tegn på nytt ved neste start/slutt og midnatt ---------------- */

/** Bare ny tegning (ingen henting): ved neste start/slutt på en hendelse i dag, eller like etter midnatt. */
class KalEdge70Worker(ctx: Context, params: androidx.work.WorkerParameters) : androidx.work.CoroutineWorker(ctx, params) {
    override suspend fun doWork(): androidx.work.ListenableWorker.Result {
        KalSync.redraw(applicationContext)
        KalEdge70.schedule(applicationContext)
        return androidx.work.ListenableWorker.Result.success()
    }
}

object KalEdge70 {
    private const val NAME = "kalender-edge70"

    /** Minutter til neste grense (start/slutt i dag eller midnatt), minst 1. */
    fun minutesToNext(ctx: Context): Long {
        val w = W70(ctx)
        val nm = nowMin()
        val edges = w.evs.filter { it.d == w.T && !it.all }.flatMap { listOf(it.s ?: 0, it.e ?: ((it.s ?: 0) + 60)) }.filter { it > nm }
        val next = edges.minOrNull() ?: (24 * 60 + 1)
        return (next - nm).toLong().coerceAtLeast(1)
    }

    fun schedule(ctx: Context) {
        runCatching {
            val req = androidx.work.OneTimeWorkRequestBuilder<KalEdge70Worker>()
                .setInitialDelay(minutesToNext(ctx), java.util.concurrent.TimeUnit.MINUTES).build()
            androidx.work.WorkManager.getInstance(ctx.applicationContext)
                .enqueueUniqueWork(NAME, androidx.work.ExistingWorkPolicy.REPLACE, req)
        }
    }
}

/* ---------------- Data ---------------- */

internal class W70(ctx: Context) {
    val T: LocalDate = today()
    private val nm: Int = nowMin()
    private val cals: Map<String, no.kristo.kalender.KCal>
    val wk: Int
    val sun: Boolean
    /** Synlige hendelser (skjulte kalendere og widget-valgene trukket fra). */
    val evs: List<KEv>
    /** Kommende fra nå, sortert (heldag først hver dag). */
    val up: List<KEv>

    init {
        no.kristo.kalender.Fag37.attach(ctx)
        val d0 = KalStore.current(ctx)
        val d = d0.copy(cals = no.kristo.kalender.cals35(ctx, d0.cals))
        val hid = no.kristo.kalender.hiddenAll35(ctx) + KalW70Prefs.off(ctx)
        val hideDone = KalW70Prefs.hideDone(ctx)
        cals = d.cals.associateBy { it.id }
        sun = no.kristo.kalender.Kal35Prefs.sunStart(ctx)
        wk = no.kristo.kalender.wkNo35(no.kristo.kalender.wkStart35(T, sun), sun)
        evs = d.withOverrides(ctx).filter { it.cal !in hid }
        up = evs.filter { it.d.isAfter(T) || (it.d == T && (it.all || !hideDone || (it.e ?: ((it.s ?: 0) + 60)) > nm)) }
            .sortedWith(compareBy<KEv> { it.d }.thenBy { if (it.all) 0 else 1 }.thenBy { it.s ?: 0 })
    }

    val todays: List<KEv> get() = up.filter { it.d == T }

    fun color(e: KEv): Long = cals[e.cal]?.let { no.kristo.kalender.Fag37.tint(it, e).c } ?: e.color ?: KCALS[0].c
    fun calName(e: KEv): String = cals[e.cal]?.n ?: "Kalender"
    fun place(e: KEv): String = e.loc?.takeIf { it.isNotBlank() } ?: calName(e)

    fun frist(e: KEv): Boolean = e.kind.equals("frist", ignoreCase = true)

    /** «I dag» · «I morgen» · «Tir 28.» */
    fun dl(d: LocalDate): String = when (d) {
        T -> "I dag"
        T.plusDays(1) -> "I morgen"
        else -> cap(WS[d.jsDay]) + " " + d.dayOfMonth + "."
    }

    /** «15:15–16:00» · «Hele dagen» · «Frist 23:59» */
    fun span(e: KEv): String = when {
        frist(e) -> e.s?.let { "Frist " + hm(it) } ?: "Frist"
        e.all -> "Hele dagen"
        else -> hm(e.s ?: 0) + "–" + hm(e.e ?: ((e.s ?: 0) + 60))
    }

    /** I dag bare tiden, ellers «I morgen · 19:00–20:30». */
    fun wl(e: KEv): String = if (e.d == T) span(e) else dl(e.d) + " · " + span(e)

    /** Kort tid: «15:15» · «Hele» · «Frist». */
    fun hmS(e: KEv): String = when {
        frist(e) && e.s == null -> "Frist"
        e.all -> "Hele"
        else -> hm(e.s ?: 0)
    }

    /** «Mandag 26. oktober» */
    val longDate: String get() = cap(WD[T.jsDay]) + " " + T.dayOfMonth + ". " + MN[T.monthValue - 1]

    /** «3 hendelser igjen i dag» · «1 hendelse igjen i dag» · «Ingen flere i dag» */
    val countText: String get() {
        val n = todays.size
        return when (n) { 0 -> "Ingen flere i dag"; 1 -> "1 hendelse igjen i dag"; else -> "$n hendelser igjen i dag" }
    }

    /** Fargen på prikken under en dag i måneden (første synlige hendelse), null = ingen. */
    fun dot(d: LocalDate): Long? = evs.firstOrNull { it.d == d }?.let(::color)
}

/* ---------------- Stil: Material You eller One UI ---------------- */

internal class Sty70(
    val bg: ColorProvider, val ink: ColorProvider, val mut: ColorProvider, val row: ColorProvider, val pill: ColorProvider,
    val block: ColorProvider, val blockFg: ColorProvider, val btn: ColorProvider, val btnFg: ColorProvider,
    val accent: ColorProvider, val accentFg: ColorProvider, val time: ColorProvider, val oneUi: Boolean,
)

private fun dn70(day: Long, night: Long): ColorProvider = androidx.glance.color.ColorProvider(day = Color(day), night = Color(night))
private fun fixed70(c: Long): ColorProvider = ColorProvider(Color(c))

private val ONE_UI = Sty70(
    bg = dn70(0xC7FFFFFF, 0xC71E1E1E), ink = dn70(0xFF111111, 0xFFF2F2F2), mut = dn70(0xFF666666, 0xFFA6A6A6),
    row = dn70(0xB3FFFFFF, 0x1FFFFFFF), pill = dn70(0xFFFFFFFF, 0xFF3A3A3A),
    block = dn70(0xFF111111, 0xFFF2F2F2), blockFg = dn70(0xFFFFFFFF, 0xFF111111),
    btn = dn70(0xFFFFFFFF, 0xFF3A3A3A), btnFg = dn70(0xFF111111, 0xFFF2F2F2),
    accent = fixed70(0xFF1259C3), accentFg = fixed70(0xFFFFFFFF), time = dn70(0xFF444444, 0xFFCCCCCC), oneUi = true,
)

@Composable
internal fun sty70(): Sty70 {
    if (KalW70.samsung) return ONE_UI
    val c = GlanceTheme.colors
    return Sty70(
        bg = c.secondaryContainer, ink = c.onSecondaryContainer, mut = c.onSurfaceVariant, row = c.surface, pill = c.primaryContainer,
        block = c.onSecondaryContainer, blockFg = c.secondaryContainer, btn = c.onSecondaryContainer, btnFg = c.secondaryContainer,
        accent = c.primary, accentFg = c.onPrimary, time = c.onSecondaryContainer, oneUi = false,
    )
}

/* ---------------- Felles byggeklosser ---------------- */

@Composable
private fun T70(text: String, size: TextUnit, color: ColorProvider, weight: FontWeight = FontWeight.Normal, maxLines: Int = 1, modifier: GlanceModifier = GlanceModifier) =
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight, fontFamily = FontFamily.SansSerif), maxLines = maxLines)

@Composable
private fun Stripe70(c: Long, h: Dp) = Box(GlanceModifier.width(4.dp).height(h).cornerRadius(2.dp).background(fixed70(c))) {}

@Composable
private fun Dot70(c: Long?, d: Dp = 7.dp) =
    Box(GlanceModifier.size(d).cornerRadius(d / 2).background(if (c == null) fixed70(0x00000000) else fixed70(c))) {}

private fun base70(s: Sty70): GlanceModifier = GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(s.bg)

/** Rund knapp (+ ‹ ›). */
@Composable
private fun Btn70(label: String, bg: ColorProvider, fg: ColorProvider, action: androidx.glance.action.Action, size: Dp = 30.dp, fs: TextUnit = 17.sp) =
    Box(GlanceModifier.size(size).cornerRadius(size / 2).background(bg).clickable(action), contentAlignment = Alignment.Center) {
        T70(label, fs, fg, FontWeight.Medium)
    }

private fun dayLink(d: LocalDate): String = "kalender://dag/$d"

private fun open70(ctx: Context, link: String): androidx.glance.action.Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

private fun evLink70(e: KEv): String = KalNotify.eventLink(e)

/** «Ingen flere i dag» + neste dag med hendelser. */
@Composable
private fun Empty70(w: W70, s: Sty70) {
    val ctx = LocalContext.current
    val n = w.up.firstOrNull()
    Column(GlanceModifier.fillMaxWidth().clickable(open70(ctx, if (n == null) dayLink(w.T) else evLink70(n)))) {
        T70("Ingen flere i dag", 13.sp, s.ink, FontWeight.Medium)
        if (n != null) T70(w.dl(n.d) + " · " + n.t + " " + w.hmS(n), 11.5.sp, s.mut, maxLines = 2)
    }
}

/* ---------------- 2 × 2 ---------------- */

@Composable
internal fun Small70(w: W70) {
    val s = sty70()
    if (s.oneUi) SmallOneUi70(w, s) else SmallMy70(w, s)
}

@Composable
private fun SmallMy70(w: W70, s: Sty70) {
    val ctx = LocalContext.current
    val n = w.todays.firstOrNull()
    Column(base70(s).padding(16.dp).clickable(open70(ctx, dayLink(w.T)))) {
        Box(GlanceModifier.height(26.dp).cornerRadius(13.dp).background(s.pill).padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
            T70(cap(WD[w.T.jsDay]), 12.sp, s.ink, FontWeight.Medium)
        }
        T70("${w.T.dayOfMonth}", 56.sp, s.ink, FontWeight.Medium, modifier = GlanceModifier.padding(top = 6.dp))
        Spacer(GlanceModifier.defaultWeight())
        if (n == null) Empty70(w, s) else Column(GlanceModifier.fillMaxWidth().clickable(open70(ctx, evLink70(n)))) {
            T70(n.t, 13.sp, s.ink, FontWeight.Medium)
            T70(w.wl(n), 11.5.sp, s.mut)
        }
    }
}

@Composable
private fun SmallOneUi70(w: W70, s: Sty70) {
    val ctx = LocalContext.current
    val rows = w.up.take(2)
    Column(base70(s).padding(16.dp).clickable(open70(ctx, dayLink(w.T)))) {
        Row(verticalAlignment = Alignment.Bottom) {
            T70("${w.T.dayOfMonth}", 34.sp, s.ink, FontWeight.Bold)
            Spacer(GlanceModifier.width(6.dp))
            T70(cap(WS[w.T.jsDay]), 13.sp, s.mut, FontWeight.Medium, modifier = GlanceModifier.padding(bottom = 4.dp))
        }
        Spacer(GlanceModifier.defaultWeight())
        if (w.todays.isEmpty()) T70("Ingen flere i dag", 11.sp, s.mut, FontWeight.Medium, modifier = GlanceModifier.padding(bottom = 4.dp))
        rows.forEachIndexed { i, e ->
            if (i > 0) Spacer(GlanceModifier.height(7.dp))
            Row(GlanceModifier.fillMaxWidth().clickable(open70(ctx, evLink70(e))), verticalAlignment = Alignment.CenterVertically) {
                Dot70(w.color(e))
                Spacer(GlanceModifier.width(7.dp))
                Column(GlanceModifier.defaultWeight()) {
                    T70(e.t, 12.5.sp, s.ink, FontWeight.Bold)
                    T70(w.wl(e), 11.sp, s.mut)
                }
            }
        }
    }
}

/* ---------------- 4 × 2 ---------------- */

class KalWeek70Widget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            val st by KalStore.data.collectAsState()
            val w = W70(context).also { st.hashCode() }
            GlanceTheme { Week70(w) }
        }
    }
}

@Composable
private fun Week70(w: W70) {
    val s = sty70()
    if (s.oneUi) WeekOneUi70(w, s) else WeekMy70(w, s)
}

@Composable
private fun WeekMy70(w: W70, s: Sty70) {
    val ctx = LocalContext.current
    val none = w.todays.isEmpty()
    val rows = w.up.take(if (none) 2 else 3)
    Row(base70(s).padding(16.dp)) {
        Column(
            GlanceModifier.width(76.dp).fillMaxHeight().cornerRadius(20.dp).background(s.block).clickable(open70(ctx, dayLink(w.T))),
            verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            T70(WS[w.T.jsDay].uppercase(), 11.sp, s.blockFg, FontWeight.Medium)
            T70("${w.T.dayOfMonth}", 34.sp, s.blockFg, FontWeight.Medium)
            T70("uke " + w.wk, 10.5.sp, s.blockFg)
        }
        Spacer(GlanceModifier.width(12.dp))
        Column(GlanceModifier.defaultWeight().fillMaxHeight()) {
            if (none) Box(GlanceModifier.fillMaxWidth().defaultWeight().padding(horizontal = 4.dp), contentAlignment = Alignment.Center) {
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { T70("Ingen flere i dag", 13.sp, s.ink, FontWeight.Medium) }
            }
            rows.forEachIndexed { i, e ->
                if (i > 0 || none) Spacer(GlanceModifier.height(6.dp))
                Row(
                    GlanceModifier.fillMaxWidth().defaultWeight().cornerRadius(16.dp).background(s.row).padding(horizontal = 12.dp).clickable(open70(ctx, evLink70(e))),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Stripe70(w.color(e), 22.dp)
                    Spacer(GlanceModifier.width(10.dp))
                    Column(GlanceModifier.defaultWeight()) {
                        T70(e.t, 13.sp, s.ink, FontWeight.Medium)
                        T70(w.wl(e), 11.sp, s.mut)
                    }
                }
            }
        }
    }
}

@Composable
private fun WeekOneUi70(w: W70, s: Sty70) {
    val ctx = LocalContext.current
    val rows = w.up.take(3)
    Column(base70(s).padding(horizontal = 18.dp, vertical = 16.dp)) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(GlanceModifier.defaultWeight().clickable(open70(ctx, dayLink(w.T))), verticalAlignment = Alignment.CenterVertically) {
                T70(w.longDate, 16.sp, s.ink, FontWeight.Bold)
                Spacer(GlanceModifier.width(8.dp))
                T70("uke " + w.wk, 11.5.sp, s.mut)
            }
            Btn70("+", s.btn, s.btnFg, open70(ctx, "kalender://ny"))
        }
        Spacer(GlanceModifier.height(10.dp))
        if (rows.isEmpty() || w.todays.isEmpty()) T70("Ingen flere i dag", 12.sp, s.mut, FontWeight.Medium, modifier = GlanceModifier.padding(bottom = 6.dp))
        rows.forEachIndexed { i, e ->
            if (i > 0) Spacer(GlanceModifier.height(10.dp))
            Row(GlanceModifier.fillMaxWidth().clickable(open70(ctx, evLink70(e))), verticalAlignment = Alignment.CenterVertically) {
                T70(w.hmS(e), 12.sp, s.time, FontWeight.Bold, modifier = GlanceModifier.width(44.dp))
                Dot70(w.color(e))
                Spacer(GlanceModifier.width(10.dp))
                T70(e.t, 13.5.sp, s.ink, FontWeight.Medium, modifier = GlanceModifier.defaultWeight())
                Spacer(GlanceModifier.width(8.dp))
                T70(w.dl(e.d), 11.5.sp, s.mut)
            }
        }
    }
}

/* ---------------- 4 × 3 agenda (skalerbar) ---------------- */

/** Størrelsene agendaen tegnes for (SizeMode.Responsive). */
internal val AGENDA_SIZES: Set<DpSize> = setOf(DpSize(180.dp, 180.dp), DpSize(250.dp, 180.dp), DpSize(250.dp, 280.dp), DpSize(320.dp, 380.dp))

private class Grp70(val h: String, val ev: List<KEv>)

private fun groups70(w: W70): List<Grp70> {
    val until = w.T.plusDays(13)
    val list = w.up.filter { !it.d.isAfter(until) }.take(30)
    return list.groupBy { it.d }.entries.sortedBy { it.key }.map { (d, ev) ->
        val h = when (d) { w.T -> "I dag"; w.T.plusDays(1) -> "I morgen"; else -> cap(WD[d.jsDay]) + " " + d.dayOfMonth + "." }
        Grp70(h, ev)
    }
}

@Composable
internal fun Agenda70(w: W70) {
    val s = sty70()
    val ctx = LocalContext.current
    val size = LocalSize.current
    val narrow = size.width < 220.dp
    val gs = groups70(w)
    Column(base70(s).padding(16.dp)) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(GlanceModifier.defaultWeight().clickable(open70(ctx, dayLink(w.T)))) {
                T70(w.longDate, 17.sp, s.ink, FontWeight.Medium)
                T70(w.countText, 12.sp, s.mut)
            }
            Spacer(GlanceModifier.width(8.dp))
            if (narrow) Btn70("+", s.btn, s.btnFg, open70(ctx, "kalender://ny"), 40.dp, 18.sp)
            else Row(
                GlanceModifier.height(40.dp).cornerRadius(20.dp).background(if (s.oneUi) s.accent else s.btn)
                    .padding(start = 12.dp, end = 16.dp).clickable(open70(ctx, "kalender://ny")),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                T70("+", 18.sp, if (s.oneUi) s.accentFg else s.btnFg, FontWeight.Medium)
                Spacer(GlanceModifier.width(6.dp))
                T70("Ny", 13.sp, if (s.oneUi) s.accentFg else s.btnFg, FontWeight.Medium)
            }
        }
        Spacer(GlanceModifier.height(10.dp))
        if (gs.isEmpty()) {
            T70("Ingenting planlagt de neste to ukene.", 13.sp, s.mut, maxLines = 2)
            return@Column
        }
        LazyColumn(GlanceModifier.fillMaxWidth().defaultWeight()) {
            gs.forEach { g ->
                item { T70(g.h, 11.5.sp, s.mut, FontWeight.Medium, modifier = GlanceModifier.padding(start = 4.dp, top = 4.dp, end = 4.dp, bottom = 6.dp)) }
                g.ev.forEach { e -> item { AgendaRow70(w, s, e, narrow) } }
            }
        }
    }
}

@Composable
private fun AgendaRow70(w: W70, s: Sty70, e: KEv, narrow: Boolean) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxWidth().padding(bottom = 6.dp)) {
        Row(
            GlanceModifier.fillMaxWidth().cornerRadius(16.dp).background(s.row).padding(horizontal = 12.dp, vertical = 6.dp).clickable(open70(ctx, evLink70(e))),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (!narrow) T70(w.hmS(e), 12.sp, s.ink, FontWeight.Medium, modifier = GlanceModifier.width(44.dp))
            Stripe70(w.color(e), 24.dp)
            Spacer(GlanceModifier.width(12.dp))
            Column(GlanceModifier.defaultWeight()) {
                T70(e.t, 13.5.sp, s.ink, FontWeight.Medium)
                T70(if (narrow) w.span(e) else w.place(e), 11.5.sp, s.mut)
            }
        }
    }
}

/* ---------------- 4 × 4 måned (One UI: ‹ › og blå +) ---------------- */

class KalMonth70Widget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val wid = runCatching { GlanceAppWidgetManager(context).getAppWidgetId(id) }.getOrDefault(0)
        provideContent {
            val st by KalStore.data.collectAsState()
            val mo by KalW70.months.collectAsState()
            val w = W70(context).also { st.hashCode() }
            val off = mo[wid] ?: KalW70Prefs.monthOffset(context, wid)
            GlanceTheme { Month70(w, off) }
        }
    }
}

/** ‹ › i 4 × 4-widgeten: blar måned uten å åpne appen. */
class KalMonthNav70 : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val wid = runCatching { GlanceAppWidgetManager(context).getAppWidgetId(glanceId) }.getOrDefault(0)
        val dir = parameters[DIR] ?: 0
        val now = KalW70.months.value[wid] ?: KalW70Prefs.monthOffset(context, wid)
        val next = if (dir == 0) 0 else (now + dir).coerceIn(-24, 24)
        KalW70Prefs.setMonthOffset(context, wid, next)
        KalW70.months.value = KalW70.months.value + (wid to next)
        runCatching { KalMonth70Widget().updateAll(context) }
    }

    companion object { val DIR = ActionParameters.Key<Int>("dir") }
}

@Composable
private fun Month70(w: W70, off: Int) {
    val s = sty70()
    val ctx = LocalContext.current
    val size = LocalSize.current
    val first = w.T.withDayOfMonth(1).plusMonths(off.toLong())
    val title = cap(MN[first.monthValue - 1]) + if (first.year != w.T.year) " " + first.year else ""
    val tBg = if (s.oneUi) s.accent else s.block
    val tFg = if (s.oneUi) s.accentFg else s.blockFg
    Column(base70(s).padding(horizontal = 18.dp, vertical = 16.dp)) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T70(title, 16.sp, s.ink, FontWeight.Bold, modifier = GlanceModifier.defaultWeight().clickable(open70(ctx, "kalender://mnd/$first")))
            Btn70("‹", s.btn, s.btnFg, actionRunCallback<KalMonthNav70>(actionParametersOf(KalMonthNav70.DIR to -1)), fs = 14.sp)
            Spacer(GlanceModifier.width(6.dp))
            Btn70("›", s.btn, s.btnFg, actionRunCallback<KalMonthNav70>(actionParametersOf(KalMonthNav70.DIR to 1)), fs = 14.sp)
            Spacer(GlanceModifier.width(6.dp))
            Btn70("+", tBg, tFg, open70(ctx, "kalender://ny"))
        }
        Spacer(GlanceModifier.height(12.dp))
        MonthGrid70(w, s, first, tBg, tFg)
        if (size.height >= 300.dp) {
            Spacer(GlanceModifier.defaultWeight())
            Next2Box70(w, s)
        }
    }
}

@Composable
private fun MonthGrid70(w: W70, s: Sty70, first: LocalDate, today: ColorProvider, todayFg: ColorProvider) {
    val ctx = LocalContext.current
    val start = no.kristo.kalender.wkStart35(first, w.sun)
    val lead = first.toEpochDay() - start.toEpochDay()
    val rows = ((lead + first.lengthOfMonth() + 6) / 7).toInt()
    val letters = if (w.sun) listOf("S", "M", "T", "O", "T", "F", "L") else listOf("M", "T", "O", "T", "F", "L", "S")
    Column(GlanceModifier.fillMaxWidth()) {
        Row(GlanceModifier.fillMaxWidth().padding(bottom = 4.dp)) {
            letters.forEach { l -> Box(GlanceModifier.defaultWeight(), contentAlignment = Alignment.Center) { T70(l, 10.5.sp, s.mut, FontWeight.Bold) } }
        }
        for (r in 0 until rows) {
            Row(GlanceModifier.fillMaxWidth()) {
                for (i in 0 until 7) {
                    val d = start.plusDays((r * 7 + i).toLong())
                    DayCell70(w, s, d, d.monthValue == first.monthValue, today, todayFg, ctx)
                }
            }
        }
    }
}

@Composable
private fun androidx.glance.layout.RowScope.DayCell70(w: W70, s: Sty70, d: LocalDate, inMonth: Boolean, today: ColorProvider, todayFg: ColorProvider, ctx: Context) {
    val isT = d == w.T
    val fg = when { isT -> todayFg; inMonth -> s.ink; else -> s.mut }
    Column(GlanceModifier.defaultWeight().height(32.dp).clickable(open70(ctx, dayLink(d))), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(GlanceModifier.size(26.dp).cornerRadius(13.dp).background(if (isT) today else fixed70(0x00000000)), contentAlignment = Alignment.Center) {
            T70("${d.dayOfMonth}", 12.5.sp, fg, if (isT) FontWeight.Bold else FontWeight.Medium)
        }
        Spacer(GlanceModifier.height(2.dp))
        Dot70(if (isT || !inMonth) null else w.dot(d), 4.dp)
    }
}

/** To neste i en lys boks under måneden. */
@Composable
private fun Next2Box70(w: W70, s: Sty70) {
    val ctx = LocalContext.current
    val rows = w.up.take(2)
    Column(GlanceModifier.fillMaxWidth().cornerRadius(18.dp).background(s.row).padding(horizontal = 12.dp, vertical = 10.dp)) {
        if (rows.isEmpty()) T70("Ingen flere i dag", 13.sp, s.mut, FontWeight.Medium)
        rows.forEachIndexed { i, e ->
            if (i > 0) Spacer(GlanceModifier.height(6.dp))
            Row(GlanceModifier.fillMaxWidth().clickable(open70(ctx, evLink70(e))), verticalAlignment = Alignment.CenterVertically) {
                Dot70(w.color(e))
                Spacer(GlanceModifier.width(10.dp))
                T70(e.t, 13.sp, s.ink, FontWeight.Medium, modifier = GlanceModifier.defaultWeight())
                Spacer(GlanceModifier.width(8.dp))
                T70(w.wl(e), 11.5.sp, s.mut)
            }
        }
    }
}

/* ---------------- Mottakere ---------------- */

class KalWeek70Receiver : KalReceiver() { override val glanceAppWidget: GlanceAppWidget = KalWeek70Widget() }
class KalMonth70Receiver : KalReceiver() { override val glanceAppWidget: GlanceAppWidget = KalMonth70Widget() }
