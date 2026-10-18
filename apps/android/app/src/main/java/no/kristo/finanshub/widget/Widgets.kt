package no.kristo.finanshub.widget

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.net.Uri
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.RowScope
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import no.kristo.finanshub.AppPrefs
import no.kristo.finanshub.Carrier
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.R
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import androidx.glance.color.ColorProvider as DayNight

/*
 * Hjemskjerm-widgets (design/Widgets.dc.html):
 *  1b Android · Glance med Material You-farger fra bakgrunnsbildet (GlanceTheme), 2×2 / 4×2 / 4×3, kan endre størrelse.
 *  1c Samsung · One UI-stil: litt høyere celler, hjørneradius 34 dp, mørk eller lys bakgrunn med innstillbar
 *     dekkevne (Innstillinger → Utseende → Widgets) og blå One UI-aksent.
 * Et trykk åpner riktig side i appen (finanshub://<side>).
 */

enum class WKind(val route: String) {
    WEATHER("homelab"), PACKAGES("tracking"), BUDGET("budget"), FINANCE("finance"), NEXT("subs"), STOCKS("stocks"),
    DOMAINS("domains"), MAT("mat"), FINN("finn"), BOLIG("boliger"), SCAN("scan"),
    UI_SEARCH("search"), UI_WEATHER("homelab"), UI_CLOCK("homelab"), UI_PACKAGES("tracking"), UI_SCAN("scan"), UI_BUDGET("budget"),
    UI_STOCKS("stocks"), UI_MAT("mat"), UI_FINANCE("finance"), UI_DOMAINS("domains"), UI_FINN("finn");

    val oneUi get() = name.startsWith("UI_")
}

/** Felles for alle widgetene: data fra WidgetStore, tegnes på nytt når dataene eller utseendet endres. */
abstract class HubWidget(private val kind: WKind) : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val first = WidgetStore.current(context)
        val firstStyle = WidgetStore.currentStyle(context)
        provideContent {
            val data by WidgetStore.data.collectAsState()
            val style by WidgetStore.style.collectAsState()
            GlanceTheme { WidgetBody(kind, data ?: first, style ?: firstStyle) }
        }
    }
}

class WeatherWidget : HubWidget(WKind.WEATHER)
class PackagesWidget : HubWidget(WKind.PACKAGES)
class BudgetWidget : HubWidget(WKind.BUDGET)
class FinanceWidget : HubWidget(WKind.FINANCE)
class NextChargeWidget : HubWidget(WKind.NEXT)
class StocksWidget : HubWidget(WKind.STOCKS)
class DomainsWidget : HubWidget(WKind.DOMAINS)
class MatWidget : HubWidget(WKind.MAT)
class FinnWidget : HubWidget(WKind.FINN)
class BoligWidget : HubWidget(WKind.BOLIG)
class ScanWidget : HubWidget(WKind.SCAN)
class OneUiSearchWidget : HubWidget(WKind.UI_SEARCH)
class OneUiWeatherWidget : HubWidget(WKind.UI_WEATHER)
class OneUiClockWidget : HubWidget(WKind.UI_CLOCK)
class OneUiPackagesWidget : HubWidget(WKind.UI_PACKAGES)
class OneUiScanWidget : HubWidget(WKind.UI_SCAN)
class OneUiBudgetWidget : HubWidget(WKind.UI_BUDGET)
class OneUiStocksWidget : HubWidget(WKind.UI_STOCKS)
class OneUiMatWidget : HubWidget(WKind.UI_MAT)
class OneUiFinanceWidget : HubWidget(WKind.UI_FINANCE)
class OneUiDomainsWidget : HubWidget(WKind.UI_DOMAINS)
class OneUiFinnWidget : HubWidget(WKind.UI_FINN)

/** Alle widgetene, for «tegn på nytt» etter en henting. */
val ALL_WIDGETS: List<GlanceAppWidget> get() = listOf(
    WeatherWidget(), PackagesWidget(), BudgetWidget(), FinanceWidget(), NextChargeWidget(), StocksWidget(), DomainsWidget(), MatWidget(),
    FinnWidget(), BoligWidget(), ScanWidget(), OneUiSearchWidget(), OneUiWeatherWidget(), OneUiClockWidget(), OneUiPackagesWidget(),
    OneUiScanWidget(), OneUiBudgetWidget(), OneUiStocksWidget(), OneUiMatWidget(), OneUiFinanceWidget(), OneUiDomainsWidget(), OneUiFinnWidget(),
)

/** Mottakerne som står i manifestet. Første widget som legges til starter hentingen hvert 15. minutt. */
abstract class HubReceiver : GlanceAppWidgetReceiver() {
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetSync.schedule(context)
        WidgetSync.refresh(context)
    }
}

class WeatherReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = WeatherWidget() }
class PackagesReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = PackagesWidget() }
class BudgetReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = BudgetWidget() }
class FinanceReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = FinanceWidget() }
class NextChargeReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = NextChargeWidget() }
class StocksReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = StocksWidget() }
class DomainsReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = DomainsWidget() }
class MatReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = MatWidget() }
class FinnReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = FinnWidget() }
class BoligReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = BoligWidget() }
class ScanReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = ScanWidget() }
class OneUiSearchReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiSearchWidget() }
class OneUiWeatherReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiWeatherWidget() }
class OneUiClockReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiClockWidget() }
class OneUiPackagesReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiPackagesWidget() }
class OneUiScanReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiScanWidget() }
class OneUiBudgetReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiBudgetWidget() }
class OneUiStocksReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiStocksWidget() }
class OneUiMatReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiMatWidget() }
class OneUiFinanceReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiFinanceWidget() }
class OneUiDomainsReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiDomainsWidget() }
class OneUiFinnReceiver : HubReceiver() { override val glanceAppWidget: GlanceAppWidget = OneUiFinnWidget() }

/* ---------------- Felles ---------------- */

private val nb = Locale("nb", "NO")
private const val MASK = "•••"

private class Fmt(val hide: Boolean) {
    fun kr(v: Double): String = if (hide) MASK else (if (v < 0) "−" else "") +
        NumberFormat.getNumberInstance(nb).apply { maximumFractionDigits = 0 }.format(abs(v)).replace(' ', ' ').replace(' ', ' ')
    fun kr2(v: Double): String = if (hide) MASK else (if (v < 0) "−" else "+") +
        NumberFormat.getNumberInstance(nb).apply { minimumFractionDigits = 2; maximumFractionDigits = 2 }.format(abs(v)).replace(' ', ' ').replace(' ', ' ')
    fun signed0(v: Double): String = if (hide) MASK else (if (v < 0) "−" else "+") + kr(abs(v))
}

private fun pct(v: Double) = String.format(nb, "%.1f %%", abs(v))
private fun deg(v: Double?) = v?.let { "${Math.round(it)}°" } ?: "–"
private fun ddmm(d: String) = if (d.length >= 10) "${d.substring(8, 10)}.${d.substring(5, 7)}" else d
private fun monthName(m: String): String = runCatching {
    LocalDate.parse((if (m.length == 7) "$m-15" else m).take(10)).format(DateTimeFormatter.ofPattern("LLLL", nb))
}.getOrDefault(LocalDate.now().format(DateTimeFormatter.ofPattern("LLLL", nb)))
private fun monthShort(m: String) = monthName(m).take(3)

/** Værsymbolet fra MET som et tegn (RemoteViews har ikke vektorikoner fra appen her). */
private fun wxIcon(symbol: String, desc: String = ""): String {
    val s = (symbol + " " + desc).lowercase()
    return when {
        "thunder" in s || "torden" in s -> "⛈"
        "snow" in s || "snø" in s || "sleet" in s || "sludd" in s -> "❄"
        "rain" in s || "regn" in s || "shower" in s || "byger" in s -> "🌧"
        "fog" in s || "tåke" in s -> "🌫"
        "partly" in s || "fair" in s || "lettskyet" in s || "delvis" in s -> "⛅"
        "cloud" in s || "skyet" in s || "overskyet" in s -> "☁"
        "night" in s -> "☾"
        else -> "☀"
    }
}

private fun link(ctx: Context, route: String): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://$route"), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

private fun fixed(c: Long) = ColorProvider(Color(c))
private fun fixed(c: Color) = ColorProvider(c)
private fun dn(day: Long, night: Long) = DayNight(day = Color(day), night = Color(night))

@Composable
private fun T(text: String, size: TextUnit, color: ColorProvider, weight: FontWeight = FontWeight.Normal, maxLines: Int = 1,
              modifier: GlanceModifier = GlanceModifier, align: TextAlign = TextAlign.Start) =
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight, textAlign = align), maxLines = maxLines)

@Composable
private fun VSpace(h: Dp) = Spacer(GlanceModifier.height(h))

@Composable
private fun HSpace(w: Dp) = Spacer(GlanceModifier.width(w))

@Composable
private fun ColumnScope.Fill() = Spacer(GlanceModifier.defaultWeight())

@Composable
private fun RowScope.FillH() = Spacer(GlanceModifier.defaultWeight())

/** Transportørmerket med initialer på merkefargen. */
@Composable
private fun Badge(carrier: String, size: Dp = 30.dp) {
    val c = Carrier.KNOWN.firstOrNull { it.id == carrier } ?: Carrier.KNOWN.last()
    Box(GlanceModifier.size(size).cornerRadius(10.dp).background(Color(c.color)), contentAlignment = Alignment.Center) {
        T(c.ini, if (c.ini.length > 2) 9.sp else 10.sp, fixed(c.fg), FontWeight.Bold)
    }
}

/** Fem små streker for fremdriften til en pakke. */
@Composable
private fun Steps(step: Int, on: ColorProvider, now: ColorProvider, off: ColorProvider) {
    Row(GlanceModifier.fillMaxWidth()) {
        repeat(5) { i ->
            if (i > 0) HSpace(3.dp)
            Box(GlanceModifier.defaultWeight().height(4.dp).cornerRadius(2.dp).background(if (i < step) on else if (i == step) now else off)) {}
        }
    }
}

/** Kurve for aksjeverdien, tegnet som bilde. */
private fun sparkline(values: List<Double>, color: Int): Bitmap? {
    if (values.size < 2) return null
    val w = 300; val h = 80
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val min = values.min(); val max = values.max(); val span = (max - min).takeIf { it > 0 } ?: 1.0
    val p = Path()
    values.forEachIndexed { i, v ->
        val x = i * (w - 4f) / (values.size - 1) + 2f
        val y = (h - 4f) - ((v - min) / span).toFloat() * (h - 8f)
        if (i == 0) p.moveTo(x, y) else p.lineTo(x, y)
    }
    Canvas(bmp).drawPath(p, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color; style = Paint.Style.STROKE; strokeWidth = 5f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND })
    return bmp
}

private fun isNight(ctx: Context) = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

@Composable
private fun WidgetBody(kind: WKind, d: WidgetData, style: WidgetStyle) {
    val ctx = LocalContext.current
    val f = Fmt(AppPrefs(ctx).bool(AppPrefs.HIDE_AMOUNTS))
    if (kind.oneUi) OneUi(kind, d, style, f) else Material(kind, d, f)
}

/* ---------------- 1b · Material You ---------------- */

@Composable
private fun MCard(route: String, bg: ColorProvider = GlanceTheme.colors.widgetBackground, padding: Dp = 18.dp, content: @Composable ColumnScope.() -> Unit) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(bg).padding(padding).clickable(link(ctx, route)), content = content)
}

@Composable
private fun MEmpty(route: String, title: String, text: String) = MCard(route) {
    T(title, 13.sp, GlanceTheme.colors.onSurfaceVariant)
    Fill()
    T(text, 13.sp, GlanceTheme.colors.onSurface, maxLines = 3)
}

private val mGreen get() = dn(0xFF1E7A4F, 0xFF9FE3C6)

@Composable
private fun Material(kind: WKind, d: WidgetData, f: Fmt) {
    val c = GlanceTheme.colors
    val size = LocalSize.current
    val wide = size.width >= 220.dp
    val tall = size.height >= 220.dp
    if (!d.loggedIn) { MEmpty(kind.route, "FinansHub", "Logg inn i appen for å se data her."); return }
    when (kind) {
        WKind.WEATHER -> {
            val w = d.weather ?: return MEmpty(kind.route, "Vær", d.error ?: "Henter været …")
            MCard(kind.route, c.secondaryContainer) {
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    T(w.place.ifBlank { "Vær" }, 13.sp, c.onSecondaryContainer, FontWeight.Medium, modifier = GlanceModifier.defaultWeight())
                    T(wxIcon(w.symbol, w.desc), 16.sp, c.onSecondaryContainer)
                }
                Fill()
                T(deg(w.temp), 46.sp, c.onSecondaryContainer)
                T(listOfNotNull(w.desc.ifBlank { null }, if (w.lo != null && w.hi != null) "${Math.round(w.lo)}–${deg(w.hi)}" else null).joinToString(" · "), 13.sp, c.onSecondaryContainer)
                if (wide && w.hours.isNotEmpty()) {
                    VSpace(10.dp)
                    Row(GlanceModifier.fillMaxWidth()) {
                        w.hours.take(6).forEach { h ->
                            Column(GlanceModifier.defaultWeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                                T(h.t.takeLast(5).take(2), 11.sp, c.onSecondaryContainer, align = TextAlign.Center)
                                T(wxIcon(h.symbol), 13.sp, c.onSecondaryContainer, align = TextAlign.Center)
                                T(deg(h.temp), 12.sp, c.onSecondaryContainer, FontWeight.Medium, align = TextAlign.Center)
                            }
                        }
                    }
                }
            }
        }
        WKind.PACKAGES -> {
            val p = d.packages ?: return MEmpty(kind.route, "Pakker", d.error ?: "Ingen pakker på vei.")
            MCard(kind.route) {
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    T("Pakker", 15.sp, c.onSurface, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
                    val ready = p.items.count { it.ready }
                    if (ready > 0) Box(GlanceModifier.cornerRadius(12.dp).background(c.primary).padding(horizontal = 10.dp, vertical = 4.dp)) {
                        T("$ready klar", 12.sp, c.onPrimary, FontWeight.Bold)
                    } else T("${p.active} på vei", 12.5.sp, c.onSurfaceVariant)
                }
                VSpace(8.dp)
                if (p.items.isEmpty()) T("Ingen pakker på vei.", 13.sp, c.onSurfaceVariant)
                p.items.take(if (tall) 4 else if (size.height >= 150.dp) 2 else 1).forEach { s ->
                    Row(GlanceModifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Badge(s.carrier)
                        HSpace(10.dp)
                        T(s.name, 14.sp, c.onSurface, modifier = GlanceModifier.defaultWeight())
                        HSpace(6.dp)
                        T(if (s.ready) "Hent" else s.eta.ifBlank { s.statusText }.let { if (it.length >= 10 && it[4] == '-') ddmm(it) else it }, 12.5.sp,
                            if (s.ready) c.primary else c.onSurface, FontWeight.Medium)
                    }
                }
            }
        }
        WKind.BUDGET -> {
            val b = d.budget ?: return MEmpty(kind.route, "Budsjett", d.error ?: "Ingen budsjett ennå.")
            MCard(kind.route) {
                T("Brukt i ${monthShort(b.month)}", 13.sp, c.onSurfaceVariant)
                Fill()
                T(f.kr(b.spent), 30.sp, c.onSurface, FontWeight.Bold)
                T("av ${f.kr(b.limit)} kr", 12.5.sp, c.onSurfaceVariant)
                VSpace(8.dp)
                LinearProgressIndicator(progress = (if (b.limit > 0) b.spent / b.limit else 0.0).toFloat().coerceIn(0f, 1f),
                    modifier = GlanceModifier.fillMaxWidth().height(10.dp).cornerRadius(5.dp), color = c.primary, backgroundColor = c.surfaceVariant)
                if (tall) b.top.take(3).forEach { r ->
                    VSpace(8.dp)
                    Row(GlanceModifier.fillMaxWidth()) {
                        T(r.name, 12.5.sp, c.onSurfaceVariant, modifier = GlanceModifier.defaultWeight())
                        T("${f.kr(r.spent)} / ${f.kr(r.limit)}", 12.5.sp, c.onSurface)
                    }
                }
            }
        }
        WKind.FINANCE -> {
            val fi = d.finance ?: return MEmpty(kind.route, "Finans", d.error ?: "Henter saldo …")
            val ctx = LocalContext.current
            MCard(kind.route, padding = 20.dp) {
                Row(GlanceModifier.fillMaxWidth()) {
                    T("Finans", 16.sp, c.onSurface, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
                    T(LocalDate.now().format(DateTimeFormatter.ofPattern("d. MMM", nb)), 12.5.sp, c.onSurfaceVariant)
                }
                VSpace(10.dp)
                Column(GlanceModifier.fillMaxWidth().cornerRadius(22.dp).background(c.secondaryContainer).padding(horizontal = 16.dp, vertical = 12.dp)) {
                    T("Saldo", 12.5.sp, c.onSecondaryContainer)
                    T("${f.kr(fi.balance)} kr", 30.sp, c.onSecondaryContainer, FontWeight.Bold)
                }
                val rows = if (size.height >= 280.dp) 3 else if (tall) 2 else 0
                fi.recent.take(rows).forEach { t ->
                    VSpace(6.dp)
                    Row(GlanceModifier.fillMaxWidth().padding(horizontal = 4.dp)) {
                        T(t.merchant, 14.sp, c.onSurface, modifier = GlanceModifier.defaultWeight())
                        T(if (t.amount > 0) "+" + f.kr(t.amount) else f.kr2(t.amount), 14.sp, if (t.amount > 0) mGreen else c.onSurface)
                    }
                }
                Fill()
                Row(GlanceModifier.fillMaxWidth()) {
                    Box(GlanceModifier.defaultWeight().height(46.dp).cornerRadius(23.dp).background(c.primary).clickable(link(ctx, "scan/camera")), contentAlignment = Alignment.Center) {
                        T("Skann", 14.sp, c.onPrimary, FontWeight.Bold)
                    }
                    HSpace(8.dp)
                    Box(GlanceModifier.defaultWeight().height(46.dp).cornerRadius(23.dp).background(c.surfaceVariant).clickable(link(ctx, "review")), contentAlignment = Alignment.Center) {
                        T(if (fi.toReview > 0) "${fi.toReview} til gjennomgang" else "Liste", 13.sp, c.onSurfaceVariant, FontWeight.Medium)
                    }
                }
            }
        }
        WKind.NEXT -> {
            val n = d.nextCharge ?: return MEmpty(kind.route, "Neste trekk", d.error ?: "Ingen trekk de neste dagene.")
            MCard(kind.route) {
                T("Neste trekk", 13.sp, c.onSurfaceVariant)
                Fill()
                T(n.name, 16.sp, c.onSurface, FontWeight.Bold)
                T("${f.kr(n.amount)} kr", 24.sp, c.onSurface, FontWeight.Bold)
                T(ddmm(n.date) + (n.daysLeft?.let { if (it == 0) " · i dag" else if (it == 1) " · i morgen" else " · om $it d" } ?: ""), 12.5.sp, c.onSurfaceVariant)
            }
        }
        WKind.STOCKS -> {
            val s = d.stocks ?: return MEmpty(kind.route, "Trading 212", d.error ?: "Koble til Trading 212 i FinansHub.")
            val ctx = LocalContext.current
            val up = s.changePct >= 0
            val bg = dn(0xFFC9E4D8, 0xFF1F3A2F); val fg = dn(0xFF07301F, 0xFFC9E4D8)
            val line = if (up) dn(0xFF1E7A4F, 0xFF9FE3C6) else dn(0xFFB3261E, 0xFFFF8A80)
            MCard(kind.route, bg) {
                T("Trading 212", 13.sp, fg)
                Fill()
                T(f.kr(s.value), 26.sp, fg, FontWeight.Bold)
                T("${if (up) "▲" else "▼"} ${pct(s.changePct)} i dag", 13.sp, line, FontWeight.Medium)
                sparkline(s.series, (if (isNight(ctx)) Color(if (up) 0xFF9FE3C6 else 0xFFFF8A80) else Color(if (up) 0xFF1E7A4F else 0xFFB3261E)).toArgb())?.let { bmp ->
                    VSpace(6.dp)
                    Image(ImageProvider(bmp), null, GlanceModifier.fillMaxWidth().height(24.dp), contentScale = ContentScale.FillBounds)
                }
            }
        }
        WKind.DOMAINS -> {
            val dm = d.domains ?: return MEmpty(kind.route, "Domener", d.error ?: "Ingen domener ennå.")
            val top = dm.items.firstOrNull()
            MCard(kind.route, c.surfaceVariant) {
                T(top?.let { "${it.name} · 24 t" } ?: "Domener", 13.sp, c.onSurfaceVariant)
                Fill()
                if (top?.visits != null) {
                    T(count(top.visits), 34.sp, c.onSurface, FontWeight.Bold)
                    T("besøk${top.uptime?.let { " · ${String.format(nb, "%.2f", it)} % oppe" } ?: ""}", 12.5.sp, c.onSurfaceVariant)
                } else {
                    T("${dm.up} av ${dm.total}", 30.sp, c.onSurface, FontWeight.Bold)
                    T(if (dm.down > 0) "${dm.down} nede" else "alle oppe", 12.5.sp, if (dm.down > 0) dn(0xFFB3261E, 0xFFFF8A80) else c.onSurfaceVariant)
                }
                dm.expiringSoon.firstOrNull()?.let { (n, days) -> T("$n utløper om $days d", 11.5.sp, c.onSurfaceVariant) }
            }
        }
        WKind.MAT -> {
            val m = d.matplan ?: return MEmpty(kind.route, "Mat i dag", d.error ?: "Ingen middag planlagt.")
            MCard(kind.route, c.tertiaryContainer) {
                T("Middag i dag", 13.sp, c.onTertiaryContainer)
                Fill()
                T(m.todayDish ?: "Ingen rett ennå", 19.sp, c.onTertiaryContainer, FontWeight.Bold, maxLines = 2)
                val sub = listOfNotNull(m.todayCook?.let { "$it lager" }, m.tomorrowDish?.let { "i morgen $it" }).joinToString(" · ")
                if (sub.isNotBlank()) T(sub, 12.5.sp, c.onTertiaryContainer, maxLines = 2)
            }
        }
        WKind.FINN -> {
            val fn = d.finn ?: return MEmpty(kind.route, "Finn", d.error ?: "Ingen pågående handler.")
            MCard(kind.route) {
                Row(GlanceModifier.fillMaxWidth()) {
                    T("Finn · pågående", 15.sp, c.onSurface, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
                    T("netto ${f.signed0(fn.netYear)} kr", 12.5.sp, c.onSurfaceVariant)
                }
                VSpace(10.dp)
                if (fn.items.isEmpty()) T("Ingen pågående handler.", 13.sp, c.onSurfaceVariant)
                Row(GlanceModifier.fillMaxWidth().defaultWeight()) {
                    fn.items.take(if (wide) 2 else 1).forEachIndexed { i, it ->
                        if (i > 0) HSpace(10.dp)
                        Column(GlanceModifier.defaultWeight().fillMaxHeight().cornerRadius(20.dp).background(c.surfaceVariant).padding(12.dp)) {
                            T(it.step.uppercase().ifBlank { if (it.sold == true) "SOLGT" else "KJØPT" }, 11.5.sp, if (it.sold == true) mGreen else c.primary, FontWeight.Bold)
                            T(it.title, 14.sp, c.onSurface, FontWeight.Bold)
                            T(it.status, 12.sp, c.onSurfaceVariant, maxLines = 2)
                        }
                    }
                }
            }
        }
        WKind.BOLIG -> {
            val b = d.boliger ?: return MEmpty(kind.route, "Boliger", d.error ?: "Ingen boliger ennå.")
            MCard(kind.route) {
                T(b.name, 13.sp, c.onSurfaceVariant)
                Fill()
                if (b.month != null) {
                    T("${f.kr(b.month)} kr", 24.sp, c.onSurface, FontWeight.Bold)
                    T("i ${monthName(LocalDate.now().toString())}", 12.5.sp, c.onSurfaceVariant)
                }
                b.dueSoon.take(if (b.month == null) 3 else 1).forEach { r ->
                    T("${r.title} · ${f.kr(r.amount)} kr · ${ddmm(r.date)}", 12.sp, c.onSurface)
                }
                if (b.month == null && b.dueSoon.isEmpty()) T("Ingen regninger snart.", 13.sp, c.onSurface)
            }
        }
        WKind.SCAN -> {
            val ctx = LocalContext.current
            MCard(kind.route, c.primary) {
                T("Skann kvittering", 16.sp, c.onPrimary, FontWeight.Bold)
                Fill()
                Row(GlanceModifier.fillMaxWidth()) {
                    Box(GlanceModifier.defaultWeight().height(46.dp).cornerRadius(23.dp).background(c.onPrimary).clickable(link(ctx, "scan/camera")), contentAlignment = Alignment.Center) {
                        T("Kamera", 13.sp, c.primary, FontWeight.Bold)
                    }
                    HSpace(8.dp)
                    Box(GlanceModifier.defaultWeight().height(46.dp).cornerRadius(23.dp).background(c.primaryContainer).clickable(link(ctx, "scan/files")), contentAlignment = Alignment.Center) {
                        T("Filer", 13.sp, c.onPrimaryContainer, FontWeight.Bold)
                    }
                }
            }
        }
        else -> MEmpty(kind.route, "FinansHub", "")
    }
}

private fun count(v: Double): String = when {
    v >= 1_000_000 -> String.format(nb, "%.1f mill.", v / 1_000_000)
    else -> NumberFormat.getNumberInstance(nb).apply { maximumFractionDigits = 0 }.format(v).replace(' ', ' ').replace(' ', ' ')
}

/* ---------------- 1c · Samsung One UI ---------------- */

private val ACCENT = Color(0xFF3E91FF)

/** Fargene i One UI-settet: bakgrunn med valgt dekkevne, og tekst som passer til lys eller mørk modus. */
private class Ui(private val style: WidgetStyle) {
    private val a = (style.alpha * 255 / 100).coerceIn(0, 255)
    private fun pick(day: Long, night: Long): ColorProvider = when (style.theme) {
        "dark" -> fixed(night); "light" -> fixed(day); else -> dn(day, night)
    }
    val bg: ColorProvider = when (style.theme) {
        "dark" -> fixed(Color(18, 18, 20, a)); "light" -> fixed(Color(250, 250, 252, a))
        else -> DayNight(day = Color(250, 250, 252, a), night = Color(18, 18, 20, a))
    }
    val text = pick(0xFF111114, 0xFFFFFFFF)
    val sub = pick(0xFF5E5E66, 0xFFB4B4BC)
    val faint = pick(0x14000000, 0x12FFFFFF)
    val line = pick(0x1A000000, 0x14FFFFFF)
    val green = pick(0xFF1E8E4E, 0xFF5BD08A)
    val orange = pick(0xFFC2410C, 0xFFFFB08A)
    val accent = fixed(ACCENT)
    val onAccent = fixed(Color.White)
}

@Composable
private fun UCard(route: String, bg: ColorProvider, padding: Dp = 18.dp, content: @Composable ColumnScope.() -> Unit) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(34.dp).background(bg).padding(padding).clickable(link(ctx, route)), content = content)
}

@Composable
private fun UEmpty(route: String, u: Ui, title: String, text: String) = UCard(route, u.bg) {
    T(title, 13.sp, u.sub)
    Fill()
    T(text, 14.sp, u.text, maxLines = 3)
}

@Composable
private fun OneUi(kind: WKind, d: WidgetData, style: WidgetStyle, f: Fmt) {
    val u = Ui(style)
    val ctx = LocalContext.current
    val size = LocalSize.current
    if (!d.loggedIn && kind != WKind.UI_CLOCK && kind != WKind.UI_SEARCH) { UEmpty(kind.route, u, "FinansHub", "Logg inn i appen for å se data her."); return }
    when (kind) {
        WKind.UI_SEARCH -> {
            Row(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(40.dp).background(u.bg).padding(horizontal = 18.dp).clickable(link(ctx, "search")),
                verticalAlignment = Alignment.CenterVertically) {
                T("⌕", 17.sp, u.sub)
                HSpace(12.dp)
                T("Søk i Homelab og FinansHub", 15.sp, u.sub, modifier = GlanceModifier.defaultWeight())
                Box(GlanceModifier.size(40.dp).cornerRadius(20.dp).background(u.accent).clickable(link(ctx, "search?ai=1")), contentAlignment = Alignment.Center) {
                    T("✦", 14.sp, u.onAccent, FontWeight.Bold)
                }
            }
        }
        WKind.UI_WEATHER -> {
            val w = d.weather ?: return UEmpty(kind.route, u, "Vær", d.error ?: "Henter været …")
            UCard(kind.route, fixed(0xFF173269)) {
                Row(GlanceModifier.fillMaxWidth()) { FillH(); T(wxIcon(w.symbol, w.desc), 26.sp, fixed(0xFFC6DBE6)) }
                Fill()
                T(deg(w.temp), 30.sp, fixed(Color.White), FontWeight.Bold)
                T(w.desc.ifBlank { "–" }, 13.5.sp, fixed(Color.White), FontWeight.Medium, maxLines = 2)
                T("⌖ ${w.place.ifBlank { "Her" }}", 12.5.sp, fixed(0xCCFFFFFF))
            }
        }
        WKind.UI_CLOCK -> {
            val night = when (style.theme) { "dark" -> true; "light" -> false; else -> isNight(ctx) }
            val textColor = if (night) android.graphics.Color.WHITE else 0xFF111114.toInt()
            val subColor = if (night) 0xBFFFFFFF.toInt() else 0xFF5E5E66.toInt()
            val rv = RemoteViews(ctx.packageName, R.layout.widget_clock).apply {
                setTextColor(R.id.clock_time, textColor)
                setTextColor(R.id.clock_date, subColor)
            }
            val alarm = (ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager)?.nextAlarmClock?.triggerTime?.let {
                java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("EEE HH:mm", nb))
            }
            UCard("homelab", u.bg, padding = 20.dp) {
                AndroidRemoteViews(rv, GlanceModifier.fillMaxWidth().defaultWeight())
                T(alarm?.let { "Alarm $it" } ?: "Ingen alarm", 13.sp, u.sub)
            }
        }
        WKind.UI_PACKAGES -> {
            val p = d.packages ?: return UEmpty(kind.route, u, "Pakker", d.error ?: "Ingen pakker på vei.")
            UCard(kind.route, u.bg, padding = 16.dp) {
                Row(GlanceModifier.fillMaxWidth()) { T("Pakker", 13.sp, u.sub, modifier = GlanceModifier.defaultWeight()); T("${p.active}", 13.sp, u.sub) }
                Fill()
                val first = p.items.firstOrNull()
                if (first == null) T("Ingen pakker på vei.", 14.sp, u.text, maxLines = 2)
                else {
                    T(first.name, 15.sp, u.text, FontWeight.Bold)
                    T(if (first.ready) "Klar for henting" else first.statusText, 13.sp, if (first.ready) u.orange else u.sub)
                    if (p.items.size > 1 || p.active > 1) { VSpace(6.dp); T("+ ${maxOf(p.active, p.items.size) - 1} på vei", 12.sp, u.sub) }
                }
            }
        }
        WKind.UI_SCAN -> UCard(kind.route, u.accent, padding = 16.dp) {
            T("Skann", 13.sp, u.onAccent, FontWeight.Bold)
            Fill()
            Box(GlanceModifier.fillMaxWidth().height(40.dp).cornerRadius(20.dp).background(fixed(0xF2FFFFFF)).clickable(link(ctx, "scan/camera")), contentAlignment = Alignment.Center) {
                T("Kamera", 13.5.sp, fixed(0xFF0B3B7A), FontWeight.Bold)
            }
            VSpace(6.dp)
            Box(GlanceModifier.fillMaxWidth().height(40.dp).cornerRadius(20.dp).background(fixed(0x38FFFFFF)).clickable(link(ctx, "scan/files")), contentAlignment = Alignment.Center) {
                T("Fra filer", 13.5.sp, u.onAccent, FontWeight.Medium)
            }
        }
        WKind.UI_BUDGET -> {
            val b = d.budget ?: return UEmpty(kind.route, u, "Budsjett", d.error ?: "Ingen budsjett ennå.")
            UCard(kind.route, u.bg, padding = 20.dp) {
                Row(GlanceModifier.fillMaxWidth()) {
                    T("Budsjett · ${monthName(b.month)}", 15.sp, u.text, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
                    b.daysLeft?.let { T("$it dager igjen", 13.sp, u.sub) }
                }
                VSpace(8.dp)
                Row(verticalAlignment = Alignment.Bottom) {
                    T("${f.kr(b.spent)} kr", 26.sp, u.text, FontWeight.Medium)
                    HSpace(8.dp)
                    T("av ${f.kr(b.limit)}", 13.sp, u.sub)
                }
                b.top.take(if (size.height >= 200.dp) 3 else 2).forEach { r ->
                    VSpace(7.dp)
                    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        T(r.name, 13.sp, u.sub, modifier = GlanceModifier.width(90.dp))
                        LinearProgressIndicator(progress = (if (r.limit > 0) r.spent / r.limit else 0.0).toFloat().coerceIn(0f, 1f),
                            modifier = GlanceModifier.defaultWeight().height(6.dp).cornerRadius(3.dp), color = u.accent, backgroundColor = u.faint)
                    }
                }
            }
        }
        WKind.UI_STOCKS -> {
            val s = d.stocks ?: return UEmpty(kind.route, u, "Trading 212", d.error ?: "Koble til Trading 212 i FinansHub.")
            UCard(kind.route, u.bg, padding = 16.dp) {
                T("Trading 212", 13.sp, u.sub)
                Fill()
                T(f.kr(s.value), 26.sp, u.text, FontWeight.Medium)
                T("${if (s.changePct >= 0) "▲" else "▼"} ${pct(s.changePct)} i dag", 13.sp, if (s.changePct >= 0) u.green else fixed(0xFFFF6B6B), FontWeight.Medium)
            }
        }
        WKind.UI_MAT -> {
            val m = d.matplan ?: return UEmpty(kind.route, u, "Mat i dag", d.error ?: "Ingen middag planlagt.")
            UCard(kind.route, u.bg, padding = 16.dp) {
                T("Middag i dag", 13.sp, u.sub)
                Fill()
                T(m.todayDish ?: "Ingen rett ennå", 18.sp, u.text, FontWeight.Medium, maxLines = 2)
                m.todayCook?.let { T("$it lager", 13.sp, u.sub) }
            }
        }
        WKind.UI_FINANCE -> {
            val fi = d.finance ?: return UEmpty(kind.route, u, "FinansHub", d.error ?: "Henter saldo …")
            UCard(kind.route, u.bg, padding = 20.dp) {
                Row(GlanceModifier.fillMaxWidth()) {
                    T("FinansHub", 16.sp, u.text, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
                    if (d.updatedAt > 0) T("Oppdatert ${java.time.Instant.ofEpochMilli(d.updatedAt).atZone(java.time.ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("HH:mm"))}", 13.sp, u.sub)
                }
                VSpace(10.dp)
                T("Saldo", 13.sp, u.sub)
                T("${f.kr(fi.balance)} kr", 34.sp, u.text, FontWeight.Medium)
                VSpace(10.dp)
                Row(GlanceModifier.fillMaxWidth()) {
                    Column(GlanceModifier.defaultWeight().cornerRadius(18.dp).background(u.faint).padding(12.dp).clickable(link(ctx, "subs"))) {
                        T("Neste trekk", 12.sp, u.sub)
                        T(d.nextCharge?.let { "${it.name} · ${f.kr(it.amount)} kr" } ?: "Ingen", 14.sp, u.text, FontWeight.Bold)
                    }
                    HSpace(8.dp)
                    Column(GlanceModifier.defaultWeight().cornerRadius(18.dp).background(u.faint).padding(12.dp).clickable(link(ctx, "review"))) {
                        T("Til gjennomgang", 12.sp, u.sub)
                        T("${fi.toReview} kvittering${if (fi.toReview == 1) "" else "er"}", 14.sp, u.text, FontWeight.Bold)
                    }
                }
                VSpace(6.dp)
                fi.recent.take(if (size.height >= 330.dp) 3 else 2).forEach { t ->
                    Box(GlanceModifier.fillMaxWidth().height(1.dp).background(u.line)) {}
                    Row(GlanceModifier.fillMaxWidth().padding(vertical = 8.dp)) {
                        T(t.merchant, 14.sp, u.text, modifier = GlanceModifier.defaultWeight())
                        T(if (t.amount > 0) "+" + f.kr(t.amount) else f.kr2(t.amount), 14.sp, if (t.amount > 0) u.green else u.text)
                    }
                }
                Fill()
                Row(GlanceModifier.fillMaxWidth()) {
                    listOf("Skann" to "scan/camera", "Liste" to "list", "Budsjett" to "budget").forEach { (n, r) ->
                        Box(GlanceModifier.defaultWeight().height(32.dp).clickable(link(ctx, r)), contentAlignment = Alignment.Center) { T(n, 13.sp, u.accent, FontWeight.Medium) }
                    }
                }
            }
        }
        WKind.UI_DOMAINS -> {
            val dm = d.domains ?: return UEmpty(kind.route, u, "Domener", d.error ?: "Ingen domener ennå.")
            UCard(kind.route, u.bg, padding = 20.dp) {
                Row(GlanceModifier.fillMaxWidth()) { T("Domener", 15.sp, u.text, FontWeight.Bold, modifier = GlanceModifier.defaultWeight()); T("24 t", 13.sp, u.sub) }
                VSpace(10.dp)
                if (dm.items.isEmpty()) {
                    T("${dm.up} av ${dm.total} oppe", 24.sp, u.text, FontWeight.Medium)
                    if (dm.down > 0) T("${dm.down} nede", 12.sp, fixed(0xFFFF6B6B))
                } else Row(GlanceModifier.fillMaxWidth()) {
                    dm.items.take(2).forEachIndexed { i, x ->
                        if (i > 0) HSpace(10.dp)
                        Column(GlanceModifier.defaultWeight()) {
                            T(x.name, 13.sp, u.sub)
                            T(x.visits?.let { v -> count(v) } ?: if (x.up) "Oppe" else "Nede", 24.sp, u.text, FontWeight.Medium)
                            T(x.uptime?.let { "${String.format(nb, "%.2f", it)} % oppe" } ?: if (x.up) "oppe" else "nede", 12.sp, if (x.up) u.green else fixed(0xFFFF6B6B))
                        }
                    }
                }
            }
        }
        WKind.UI_FINN -> {
            val fn = d.finn ?: return UEmpty(kind.route, u, "Finn", d.error ?: "Ingen pågående handler.")
            UCard(kind.route, u.bg, padding = 20.dp) {
                Row(GlanceModifier.fillMaxWidth()) { T("Finn", 15.sp, u.text, FontWeight.Bold, modifier = GlanceModifier.defaultWeight()); T("netto ${f.signed0(fn.netYear)} kr", 13.sp, u.sub) }
                VSpace(10.dp)
                if (fn.items.isEmpty()) T("Ingen pågående handler.", 14.sp, u.sub)
                fn.items.take(if (size.height >= 200.dp) 4 else 2).forEach { it ->
                    Row(GlanceModifier.fillMaxWidth().padding(vertical = 3.dp)) {
                        T(it.title + (it.sold?.let { s -> if (s) " · solgt" else " · kjøpt" } ?: ""), 14.sp, u.text, modifier = GlanceModifier.defaultWeight())
                        HSpace(8.dp)
                        T(it.status, 13.sp, if (it.sold == true) u.sub else u.orange)
                    }
                }
            }
        }
        else -> UEmpty(kind.route, u, "FinansHub", "")
    }
}
