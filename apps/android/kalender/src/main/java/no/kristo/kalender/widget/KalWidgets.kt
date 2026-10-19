package no.kristo.kalender.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
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
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import no.kristo.kalender.KData
import no.kristo.kalender.KEv
import no.kristo.kalender.KCALS
import no.kristo.kalender.KalAuth
import no.kristo.kalender.KalNotify
import no.kristo.kalender.KalPrefs
import no.kristo.kalender.KalRepo
import no.kristo.kalender.KalStore
import no.kristo.kalender.MN
import no.kristo.kalender.MainActivity
import no.kristo.kalender.WD
import no.kristo.kalender.WEMO
import no.kristo.kalender.WS
import no.kristo.kalender.WTXT
import no.kristo.kalender.cap
import no.kristo.kalender.hm
import no.kristo.kalender.isoW
import no.kristo.kalender.jsDay
import no.kristo.kalender.nowMin
import no.kristo.kalender.today
import no.kristo.kalender.withOverrides
import no.kristo.kalender.wkd
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/*
 * Prompt 33 (KAL-ANDROID): Kalender-widgets (Glance) etter «WIDGETS OG LÅSESKJERM» i Kalender App Oversikt.dc.html
 * (Kalender App.dc.html mode="home"/"lock", platform="android"):
 *  - 2 × 2 «dato»: ukedag (rød, mono), dato (Newsreader 52), «oktober 2026 · uke 43», vær maks / min. Trykk → kalender://dag/<i dag>.
 *  - 2 × 2 mørk «NESTE»: neste hendelse med tid. Trykk → kalender://hendelse?id=…
 *  - 4 × 3 «I dag og i morgen»: opptil 5 rader (stripe, tittel, sted, tid) og + som åpner skrivefeltet (kalender://ny).
 *  - Klokke (låseskjerm/keyguard der Android støtter det): stor stablet klokke (TextClock), dato · vær og neste hendelse.
 * Lyst/mørkt følger systemet (dag/natt-farger). Data fra cachen (KalStore), hentet hvert 15. minutt (KalSyncWorker),
 * når appen endrer noe (KalStore.data → collectAsState) og når en widget legges til.
 */

/* ---------------- Henting hvert 15. minutt ---------------- */

class KalSyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val s = KalAuth.session(ctx)
        if (s != null) {
            val t = today()
            runCatching { KalRepo.sync(ctx, s, t.minusDays(7), t.plusDays(62)) }
        }
        KalSync.redraw(ctx)
        runCatching { KalNotify.reschedule(ctx) }
        return Result.success()
    }
}

object KalSync {
    private const val PERIODIC = "kalender-sync"
    private const val NOW = "kalender-sync-now"

    fun schedule(ctx: Context) {
        runCatching {
            // Uten krav om nett: datoen i widgetene skal skifte ved midnatt også uten dekning (synken hoppes da over).
            val req = PeriodicWorkRequestBuilder<KalSyncWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(ctx.applicationContext).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }

    fun refreshNow(ctx: Context) {
        runCatching {
            val req = OneTimeWorkRequestBuilder<KalSyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            WorkManager.getInstance(ctx.applicationContext).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, req)
        }
    }

    val ALL: List<GlanceAppWidget> get() = listOf(KalDateWidget(), KalNextWidget(), KalAgendaWidget(), KalClockWidget())

    suspend fun redraw(ctx: Context) { ALL.forEach { w -> runCatching { w.updateAll(ctx) } } }
}

/* ---------------- Innholdet (fasitens wv() / R.wd) ---------------- */

private class WRow(val ev: KEv?, val t: String, val tm: String, val whenL: String, val c: Long, val loc: String)

private class WData(val d: KData, val evs: List<KEv>, showWx: Boolean, sun: Boolean = false) {
    val T: LocalDate = today()
    private val nm = nowMin()
    private val cals = d.cals.associateBy { it.id }
    /** Prompt 35: ukenummer etter «Uken starter». */
    val wk: Int = no.kristo.kalender.wkNo35(no.kristo.kalender.wkStart35(T, sun), sun)
    val up: List<KEv> = evs.filter { it.d.isAfter(T) || (it.d == T && (it.all || (it.e ?: 0) > nm)) }
        .sortedWith(compareBy<KEv> { it.d }.thenBy { if (it.all) 0 else 1 }.thenBy { it.s ?: 0 })
    val next: KEv? = up.firstOrNull { !it.all } ?: up.firstOrNull()
    val wx = if (showWx) d.wx[T] else null

    fun color(e: KEv): Long = cals[e.cal]?.c ?: e.color ?: KCALS[0].c
    fun calName(e: KEv): String = cals[e.cal]?.n ?: "Kalender"
    fun whenL(e: KEv): String = when (e.d) { T -> ""; T.plusDays(1) -> "I morgen · "; else -> cap(WS[e.d.jsDay]) + ". " + e.d.dayOfMonth + ". · " }
    fun tm(e: KEv): String = if (e.all) "Hele dagen" else hm(e.s ?: 0) + "–" + hm(e.e ?: ((e.s ?: 0) + 60))
    fun row(e: KEv) = WRow(e, e.t, tm(e), whenL(e), color(e), e.loc ?: calName(e))
}

/** Cachen med skjulte kalendere og lokale varsel-valg lagt på. */
private fun data(ctx: Context): WData {
    val d0 = KalStore.current(ctx)
    // Prompt 35: egne farger og «Skjul fra menyen» gjelder også widgetene.
    val d = d0.copy(cals = no.kristo.kalender.cals35(ctx, d0.cals))
    val hid = no.kristo.kalender.hiddenAll35(ctx)
    return WData(d, d.withOverrides(ctx).filter { it.cal !in hid }, KalPrefs.weather(ctx), no.kristo.kalender.Kal35Prefs.sunStart(ctx))
}

/* ---------------- Felles ---------------- */

private fun dn(day: Long, night: Long): ColorProvider = androidx.glance.color.ColorProvider(day = Color(day), night = Color(night))
private fun fixed(c: Long): ColorProvider = ColorProvider(Color(c))

/** Papir-tokens (THM.light / THM.dark). */
private object P {
    val card = dn(0xFFFFFDF8, 0xFF211F1B)
    val ink = dn(0xFF1B1A17, 0xFFEFE9DE)
    val bg = dn(0xFFF3EFE6, 0xFF161513)
    val mut = dn(0xFF6B665C, 0xFFA49D91)
    val ink2 = dn(0xFF3D3A33, 0xFFD6CFC2)
    val acc = dn(0xFFB23A2A, 0xFFEC7A64)
    val line2 = dn(0xFFE6DFD1, 0xFF2E2B26)
}

private fun open(ctx: Context, link: String): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

private fun evLink(e: KEv?): String = if (e == null) "kalender://dag/" + today() else KalNotify.eventLink(e)

@Composable
private fun Tx(text: String, size: TextUnit, color: ColorProvider, weight: FontWeight = FontWeight.Normal, family: FontFamily? = null, maxLines: Int = 1, modifier: GlanceModifier = GlanceModifier) =
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight, fontFamily = family), maxLines = maxLines)

@Composable
private fun ColumnScope.Grow() = Spacer(GlanceModifier.defaultWeight())

@Composable
private fun Stripe(c: Long, h: Dp) = Box(GlanceModifier.width(4.dp).height(h).cornerRadius(2.dp).background(fixed(c))) {}

private fun wxText(w: no.kristo.kalender.KWx?): String = w?.let { (WEMO[wkd(it.c)] ?: "") + " " + it.hi + "° / " + it.lo + "°" } ?: ""

/* ---------------- 2 × 2 dato ---------------- */

class KalDateWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            val st by KalStore.data.collectAsState()
            val w = data(context).also { st.hashCode() }
            DateBody(w)
        }
    }
}

@Composable
private fun DateBody(w: WData) {
    val ctx = LocalContext.current
    val T = w.T
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(P.card).padding(16.dp).clickable(open(ctx, "kalender://dag/$T"))) {
        Tx(WD[T.jsDay].uppercase(), 10.5.sp, P.acc, FontWeight.Bold, FontFamily.Monospace)
        Tx("${T.dayOfMonth}", 52.sp, P.ink, FontWeight.Medium, FontFamily.Serif)
        // Prompt 35: «oktober 2026 · uke 43».
        Tx(MN[T.monthValue - 1] + " " + T.year + " · uke " + w.wk, 12.sp, P.mut)
        Grow()
        if (w.wx != null) Tx(wxText(w.wx), 13.sp, P.ink2, FontWeight.Medium, FontFamily.Monospace)
    }
}

/* ---------------- 2 × 2 mørk NESTE ---------------- */

class KalNextWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            val st by KalStore.data.collectAsState()
            val w = data(context).also { st.hashCode() }
            NextBody(w)
        }
    }
}

@Composable
private fun NextBody(w: WData) {
    val ctx = LocalContext.current
    val n = w.next
    // Inverterte farger: blekk som bakgrunn (lys i mørkt tema), papir som tekst.
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(P.ink).padding(16.dp).clickable(open(ctx, evLink(n)))) {
        Tx("NESTE", 10.sp, dn(0xFFE8A294, 0xFFB23A2A), FontWeight.Bold, FontFamily.Monospace)
        Spacer(GlanceModifier.height(4.dp))
        Tx(n?.t ?: "Ingenting planlagt", 22.sp, P.bg, FontWeight.Medium, FontFamily.Serif, maxLines = 3)
        Grow()
        if (n != null) Tx(w.whenL(n) + w.tm(n), 12.sp, P.bg, FontWeight.Medium, FontFamily.Monospace)
    }
}

/* ---------------- 4 × 3 I dag og i morgen ---------------- */

class KalAgendaWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            val st by KalStore.data.collectAsState()
            val w = data(context).also { st.hashCode() }
            AgendaBody(w)
        }
    }
}

@Composable
private fun AgendaBody(w: WData) {
    val ctx = LocalContext.current
    val size = LocalSize.current
    val rows = w.up.filter { !it.d.isAfter(w.T.plusDays(1)) }
    // Plass: overskrift ca. 48 dp, rad ca. 44 dp.
    val max = ((size.height - 26.dp - 48.dp) / 44.dp).toInt().coerceIn(1, 5)
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(P.card).padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 10.dp)
        .clickable(open(ctx, "kalender://dag/${w.T}"))) {
        Row(GlanceModifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Tx("I dag og i morgen", 22.sp, P.ink, FontWeight.Medium, FontFamily.Serif, modifier = GlanceModifier.defaultWeight())
            Tx("UKE " + w.wk, 11.5.sp, P.ink2, FontWeight.Bold, FontFamily.Monospace)
            Spacer(GlanceModifier.width(10.dp))
            Box(GlanceModifier.size(36.dp).cornerRadius(18.dp).background(P.ink).clickable(open(ctx, "kalender://ny")), contentAlignment = Alignment.Center) {
                Tx("+", 20.sp, P.bg, FontWeight.Bold)
            }
        }
        if (rows.isEmpty()) {
            Tx("Ingenting planlagt i dag eller i morgen.", 13.sp, P.mut, maxLines = 2)
            return@Column
        }
        // Én Column per rad (skillelinje + rad): Glance tillater maks 10 barn i en Column.
        rows.take(max).map(w::row).forEach { r -> Column(GlanceModifier.fillMaxWidth()) {
            Box(GlanceModifier.fillMaxWidth().height(1.dp).background(P.line2)) {}
            Row(GlanceModifier.fillMaxWidth().padding(vertical = 7.dp).clickable(open(ctx, evLink(r.ev))), verticalAlignment = Alignment.CenterVertically) {
                Stripe(r.c, 28.dp)
                Spacer(GlanceModifier.width(10.dp))
                Column(GlanceModifier.defaultWeight()) {
                    Tx(r.t, 13.5.sp, P.ink, FontWeight.Bold)
                    Tx(r.loc, 11.5.sp, P.mut)
                }
                Spacer(GlanceModifier.width(8.dp))
                Tx(r.whenL + (if (r.ev?.all == true) "Hele dagen" else hm(r.ev?.s ?: 0)), 11.5.sp, P.mut, FontWeight.Medium, FontFamily.Monospace)
            }
        } }
    }
}

/* ---------------- Klokke (hjem og låseskjerm) ---------------- */

class KalClockWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            val st by KalStore.data.collectAsState()
            val w = data(context).also { st.hashCode() }
            ClockBody(w)
        }
    }
}

@Composable
private fun ClockBody(w: WData) {
    val ctx = LocalContext.current
    val T = w.T
    val n = w.next
    val white = fixed(0xFFFFFFFF)
    val soft = fixed(0xD9FFFFFF)
    Row(GlanceModifier.fillMaxSize().padding(14.dp).clickable(open(ctx, evLink(n))), verticalAlignment = Alignment.CenterVertically) {
        AndroidRemoteViews(RemoteViews(ctx.packageName, no.kristo.kalender.R.layout.kal_w_clock))
        Spacer(GlanceModifier.width(16.dp))
        Column(GlanceModifier.defaultWeight()) {
            // Prompt 35: «Man 19. okt · U43» først i linjen.
            Tx(cap(WS[T.jsDay]) + " " + T.dayOfMonth + ". " + no.kristo.kalender.MS[T.monthValue - 1] + " · U" + w.wk + (w.wx?.let { " · " + it.hi + "° " + WTXT[wkd(it.c)] } ?: ""), 14.sp, white, FontWeight.Bold)
            Spacer(GlanceModifier.height(4.dp))
            Tx(n?.let { "▦ " + it.t + " · " + (if (it.all) "Hele dagen" else hm(it.s ?: 0)) } ?: "Ingen hendelser", 13.sp, soft, maxLines = 2)
        }
    }
}

/* ---------------- Mottakerne ---------------- */

/** Første widget lagt til: hent med en gang og sett opp hentingen hvert 15. minutt. */
abstract class KalReceiver : GlanceAppWidgetReceiver() {
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        KalSync.schedule(context)
        KalSync.refreshNow(context)
    }
}

class KalDateReceiver : KalReceiver() { override val glanceAppWidget: GlanceAppWidget = KalDateWidget() }
class KalNextReceiver : KalReceiver() { override val glanceAppWidget: GlanceAppWidget = KalNextWidget() }
class KalAgendaReceiver : KalReceiver() { override val glanceAppWidget: GlanceAppWidget = KalAgendaWidget() }
class KalClockReceiver : KalReceiver() { override val glanceAppWidget: GlanceAppWidget = KalClockWidget() }
