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
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
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
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.flow.MutableStateFlow
import no.kristo.finanshub.Api
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.family.FamilyPrefs
import no.kristo.finanshub.parseStopDeps
import no.kristo.finanshub.parseStopList
import no.kristo.finanshub.ruterModeColor
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/*
 * Prompt 27 (ANDROID-B): Ruter-widgets (fasit Widgets.dc.html 2b og 2c, claude-code-ruter-hjem.md).
 *  - Material You (Glance, alle telefoner): 2 × 2 (stopp + to avganger), 4 × 2 med ↻ (tre avganger), 4 × 1 stripe («Neste fra …» + Åpne).
 *  - Samsung One UI: liten (134 × 155, neste avgang stort), bred (296 × 155, fire avganger, «Stopp ▾») og stabel (én avgang per stopp,
 *    «Stabel · 2 av 3», prikker). Providerne er av i manifestet og slås på bare når Build.MANUFACTURER er samsung (S24.enableProviders).
 *  - Standard er stoppene fra Ruter-kortet på Hjem (home_departures). Trykk på stoppnavnet (4 × 2, bred, stabel) bytter stopp per widget.
 *  - Data: /api/widgets/departures, ellers Hjem-stoppene via /ruter/departures. Hentes av WorkManager hvert 5. minutt (kjede av
 *    engangsjobber med nett) og med ↻. Minuttene regnes ut fra avgangstiden hver gang widgeten tegnes (tidslinje imellom).
 */

/* ---------------- Data ---------------- */

data class WDep27(val line: String, val to: String, val color: Long, val textColor: Long, val at: Long?, val min0: Int?, val realtime: Boolean)
data class WStop27(val id: String, val name: String, val deps: List<WDep27>)
data class WRuter27(val stops: List<WStop27>, val deviations: List<String>, val fetched: Long)

/** Minutter til avgang nå: fra avgangstiden når den finnes, ellers fra minuttene ved hentingen. */
fun WDep27.minutesNow(now: Long = System.currentTimeMillis(), fetched: Long): Int? =
    at?.let { Math.floorDiv(it - now, 60_000L).toInt() } ?: min0?.let { it - ((now - fetched) / 60_000L).toInt() }

object Ruter27Store {
    private const val FILE = "ruter27_widgets"
    val data = MutableStateFlow<WRuter27?>(null)
    /** Valgt stopp per widget (appWidgetId → indeks i stopplisten). */
    val sel = MutableStateFlow<Map<Int, Int>>(emptyMap())
    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun current(ctx: Context): WRuter27? = data.value ?: sp(ctx).getString("json", null)?.let { runCatching { fromJson(JSONObject(it)) }.getOrNull() }.also { data.value = it }

    fun selFor(ctx: Context, id: Int): Int = sel.value[id] ?: sp(ctx).getInt("sel_$id", 0)
    fun setSel(ctx: Context, id: Int, i: Int) {
        sp(ctx).edit().putInt("sel_$id", i).apply()
        sel.value = sel.value + (id to i)
    }

    fun save(ctx: Context, r: WRuter27, acct: String?) {
        sp(ctx).edit().putString("json", toJson(r).toString()).apply { if (acct != null) putString("acct", acct) }.apply()
        data.value = r
    }

    /** Brukerskille: ny konto eller utlogging tømmer avgangene i widgetene. */
    fun useAccount(ctx: Context, acct: String?) {
        val p = sp(ctx)
        if (acct != null && p.getString("acct", null) == acct) return
        p.edit().remove("json").apply { if (acct != null) putString("acct", acct) else remove("acct") }.apply()
        data.value = null
    }

    private fun toJson(r: WRuter27) = JSONObject().put("fetched", r.fetched).put("deviations", JSONArray(r.deviations)).put("stops", JSONArray().apply {
        r.stops.forEach { s ->
            put(JSONObject().put("id", s.id).put("name", s.name).put("deps", JSONArray().apply {
                s.deps.forEach { d ->
                    put(JSONObject().put("line", d.line).put("to", d.to).put("color", d.color).put("textColor", d.textColor).put("realtime", d.realtime)
                        .put("at", d.at ?: JSONObject.NULL).put("min0", d.min0 ?: JSONObject.NULL))
                }
            }))
        }
    })

    private fun fromJson(o: JSONObject): WRuter27 {
        val a = o.optJSONArray("stops") ?: JSONArray()
        return WRuter27((0 until a.length()).mapNotNull { i ->
            val s = a.optJSONObject(i) ?: return@mapNotNull null
            val da = s.optJSONArray("deps") ?: JSONArray()
            WStop27(s.optString("id"), s.optString("name"), (0 until da.length()).mapNotNull { j ->
                val d = da.optJSONObject(j) ?: return@mapNotNull null
                WDep27(d.optString("line"), d.optString("to"), d.optLong("color"), d.optLong("textColor", 0xFFFFFFFF), if (d.isNull("at")) null else d.optLong("at"),
                    if (d.isNull("min0")) null else d.optInt("min0"), d.optBoolean("realtime"))
            })
        }, o.optJSONArray("deviations")?.let { d -> (0 until d.length()).map { d.optString(it) } } ?: emptyList(), o.optLong("fetched"))
    }
}

private fun hex27(s: String?): Long? = s?.trim()?.removePrefix("#")?.let { h -> if (h.length == 6) h.toLongOrNull(16)?.let { 0xFF000000 or it } else null }

/** Avgangstid: ISO med sone, ellers «HH:MM» i dag (eller i morgen hvis det er mer enn en time siden). */
private fun epoch27(t: String?): Long? {
    if (t.isNullOrBlank()) return null
    runCatching { return OffsetDateTime.parse(t).toInstant().toEpochMilli() }
    runCatching { return LocalDateTime.parse(t.take(19)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }
    val hm = Regex("""^(\d{1,2}):(\d{2})""").find(t.trim()) ?: return null
    val lt = runCatching { LocalTime.of(hm.groupValues[1].toInt(), hm.groupValues[2].toInt()) }.getOrNull() ?: return null
    var dt = LocalDate.now().atTime(lt)
    if (dt.isBefore(LocalDateTime.now().minusHours(1))) dt = dt.plusDays(1)
    return dt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
}

/** Kompakt widgetdata fra /api/widgets/departures. */
private fun parseWidget27(raw: String, now: Long): WRuter27? = runCatching {
    val o = JSONObject(raw)
    val a = o.optJSONArray("stops") ?: return@runCatching null
    val stops = (0 until a.length()).mapNotNull { i ->
        val s = a.optJSONObject(i) ?: return@mapNotNull null
        val da = s.optJSONArray("departures") ?: JSONArray()
        WStop27(s.optString("id"), s.optString("name").ifBlank { "Holdeplass" }, (0 until da.length()).mapNotNull { j ->
            val d = da.optJSONObject(j) ?: return@mapNotNull null
            if (d.optBoolean("cancelled")) return@mapNotNull null
            val line = d.optString("line").ifBlank { "?" }
            WDep27(line, d.optString("dest").ifBlank { d.optString("to") }, hex27(d.optString("color")) ?: ruterModeColor(d.optString("mode").ifBlank { null }, line),
                hex27(d.optString("textColor")) ?: 0xFFFFFFFF, epoch27(d.optString("expected").ifBlank { d.optString("time") }),
                if (d.has("minutes") && !d.isNull("minutes")) d.optInt("minutes") else null, d.optBoolean("realtime"))
        })
    }
    val dev = o.optJSONArray("deviations")?.let { d -> (0 until d.length()).mapNotNull { k -> d.optJSONObject(k)?.optString("text")?.takeIf { it.isNotBlank() } ?: d.optString(k).takeIf { it.isNotBlank() && !it.startsWith("{") } } } ?: emptyList()
    if (stops.isEmpty()) null else WRuter27(stops, dev, now)
}.getOrNull()

/** Henter widgetdataene. Reserve på eldre server: Hjem-stoppene (eller første av Mine stopp) via /ruter/departures. */
internal suspend fun fetchRuter27(ctx: Context, api: Api, acct: String?) {
    val now = System.currentTimeMillis()
    val r = runCatching { parseWidget27(api.hlGet("/widgets/departures", timeout = 12_000), now) }.getOrNull() ?: run {
        val mine = runCatching { parseStopList(api.hlGet("/me/stops", timeout = 8_000)) }.getOrDefault(emptyList())
        if (mine.isEmpty()) return
        val hd = runCatching { JSONObject(api.hlGet("/me/home-departures", timeout = 8_000)) }.getOrNull()
            ?.let { (it.optJSONObject("home_departures") ?: it).optJSONArray("stops") }
        val ids = hd?.let { a -> (0 until a.length()).map { a.optString(it) } }?.filter { id -> mine.any { it.id == id } }.orEmpty()
        val shown = mine.filter { it.id in ids }.ifEmpty { mine.take(1) }.take(3)
        val stops = shown.mapNotNull { st ->
            runCatching {
                val sd = parseStopDeps(api.hlGet("/ruter/departures?stop=" + URLEncoder.encode(st.id, "UTF-8") + "&n=6", timeout = 12_000))
                WStop27(st.id, st.name.ifBlank { sd.stop.name }, sd.departures.filter { !it.cancelled }.map { d ->
                    WDep27(d.line, d.to, d.color ?: ruterModeColor(d.mode, d.line), d.textColor ?: 0xFFFFFFFF, epoch27(d.expected ?: d.aimed), d.minutes, d.realtime)
                })
            }.getOrNull()
        }
        if (stops.isEmpty()) return
        WRuter27(stops, emptyList(), now)
    }
    Ruter27Store.save(ctx, r, acct)
}

/** Hvert 5. minutt: henter (med nett) og tegner på nytt, og planlegger neste. Stopper når ingen Ruter-widget er lagt til. */
class Ruter27Worker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!Ruter27Widgets.anyPlaced(ctx)) return Result.success()
        val acct = runCatching { FamilyPrefs.account(ctx) }.getOrNull()?.takeIf { it.isNotBlank() }
        Ruter27Store.useAccount(ctx, acct)
        FamilyPrefs.api(ctx)?.let { api -> runCatching { fetchRuter27(ctx, api, acct) } }
        Ruter27Widgets.redraw(ctx)
        Ruter27Widgets.schedule(ctx, 5)
        return Result.success()
    }
}

object Ruter27Widgets {
    private const val WORK = "finanshub-ruter27"

    val ALL: List<GlanceAppWidget> get() = listOf(RuterWidget27S(), RuterWidget27M(), RuterWidget27Strip(), S27RuterSmall(), S27RuterWide(), S27RuterStack())

    suspend fun redraw(ctx: Context) { ALL.forEach { w -> runCatching { w.updateAll(ctx) } } }

    suspend fun anyPlaced(ctx: Context): Boolean = runCatching {
        val m = GlanceAppWidgetManager(ctx)
        ALL.any { m.getGlanceIds(it.javaClass).isNotEmpty() }
    }.getOrDefault(true)

    /** Neste henting om [minutes] minutter (0 = nå). Bare med nett. */
    fun schedule(ctx: Context, minutes: Long = 5) {
        runCatching {
            val req = OneTimeWorkRequestBuilder<Ruter27Worker>().setInitialDelay(minutes, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            WorkManager.getInstance(ctx).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, req)
        }
    }

    /** Fra appen (Velg stopp endret) og ↻: hent med en gang. */
    fun refreshNow(ctx: Context) = schedule(ctx.applicationContext, 0)

    /** Ved oppstart: planlegg bare hvis det ikke allerede står en jobb i kø (beholder kjeden). */
    fun ensure(ctx: Context) {
        runCatching {
            val req = OneTimeWorkRequestBuilder<Ruter27Worker>().setInitialDelay(1, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            WorkManager.getInstance(ctx).enqueueUniqueWork(WORK, ExistingWorkPolicy.KEEP, req)
        }
    }
}

/* ---------------- Widgetene ---------------- */

/** kind: m_s · m_m · m_strip (Material You) eller s_s · s_w · s_stack (Samsung, låst størrelse). */
abstract class RuterW27(private val kind: String) : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val d0 = Ruter27Store.current(context)
        val appId = runCatching { GlanceAppWidgetManager(context).getAppWidgetId(id) }.getOrDefault(0)
        val sel0 = Ruter27Store.selFor(context, appId)
        val pap0 = S24.papir(context, appId)
        provideContent {
            val d by Ruter27Store.data.collectAsState()
            val sel by Ruter27Store.sel.collectAsState()
            val pap by S24.papirFlow.collectAsState()
            GlanceTheme { Body27(kind, d ?: d0, sel[appId] ?: sel0, pap[appId] ?: pap0) }
        }
    }
}

class RuterWidget27S : RuterW27("m_s")
class RuterWidget27M : RuterW27("m_m")
class RuterWidget27Strip : RuterW27("m_strip")
class S27RuterSmall : RuterW27("s_s")
class S27RuterWide : RuterW27("s_w")
class S27RuterStack : RuterW27("s_stack")

/** Mottakerne: planlegger 5-minutters-hentingen når den første widgeten legges til. */
abstract class Receiver27 : Receiver24() {
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        Ruter27Widgets.refreshNow(context)
    }
}

class RuterReceiver27S : Receiver27() { override val glanceAppWidget: GlanceAppWidget = RuterWidget27S() }
class RuterReceiver27M : Receiver27() { override val glanceAppWidget: GlanceAppWidget = RuterWidget27M() }
class RuterReceiver27Strip : Receiver27() { override val glanceAppWidget: GlanceAppWidget = RuterWidget27Strip() }
class S27RuterSmallReceiver : Receiver27() { override val glanceAppWidget: GlanceAppWidget = S27RuterSmall() }
class S27RuterWideReceiver : Receiver27() { override val glanceAppWidget: GlanceAppWidget = S27RuterWide() }
class S27RuterStackReceiver : Receiver27() { override val glanceAppWidget: GlanceAppWidget = S27RuterStack() }

/** ↻: henter med en gang og tegner på nytt. */
class Ruter27Refresh : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val acct = runCatching { FamilyPrefs.account(context) }.getOrNull()?.takeIf { it.isNotBlank() }
        FamilyPrefs.api(context)?.let { api -> runCatching { fetchRuter27(context, api, acct) } }
        Ruter27Widgets.redraw(context)
        Ruter27Widgets.schedule(context, 5)
    }
}

/** Trykk på stoppnavnet: neste stopp i denne widgeten. */
class Ruter27NextStop : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = runCatching { GlanceAppWidgetManager(context).getAppWidgetId(glanceId) }.getOrNull() ?: return
        val n = Ruter27Store.current(context)?.stops?.size ?: 0
        if (n < 2) return
        Ruter27Store.setSel(context, id, (Ruter27Store.selFor(context, id) + 1) % n)
        Ruter27Widgets.redraw(context)
    }
}

/* ---------------- Felles ---------------- */

private fun openRuter27(ctx: Context): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://avganger"), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

private fun cp27(c: Long) = ColorProvider(Color(c))
private fun cp27(c: Color) = ColorProvider(c)

@Composable
private fun T27(text: String, size: TextUnit, color: ColorProvider, weight: FontWeight = FontWeight.Normal, maxLines: Int = 1, modifier: GlanceModifier = GlanceModifier) =
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight), maxLines = maxLines)

/** Linjemerket: linjefarge, hvit tekst, 36 × 28 (Material) eller 34 × 26 (Samsung). */
@Composable
private fun Badge27(d: WDep27, w: Dp = 36.dp, h: Dp = 28.dp, r: Dp = 10.dp) {
    Box(GlanceModifier.width(w).height(h).cornerRadius(r).background(cp27(d.color)), contentAlignment = Alignment.Center) {
        T27(d.line, 12.5.sp, cp27(d.textColor), FontWeight.Bold)
    }
}

private fun minText27(m: Int?, unit: Boolean): String = when {
    m == null -> "–"
    m <= 0 -> "nå"
    m >= 60 -> "${m / 60} t ${m % 60}"
    unit -> "$m min"
    else -> "$m"
}

/** Avgangene som ikke har gått ennå, for stoppet widgeten viser. */
private fun upcoming27(s: WStop27?, fetched: Long): List<Pair<WDep27, Int?>> {
    val now = System.currentTimeMillis()
    return (s?.deps ?: emptyList()).map { it to it.minutesNow(now, fetched) }.filter { (_, m) -> m == null || m >= 0 }
}

@Composable
private fun Empty27(text: String, color: ColorProvider) = T27(text, 12.5.sp, color, maxLines = 3)

@Composable
private fun Body27(kind: String, d: WRuter27?, sel: Int, papir: Boolean) {
    val stops = d?.stops ?: emptyList()
    val i = if (stops.isEmpty()) 0 else ((sel % stops.size) + stops.size) % stops.size
    val st = stops.getOrNull(i)
    val deps = upcoming27(st, d?.fetched ?: 0L)
    when (kind) {
        "m_s" -> MSmall27(st, deps)
        "m_m" -> MMedium27(st, deps, stops.size > 1)
        "m_strip" -> MStrip27(st, deps)
        "s_s" -> SSmall27(st, deps, papir)
        "s_w" -> SWide27(st, deps, papir, stops.size > 1)
        else -> SStack27(st, deps, i, stops.size, papir)
    }
}

/* ---------------- Material You ---------------- */

@Composable
private fun MRow27(dep: WDep27, m: Int?, fg: ColorProvider, unit: Boolean) {
    Row(GlanceModifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Badge27(dep)
        Spacer(GlanceModifier.width(10.dp))
        T27(dep.to, 14.5.sp, fg, modifier = GlanceModifier.defaultWeight())
        T27(minText27(m, unit), 17.sp, fg, FontWeight.Bold)
    }
}

/** 2 × 2: stoppnavn øverst, to avganger nederst (minutter uten «min»). */
@Composable
private fun MSmall27(st: WStop27?, deps: List<Pair<WDep27, Int?>>) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.secondaryContainer).padding(18.dp).clickable(openRuter27(ctx))) {
        T27(st?.name ?: "Avganger", 13.sp, c.onSecondaryContainer, FontWeight.Medium)
        Spacer(GlanceModifier.defaultWeight())
        if (deps.isEmpty()) Empty27(if (st == null) "Velg stopp på Hjem i appen." else "Ingen avganger nå.", c.onSecondaryContainer)
        val rows = if (LocalSize.current.height < 150.dp) 1 else 2
        deps.take(rows).forEach { (dep, m) -> MRow27(dep, m, c.onSecondaryContainer, unit = false) }
    }
}

/** 4 × 2: stoppnavn og ↻, tre avganger med «3 min». */
@Composable
private fun MMedium27(st: WStop27?, deps: List<Pair<WDep27, Int?>>, many: Boolean) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.widgetBackground).padding(horizontal = 18.dp, vertical = 14.dp).clickable(openRuter27(ctx))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T27((st?.name ?: "Avganger") + if (many) " ▾" else "", 15.sp, c.onSurface, FontWeight.Bold,
                modifier = GlanceModifier.defaultWeight().then(if (many) GlanceModifier.clickable(actionRunCallback<Ruter27NextStop>()) else GlanceModifier))
            Box(GlanceModifier.size(36.dp).cornerRadius(18.dp).background(c.secondaryContainer).clickable(actionRunCallback<Ruter27Refresh>()), contentAlignment = Alignment.Center) {
                T27("↻", 16.sp, c.onSecondaryContainer, FontWeight.Bold)
            }
        }
        if (deps.isEmpty()) { Spacer(GlanceModifier.height(8.dp)); Empty27(if (st == null) "Velg stopp på Hjem i appen." else "Ingen avganger nå.", c.onSurfaceVariant) }
        val rows = ((LocalSize.current.height - 60.dp) / 40.dp).toInt().coerceIn(1, 5)
        deps.take(rows).forEach { (dep, m) -> MRow27(dep, m, c.onSurface, unit = true) }
    }
}

/** 4 × 1: «Neste fra Amagerveien», to avganger på én linje og «Åpne». */
@Composable
private fun MStrip27(st: WStop27?, deps: List<Pair<WDep27, Int?>>) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    val wide = LocalSize.current.width >= 300.dp
    Row(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.widgetBackground).padding(horizontal = 20.dp).clickable(openRuter27(ctx)),
        verticalAlignment = Alignment.CenterVertically) {
        if (wide) { T27("Neste fra ${st?.name ?: "…"}", 13.sp, c.onSurfaceVariant); Spacer(GlanceModifier.width(14.dp)) }
        if (deps.isEmpty()) T27(if (st == null) "Velg stopp på Hjem" else "Ingen avganger nå", 14.sp, c.onSurface, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
        deps.take(if (wide) 2 else 1).forEachIndexed { k, (dep, m) ->
            if (k > 0) { Spacer(GlanceModifier.width(8.dp)); T27("·", 16.sp, c.onSurfaceVariant); Spacer(GlanceModifier.width(8.dp)) }
            Badge27(dep, 38.dp, 30.dp)
            Spacer(GlanceModifier.width(8.dp))
            T27("${dep.to} ${minText27(m, true)}", 16.sp, c.onSurface, FontWeight.Bold)
        }
        Spacer(GlanceModifier.defaultWeight())
        T27("Åpne", 13.sp, c.primary, FontWeight.Bold)
    }
}

/* ---------------- Samsung One UI ---------------- */

private class SPal27(val bg: ColorProvider, val fg: ColorProvider, val sub: ColorProvider, val acc: ColorProvider)

@Composable
private fun spal27(papir: Boolean, accent: Boolean): SPal27 {
    return when {
        papir && accent -> SPal27(cp27(0xFFB23A2A), cp27(Color.White), cp27(Color.White.copy(alpha = .8f)), cp27(Color.White))
        papir -> SPal27(cp27(Color.White), cp27(0xFF1B1A17), cp27(0xFF7A7468), cp27(0xFFB23A2A))
        accent -> SPal27(cp27(0xFF3E91FF), cp27(Color.White), cp27(Color.White.copy(alpha = .8f)), cp27(Color.White))
        // One UI: mørk glassflate rgba(18,18,20,.75) med hvit tekst og blå aksent (#3E91FF).
        else -> SPal27(cp27(Color(0xBF121214)), cp27(Color.White), cp27(Color.White.copy(alpha = .7f)), cp27(0xFF3E91FF))
    }
}

/** Det synlige kortet: 134 × 155 dp eller 296 × 155 dp, sentrert i cellen (som Samsungs egne widgets), radius 20. */
@Composable
private fun SCard27(bg: ColorProvider, wide: Boolean, content: @Composable ColumnScope.() -> Unit) {
    val ctx = LocalContext.current
    val size = LocalSize.current
    val w = if (wide) 296.dp else 134.dp
    val h = 155.dp
    val padH = ((size.width - w) / 2).coerceAtLeast(0.dp)
    val padV = ((size.height - h) / 2).coerceAtLeast(0.dp)
    Box(GlanceModifier.fillMaxSize().padding(horizontal = padH, vertical = padV)) {
        Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(20.dp).background(bg).padding(14.dp).clickable(openRuter27(ctx)), content = content)
    }
}

/** Liten: stoppnavn, linjemerke + mål, og minuttene stort. */
@Composable
private fun SSmall27(st: WStop27?, deps: List<Pair<WDep27, Int?>>, papir: Boolean) {
    val u = spal27(papir, accent = false)
    SCard27(u.bg, wide = false) {
        T27(st?.name ?: "Avganger", 13.sp, u.sub)
        Spacer(GlanceModifier.defaultWeight())
        val first = deps.firstOrNull()
        if (first == null) Empty27(if (st == null) "Velg stopp på Hjem" else "Ingen avganger nå", u.fg)
        else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Badge27(first.first, 34.dp, 26.dp, 8.dp)
                Spacer(GlanceModifier.width(8.dp))
                T27(first.first.to, 13.sp, u.fg)
            }
            Row(verticalAlignment = Alignment.Bottom) {
                val m = first.second
                T27(if (m == null) "–" else if (m <= 0) "nå" else "$m", 34.sp, u.fg, FontWeight.Medium)
                if (m != null && m > 0) T27(" min", 15.sp, u.sub)
            }
        }
    }
}

/** Bred: «Avganger» og «Stopp ▾», fire avganger. */
@Composable
private fun SWide27(st: WStop27?, deps: List<Pair<WDep27, Int?>>, papir: Boolean, many: Boolean) {
    val u = spal27(papir, accent = false)
    SCard27(u.bg, wide = true) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T27("Avganger", 15.sp, u.fg, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
            T27((st?.name ?: "") + if (many) " ▾" else "", 12.sp, u.acc, FontWeight.Medium,
                modifier = if (many) GlanceModifier.clickable(actionRunCallback<Ruter27NextStop>()) else GlanceModifier)
        }
        if (deps.isEmpty()) { Spacer(GlanceModifier.height(8.dp)); Empty27(if (st == null) "Velg stopp på Hjem i appen." else "Ingen avganger nå.", u.sub) }
        deps.take(4).forEach { (dep, m) ->
            Row(GlanceModifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                Badge27(dep, 34.dp, 24.dp, 8.dp)
                Spacer(GlanceModifier.width(10.dp))
                T27(dep.to, 14.sp, u.fg, modifier = GlanceModifier.defaultWeight())
                T27(minText27(m, true), 15.sp, u.fg, FontWeight.Medium)
            }
        }
    }
}

/** Stabel: én avgang per stopp («Stabel · 2 av 3»), trykk på teksten øverst går til neste stopp, prikkene viser hvor. */
@Composable
private fun SStack27(st: WStop27?, deps: List<Pair<WDep27, Int?>>, i: Int, n: Int, papir: Boolean) {
    val u = spal27(papir, accent = true)
    SCard27(u.bg, wide = false) {
        T27(if (n > 1) "Stabel · ${i + 1} av $n" else (st?.name ?: "Avganger"), 13.sp, u.fg, FontWeight.Medium,
            modifier = if (n > 1) GlanceModifier.clickable(actionRunCallback<Ruter27NextStop>()) else GlanceModifier)
        Spacer(GlanceModifier.defaultWeight())
        val first = deps.firstOrNull()
        if (first == null) Empty27(if (st == null) "Velg stopp på Hjem" else "Ingen avganger nå", u.fg)
        else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Badge27(first.first, 34.dp, 26.dp, 8.dp)
                Spacer(GlanceModifier.width(8.dp))
                T27(first.first.to, 13.sp, u.fg)
            }
            T27(minText27(first.second, true), 30.sp, u.fg, FontWeight.Medium)
        }
        if (n > 1) {
            Spacer(GlanceModifier.height(6.dp))
            Row {
                (0 until n).forEach { k ->
                    if (k > 0) Spacer(GlanceModifier.width(4.dp))
                    Box(GlanceModifier.size(6.dp).cornerRadius(3.dp).background(if (k == i) u.fg else u.sub)) {}
                }
            }
        }
    }
}
