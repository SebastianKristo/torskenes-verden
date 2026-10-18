package no.kristo.finanshub.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
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
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
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
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.flow.MutableStateFlow
import no.kristo.finanshub.Api
import no.kristo.finanshub.Kal26Ev
import no.kristo.finanshub.KalW
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.family.FamilyPrefs
import no.kristo.finanshub.kalNextBoundary
import no.kristo.finanshub.kalWidget
import no.kristo.finanshub.parseKalResp26
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.concurrent.TimeUnit

/*
 * Prompt 26 (ANDROID-A): Kalender-widgets (fasit: «WIDGETS PÅ TELEFONEN» i Kalender.dc.html, claude-code-kalender.md).
 *  - Material You (alle telefoner): 2 × 2, 4 × 2 og 4 × 4 (radius 28, dynamiske farger, også mørke).
 *  - Samsung One UI: 134 × 155, 296 × 155 og 296 × 330 dp (radius 20, sentrert i cellen som Samsungs egne widgets).
 *    Providerne er av i manifestet og slås på bare når Build.MANUFACTURER er samsung (S24.enableProviders).
 *  - Liten: NÅ / NESTE TIME / ukedag, klokkeslett stort, fag, rom og lærer, og «34 min igjen» / «om 1 t 5 min».
 *    Medium: også de tre neste timene. Stor: hele dagen (passerte dempet) og de to neste prøvene og fristene.
 *    Etter siste time vises neste skoledag.
 *  - Dataene hentes med WidgetWorker (hvert 15. minutt) og når appen henter kalenderen. Widgetene tegnes på nytt
 *    ved start og slutt av hver time og ved midnatt (WorkManager, ± 1 min). Trykk åpner finanshub://kalender,
 *    trykk på en time åpner detaljkortet (finanshub://kalender?id=…).
 */

/* ---------------- Data ---------------- */

object Kal26WidgetStore {
    private const val FILE = "kal26_widgets"
    val events = MutableStateFlow<List<Kal26Ev>?>(null)
    /** Økes ved hver timegrense, så widgetene regner ut «nå» på nytt. */
    val tick = MutableStateFlow(0L)
    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun current(ctx: Context): List<Kal26Ev> = events.value
        ?: runCatching { parseKalResp26(sp(ctx).getString("json", null) ?: "[]").first }.getOrDefault(emptyList()).also { events.value = it }

    fun fetchedAt(ctx: Context): Long = sp(ctx).getLong("at", 0L)

    /** Fra appen eller WidgetWorker: lagrer svaret og tegner widgetene på nytt. */
    fun save(ctx: Context, raw: String, acct: String?) {
        val app = ctx.applicationContext
        val l = runCatching { parseKalResp26(raw).first }.getOrNull() ?: return
        val today = LocalDate.now()
        // Bare de neste tre ukene trengs i widgetene.
        val keep = l.filter { !it.endDate.isBefore(today) && it.date.isBefore(today.plusDays(22)) }
        val arr = org.json.JSONArray().apply { keep.forEach { put(it.toJson()) } }
        sp(app).edit().putString("json", org.json.JSONObject().put("events", arr).toString()).putLong("at", System.currentTimeMillis())
            .apply { if (acct != null) putString("acct", acct) }.apply()
        events.value = keep
        Kal26Widgets.scheduleTick(app)
        Thread { runCatching { kotlinx.coroutines.runBlocking { Kal26Widgets.redraw(app) } } }.start()
    }

    /** Brukerskille: ny konto eller utlogging tømmer kalenderen i widgetene. */
    fun useAccount(ctx: Context, acct: String?) {
        val p = sp(ctx)
        if (acct != null && p.getString("acct", null) == acct) return
        p.edit().remove("json").remove("at").apply { if (acct != null) putString("acct", acct) else remove("acct") }.apply()
        events.value = emptyList()
    }
}

/** Henter de neste tre ukene: /api/kalender, ellers den kompakte /api/widgets/calendar. 404 = eldre server (tomt). */
internal suspend fun fetchKal26(ctx: Context, api: Api, acct: String?) {
    val today = LocalDate.now()
    val raw = runCatching { api.hlGet("/kalender?from=${today.minusDays(1)}&to=${today.plusDays(21)}", timeout = 12_000) }.getOrNull()
        ?: runCatching { api.hlGet("/widgets/calendar", timeout = 8_000) }.getOrNull()
        ?: return
    Kal26WidgetStore.save(ctx, raw, acct)
}

/** Ved start og slutt av hver time (og midnatt): tegner på nytt, henter på nytt når dataene er over en time gamle. */
class Kal26TickWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (System.currentTimeMillis() - Kal26WidgetStore.fetchedAt(ctx) > 60 * 60_000L) {
            FamilyPrefs.api(ctx)?.let { api -> runCatching { fetchKal26(ctx, api, null) } }
        }
        Kal26WidgetStore.tick.value = System.currentTimeMillis()
        Kal26Widgets.redraw(ctx)
        Kal26Widgets.scheduleTick(ctx)
        return Result.success()
    }
}

object Kal26Widgets {
    private const val TICK = "finanshub-kal26-tick"

    val ALL: List<GlanceAppWidget> get() = listOf(
        KalWidget26S(), KalWidget26M(), KalWidget26L(), S24KalWidget26S(), S24KalWidget26M(), S24KalWidget26L(),
    )

    suspend fun redraw(ctx: Context) { ALL.forEach { w -> runCatching { w.updateAll(ctx) } } }

    /** Neste timegrense (WorkManager, ingen eksakte alarmer). */
    fun scheduleTick(ctx: Context) {
        runCatching {
            val now = LocalDateTime.now()
            val at = kalNextBoundary(Kal26WidgetStore.current(ctx), now)
            val delay = Duration.between(now, at).seconds.coerceAtLeast(30)
            val req = OneTimeWorkRequestBuilder<Kal26TickWorker>().setInitialDelay(delay, TimeUnit.SECONDS).build()
            WorkManager.getInstance(ctx).enqueueUniqueWork(TICK, ExistingWorkPolicy.REPLACE, req)
        }
    }
}

/* ---------------- Widgetene ---------------- */

/** kind: m (Material You, velger liten/medium/stor etter størrelsen) eller s_s / s_m / s_l (Samsung, låst størrelse). */
abstract class KalW26(private val kind: String, private val m: String = "") : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val e0 = Kal26WidgetStore.current(context)
        val appId = runCatching { GlanceAppWidgetManager(context).getAppWidgetId(id) }.getOrDefault(0)
        val pap0 = S24.papir(context, appId)
        provideContent {
            val ev by Kal26WidgetStore.events.collectAsState()
            val tick by Kal26WidgetStore.tick.collectAsState()
            val pap by S24.papirFlow.collectAsState()
            val w = kalWidget(ev ?: e0, LocalDateTime.now().also { tick.hashCode() })
            GlanceTheme { KalBody26(kind, m, w, pap[appId] ?: pap0) }
        }
    }
}

class KalWidget26S : KalW26("m", "s")
class KalWidget26M : KalW26("m", "m")
class KalWidget26L : KalW26("m", "l")
class S24KalWidget26S : KalW26("s_s")
class S24KalWidget26M : KalW26("s_m")
class S24KalWidget26L : KalW26("s_l")

class KalReceiver26S : Receiver24() { override val glanceAppWidget: GlanceAppWidget = KalWidget26S() }
class KalReceiver26M : Receiver24() { override val glanceAppWidget: GlanceAppWidget = KalWidget26M() }
class KalReceiver26L : Receiver24() { override val glanceAppWidget: GlanceAppWidget = KalWidget26L() }
class S24KalReceiver26S : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24KalWidget26S() }
class S24KalReceiver26M : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24KalWidget26M() }
class S24KalReceiver26L : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S24KalWidget26L() }

/* ---------------- Felles ---------------- */

private fun openKal(ctx: Context, id: String? = null): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://kalender" + (id?.let { "?id=" + Uri.encode(it) } ?: "")), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

private fun kcp(c: Long) = ColorProvider(Color(c))
private fun kcp(c: Color) = ColorProvider(c)

@Composable
private fun KTx(text: String, size: TextUnit, color: ColorProvider, weight: FontWeight = FontWeight.Normal, modifier: GlanceModifier = GlanceModifier) =
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight), maxLines = 1)

/** Farger i widgeten: flate, tekst, dempet, aksent (rød), skillelinje og prøve-pillene. */
private class KPal(
    val bg: ColorProvider, val fg: ColorProvider, val mut: ColorProvider, val acc: ColorProvider, val line: ColorProvider,
    val red: ColorProvider, val onRed: ColorProvider, val pill: ColorProvider, val onPill: ColorProvider, val dimC: Long,
)

@Composable
private fun kpal(kind: String, papir: Boolean): KPal {
    val c = GlanceTheme.colors
    return when {
        // Material You: primærbeholder (design #f4ddd8 / #3b0f0a), mørk med dynamiske farger.
        kind == "m" -> KPal(c.primaryContainer, c.onPrimaryContainer, c.onSurfaceVariant, c.primary, c.outline, c.error, c.onError, c.surface, c.onSurface, 0x737A7468)
        // Samsung «Papir-farger»: hvit / mørk flate #1c1c1e og rød #b23a2a.
        papir -> KPal(
            androidx.glance.color.ColorProvider(day = Color.White, night = Color(0xFF1C1C1E)),
            androidx.glance.color.ColorProvider(day = Color(0xFF111111), night = Color.White),
            androidx.glance.color.ColorProvider(day = Color(0xFF6B6B6B), night = Color(0xFFA0A0A0)),
            androidx.glance.color.ColorProvider(day = Color(0xFFB23A2A), night = Color(0xFFF08A76)),
            androidx.glance.color.ColorProvider(day = Color(0x14000000), night = Color(0x24FFFFFF)),
            kcp(0xFFB23A2A), kcp(Color.White),
            androidx.glance.color.ColorProvider(day = Color(0x12000000), night = Color(0x1FFFFFFF)),
            androidx.glance.color.ColorProvider(day = Color(0xFF111111), night = Color.White), 0x736B6B6B,
        )
        // One UI-tema (standard).
        else -> KPal(c.widgetBackground, c.onSurface, c.onSurfaceVariant, c.primary, c.outline, c.error, c.onError, c.secondaryContainer, c.onSecondaryContainer, 0x736B6B6B)
    }
}

@Composable
private fun Stripe(color: Long, w: Dp, h: Dp) = Box(GlanceModifier.width(w).height(h).cornerRadius(w / 2).background(kcp(color))) {}

@Composable
private fun ColumnScope.KGrow() = Spacer(GlanceModifier.defaultWeight())

/**
 * Det synlige kortet. Material You fyller cellen (radius 28). Samsung: 134 × 155, 296 × 155 eller 296 × 330 dp,
 * sentrert i cellen så det flukter med Samsungs egne widgets (radius 20).
 */
@Composable
private fun KCard(kind: String, u: KPal, pad: Dp, content: @Composable ColumnScope.() -> Unit) {
    val ctx = LocalContext.current
    val size = LocalSize.current
    if (kind == "m") {
        Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(u.bg).padding(pad).clickable(openKal(ctx)), content = content)
        return
    }
    val w = if (kind == "s_s") 134.dp else 296.dp
    val h = if (kind == "s_l") 330.dp else 155.dp
    val padH = ((size.width - w) / 2).coerceAtLeast(0.dp)
    val padV = ((size.height - h) / 2).coerceAtLeast(0.dp)
    Box(GlanceModifier.fillMaxSize().padding(horizontal = padH, vertical = padV)) {
        Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(20.dp).background(u.bg).padding(pad).clickable(openKal(ctx)), content = content)
    }
}

@Composable
private fun KalBody26(kind: String, m: String, w: KalW, papir: Boolean) {
    val u = kpal(kind, papir)
    val size = LocalSize.current
    // Material You: størrelsen fra cellen (en widget kan endres fra 2 × 2 til 4 × 4). Uten mål: providerens størrelse.
    val form = when (kind) {
        "s_s" -> "s"; "s_m" -> "m"; "s_l" -> "l"
        else -> when {
            size.width <= 0.dp -> m.ifBlank { "s" }
            size.width < 250.dp -> "s"
            size.height >= 250.dp -> "l"
            else -> "m"
        }
    }
    when (form) {
        "s" -> KCard(kind, u, 14.dp) { KalSmall(w, u) }
        "m" -> KCard(kind, u, 14.dp) { KalMedium(w, u) }
        else -> KCard(kind, u, 16.dp) { KalLarge(w, u) }
    }
}

/** Liten: «NÅ», klokkeslett stort, fargestripe med fag og rom · lærer, og «34 min igjen». */
@Composable
private fun ColumnScope.KalSmall(w: KalW, u: KPal) {
    KTx(w.k, 10.sp, u.acc, FontWeight.Bold)
    Spacer(GlanceModifier.height(6.dp))
    KTx(w.big, 30.sp, u.fg, FontWeight.Bold)
    KGrow()
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Stripe(w.color, 4.dp, 32.dp)
        Spacer(GlanceModifier.width(7.dp))
        Column(GlanceModifier.defaultWeight()) {
            KTx(w.title, 14.sp, u.fg, FontWeight.Bold)
            if (w.sub.isNotBlank()) KTx(w.sub, 11.5.sp, u.mut)
        }
    }
    if (w.whenText.isNotBlank()) {
        Spacer(GlanceModifier.height(6.dp))
        KTx(w.whenText, 11.sp, u.acc, FontWeight.Bold)
    }
}

/** Medium: venstre som liten, høyre «I dag · mandag 19. okt» og de tre neste timene. */
@Composable
private fun ColumnScope.KalMedium(w: KalW, u: KPal) {
    val ctx = LocalContext.current
    Row(GlanceModifier.fillMaxSize()) {
        Column(GlanceModifier.defaultWeight().fillMaxHeight()) {
            KTx(w.k, 10.sp, u.acc, FontWeight.Bold)
            Spacer(GlanceModifier.height(6.dp))
            KTx(w.big, 28.sp, u.fg, FontWeight.Bold)
            Spacer(GlanceModifier.defaultWeight())
            KTx(w.title, 14.sp, u.fg, FontWeight.Bold)
            if (w.sub.isNotBlank()) KTx(w.sub, 11.5.sp, u.mut)
            if (w.whenText.isNotBlank()) { Spacer(GlanceModifier.height(4.dp)); KTx(w.whenText, 11.sp, u.acc, FontWeight.Bold) }
        }
        Spacer(GlanceModifier.width(12.dp))
        Box(GlanceModifier.width(1.dp).fillMaxHeight().background(u.line)) {}
        Spacer(GlanceModifier.width(12.dp))
        Column(GlanceModifier.defaultWeight().fillMaxHeight()) {
            KTx(w.dayT, 10.5.sp, u.mut, FontWeight.Bold)
            if (w.n3.isEmpty()) { Spacer(GlanceModifier.height(7.dp)); KTx("Ingen flere timer", 12.sp, u.mut) }
            w.n3.forEach { e ->
                Spacer(GlanceModifier.height(7.dp))
                Row(GlanceModifier.fillMaxWidth().clickable(openKal(ctx, e.id)), verticalAlignment = Alignment.CenterVertically) {
                    KTx(e.s, 11.sp, u.fg, FontWeight.Bold, GlanceModifier.width(36.dp))
                    Stripe(e.color, 3.dp, 24.dp)
                    Spacer(GlanceModifier.width(7.dp))
                    Column(GlanceModifier.defaultWeight()) {
                        KTx(e.short, 12.5.sp, u.fg, FontWeight.Bold)
                        if (e.room.isNotBlank()) KTx(e.room, 10.5.sp, u.mut)
                    }
                }
            }
        }
    }
}

/** Stor: «I dag · mandag 19. oktober · 4 timer», alle dagens timer (passerte dempet) og PRØVER OG FRISTER. */
@Composable
private fun ColumnScope.KalLarge(w: KalW, u: KPal) {
    val ctx = LocalContext.current
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        KTx(w.dayL, 16.sp, u.fg, FontWeight.Bold, GlanceModifier.defaultWeight())
        KTx(w.cnt, 11.sp, u.acc, FontWeight.Bold)
    }
    Column(GlanceModifier.fillMaxWidth()) {
        if (w.all.isEmpty()) { Spacer(GlanceModifier.height(8.dp)); KTx("Ingen timer", 13.sp, u.mut) }
        w.all.forEach { e ->
            Spacer(GlanceModifier.height(8.dp))
            // Passerte timer dempes (Glance har ikke opasitet: dempet farge og stripe).
            val fg = if (e.dim) u.mut else u.fg
            Row(GlanceModifier.fillMaxWidth().clickable(openKal(ctx, e.id)), verticalAlignment = Alignment.CenterVertically) {
                KTx(e.tm, 11.sp, u.mut, FontWeight.Bold, GlanceModifier.width(78.dp))
                Stripe(if (e.dim) (e.color and 0x00FFFFFFL) or 0x73000000L else e.color, 4.dp, 28.dp)
                Spacer(GlanceModifier.width(9.dp))
                Column(GlanceModifier.defaultWeight()) {
                    KTx(e.title, 13.5.sp, fg, FontWeight.Bold)
                    if (e.sub.isNotBlank()) KTx(e.sub, 11.sp, u.mut)
                }
            }
        }
    }
    KGrow()
    Column(GlanceModifier.fillMaxWidth()) {
        Box(GlanceModifier.fillMaxWidth().height(1.dp).background(u.line)) {}
        Spacer(GlanceModifier.height(8.dp))
        KTx("PRØVER OG FRISTER", 10.sp, u.acc, FontWeight.Bold)
        if (w.ex.isEmpty()) { Spacer(GlanceModifier.height(6.dp)); KTx("Ingen kommende", 12.sp, u.mut) }
        w.ex.forEach { x ->
            Spacer(GlanceModifier.height(6.dp))
            Row(GlanceModifier.fillMaxWidth().clickable(openKal(ctx, x.id)), verticalAlignment = Alignment.CenterVertically) {
                KTx(x.title, 13.sp, u.fg, FontWeight.Bold, GlanceModifier.defaultWeight())
                Box(GlanceModifier.cornerRadius(10.dp).background(if (x.red) u.red else u.pill).padding(horizontal = 8.dp, vertical = 3.dp)) {
                    KTx(x.inText, 10.5.sp, if (x.red) u.onRed else u.onPill, FontWeight.Bold)
                }
            }
        }
    }
}
