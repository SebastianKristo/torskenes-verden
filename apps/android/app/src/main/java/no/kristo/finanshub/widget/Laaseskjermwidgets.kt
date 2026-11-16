package no.kristo.finanshub.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.RemoteViews
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.R
import no.kristo.finanshub.trialDays32b
import java.text.NumberFormat
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.Locale

/*
 * Prompt 40 (ANDROID40) – claude-code-widgets-android-samsung-preview-las.md, fasit Widgets Android Samsung.dc.html (1c/1d):
 *  - Flere låseskjerm-widgets: små 1 × 1 (runde: Vær 6°, Gjøremål 3, Pakker 1, Budsjett 77 % ring, Avgang 6m, Prøveperiode 3d) og
 *    brede 4 × 1 (Neste time, Avganger, Gjøremål, Pakker, Glimt brief, Dagens bibelvers). widgetCategory = home_screen|keyguard.
 *    Vanlige RemoteViews (ikke Glance), samme data som startskjermen (WidgetStore, TasksStore, Kal26/Ruter27/Trials32b/Brief34/Bible37).
 *    Android: mørk tonet flate; Samsung: frostet hvit glass `rgba(255,255,255,.18)`. Trykk ber om opplåsing og åpner riktig side.
 *  - Personvern: «Skjul beløp og navn på låseskjermen» (standard på) viser «•••» for Budsjett og Pakker når verten er låseskjermen.
 *  - Forhåndsvisning i velgeren: previewLayout (res/layout/prev40_*.xml og lock40_prev_*.xml, ekte layout med eksempeltekst) for
 *    Android 12–14, og genererte forhåndsvisninger (AppWidgetManager.setWidgetPreview, API 35) med siste data, maks hver 30. min.
 */

data class Snap40(val lab: String, val big: String, val unit: String, val sub: String, val rows: List<String> = emptyList(),
    /** Liten låseskjerm-verdi («6°», «3», «77%», «6m», «3d») og bred tittel/undertekst. */
    val sv: String = big, val wt: String = "$big $unit".trim(), val ws: String = sub, val route: String = "homelab", val sensitive: Boolean = false, val pct: Int? = null)

object Lock40 {
    private val nb = Locale("nb", "NO")
    private val OSLO: ZoneId = ZoneId.of("Europe/Oslo")
    private const val MASK = "•••"

    fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences("lock40", Context.MODE_PRIVATE)
    /** «Skjul beløp og navn på låseskjermen» (standard på). */
    fun hide(ctx: Context): Boolean = prefs(ctx).getBoolean("hide", true)
    fun setHide(ctx: Context, on: Boolean) { prefs(ctx).edit().putBoolean("hide", on).apply(); redraw(ctx) }

    private fun kr(v: Double): String = NumberFormat.getNumberInstance(nb).apply { maximumFractionDigits = 0 }.format(v).replace(' ', ' ')

    /** Siste data for en widgettype (samme som startskjermen). */
    fun snap(ctx: Context, kind: String): Snap40? {
        val d = runCatching { WidgetStore.current(ctx) }.getOrNull()
        val today = LocalDate.now(OSLO)
        return when (kind) {
            "vaer" -> d?.weather?.let { w ->
                val t = w.temp?.let { "${Math.round(it)}°" } ?: "–"
                Snap40(w.place.ifBlank { "Vær" }, t, "", listOfNotNull(w.desc.takeIf { it.isNotBlank() }, w.hi?.let { "H ${Math.round(it)}°" }, w.lo?.let { "L ${Math.round(it)}°" }).joinToString(" · "),
                    sv = t, wt = "${w.place.ifBlank { "Vær" }} $t", ws = w.desc, route = "weather")
            }
            "huske" -> runCatching { TasksStore.current(ctx) }.getOrNull()?.let { l ->
                val due = l.filter { it.due == null || it.due <= today.toString() }
                val over = l.count { it.due != null && it.due < today.toString() }
                Snap40("Gjøremål · i dag", "${due.size}", "igjen", if (over > 0) "$over er forfalt" else "Ingenting forfalt",
                    rows = l.take(3).map { (it.list?.replaceFirstChar { c -> c.uppercase() }?.let { n -> "$n  " } ?: "") + it.title },
                    sv = "${due.size}", wt = "${due.size} gjøremål i dag", ws = l.take(2).joinToString(" · ") { it.title }, route = "tasks")
            }
            "pakke" -> d?.packages?.let { p ->
                val ready = p.items.filter { it.ready }
                val first = ready.firstOrNull() ?: p.items.firstOrNull()
                Snap40("Sporing", "${if (ready.isNotEmpty()) ready.size else p.active}", if (ready.isNotEmpty()) "kan hentes" else "på vei",
                    first?.let { listOf(it.name, it.pickupPoint.ifBlank { it.statusText }).filter { s -> s.isNotBlank() }.joinToString(" · ") } ?: "Ingen aktive pakker",
                    sv = "${if (ready.isNotEmpty()) ready.size else p.active}", wt = if (ready.isNotEmpty()) "Pakke kan hentes" else "${p.active} pakker på vei",
                    ws = first?.let { listOf(it.name, it.pickupPoint).filter { s -> s.isNotBlank() }.joinToString(" · ") } ?: "", route = "tracking", sensitive = true)
            }
            "bud" -> d?.budget?.let { b ->
                val pct = Math.round(b.pct).toInt()
                Snap40(monthNb(b.month), kr(b.left), "kr igjen", "$pct % brukt av ${kr(b.limit)} kr", sv = "$pct%", wt = "${kr(b.left)} kr igjen", ws = "$pct % brukt",
                    route = "budget", sensitive = true, pct = pct)
            }
            "trial" -> runCatching { Trials32bStore.active(Trials32bStore.current(ctx)) }.getOrNull()?.firstOrNull()?.let { t ->
                val n = trialDays32b(t.end)
                Snap40("Utløper snart", "$n", if (n == 1) "dag" else "dager", listOf(t.name, t.price).filter { it.isNotBlank() }.joinToString(" · "),
                    sv = "${n}d", wt = "${t.name} · $n ${if (n == 1) "dag" else "dager"}", ws = t.price, route = "subs")
            }
            "ruter" -> runCatching { Ruter27Store.current(ctx) }.getOrNull()?.let { r ->
                val st = r.stops.firstOrNull() ?: return@let null
                val deps = st.deps.mapNotNull { dp -> dp.minutesNow(fetched = r.fetched)?.takeIf { it >= 0 }?.let { dp to it } }
                val f = deps.firstOrNull() ?: return@let null
                Snap40(st.name, "${f.second}", "min", "${f.first.line} ${f.first.to}" + deps.drop(1).take(2).joinToString("") { (_, m) -> " · så $m" },
                    sv = "${f.second}m", wt = "${f.first.line} ${f.first.to} · ${f.second} min", ws = st.name + deps.drop(1).take(2).joinToString("") { (_, m) -> " · så $m" }, route = "ruter")
            }
            "kal" -> runCatching { Kal26WidgetStore.current(ctx) }.getOrNull()?.let { l ->
                val now = LocalTime.now(OSLO)
                val next = l.filter { (it.date == today && (it.end ?: it.start ?: LocalTime.MAX) >= now) || it.date.isAfter(today) }.sortedWith(compareBy({ it.date }, { it.start ?: LocalTime.MIN })).take(3)
                val e = next.firstOrNull() ?: return@let null
                val t = e.start?.let { "%02d:%02d".format(it.hour, it.minute) } ?: "Hele dagen"
                Snap40("Kalender · " + if (e.date == today) "i dag" else e.date.dayOfMonth.toString() + "." + e.date.monthValue + ".", t, e.title, e.room ?: "",
                    rows = next.drop(1).map { x -> (x.start?.let { "%02d:%02d".format(it.hour, it.minute) } ?: "") + "  " + x.title },
                    wt = "${e.title} · $t", ws = listOfNotNull(e.room).joinToString(" · ").ifBlank { if (e.date == today) "I dag" else "" }, route = "kalender")
            }
            "brief" -> runCatching { Brief34Store.current(ctx) }.getOrNull()?.let { b ->
                Snap40("Glimt · ${b.title.lowercase(nb)}", "", "", b.summary, wt = "Glimt · ${b.title}", ws = b.summary, route = "brief")
            }
            "bibel" -> runCatching { if (Bible37Store.enabled(ctx)) Bible37Store.current(ctx) else null }.getOrNull()?.let { v ->
                Snap40(v.ref, "", "", "«${v.text}»", wt = v.ref, ws = "«${v.text}»", route = "bibel")
            }
            else -> null
        }
    }

    private fun monthNb(m: String): String = runCatching {
        val d = LocalDate.parse(if (m.length == 7) "$m-01" else m.take(10))
        d.month.getDisplayName(java.time.format.TextStyle.FULL, nb).replaceFirstChar { it.uppercase() }
    }.getOrDefault("Budsjett")

    private fun open(ctx: Context, route: String, code: Int): PendingIntent = PendingIntent.getActivity(ctx, code,
        Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://$route"), ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private val samsung: Boolean get() = Build.MANUFACTURER.equals("samsung", ignoreCase = true)

    fun icon(kind: String): Int = when (kind) {
        "vaer" -> R.drawable.ic_lock40_vaer; "kal" -> R.drawable.ic_lock40_kal; "huske" -> R.drawable.ic_lock40_huske; "ruter" -> R.drawable.ic_lock40_ruter
        "pakke" -> R.drawable.ic_lock40_pakke; "bud" -> R.drawable.ic_lock40_bud; "trial" -> R.drawable.ic_lock40_trial; "brief" -> R.drawable.ic_lock40_brief
        else -> R.drawable.ic_lock40_bibel
    }

    private fun emptyText(kind: String): Pair<String, String> = when (kind) {
        "vaer" -> "Vær" to "Åpne appen for været"; "huske" -> "Gjøremål" to "Ingen gjøremål"; "pakke" -> "Pakker" to "Ingen pakker på vei"
        "bud" -> "Budsjett" to "Ikke satt opp"; "trial" -> "Prøveperioder" to "Ingen prøver"; "ruter" -> "Avganger" to "Velg stopp i appen"
        "kal" -> "Neste time" to "Ingenting i kalenderen"; "brief" -> "Glimt brief" to "Kommer i morgen tidlig"; else -> "Dagens bibelvers" to "Ikke slått på"
    }

    /** Budsjettringen (hvit, monokrom) som bilde. */
    private fun ring(pct: Int, px: Int = 120): Bitmap {
        val b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        val w = px * .09f
        val r = RectF(w, w, px - w, px - w)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = w; strokeCap = Paint.Cap.ROUND }
        p.color = 0x40FFFFFF; c.drawArc(r, 0f, 360f, false, p)
        p.color = 0xFFFFFFFF.toInt(); c.drawArc(r, -90f, 360f * pct.coerceIn(0, 100) / 100f, false, p)
        return b
    }

    /** RemoteViews for låseskjerm-widgeten (eller forhåndsvisningen). keyguard = verten er låseskjermen. */
    fun views(ctx: Context, kind: String, wide: Boolean, keyguard: Boolean, code: Int): RemoteViews {
        val s = snap(ctx, kind)
        val mask = keyguard && hide(ctx) && s?.sensitive == true
        val (et, es) = emptyText(kind)
        return if (!wide) RemoteViews(ctx.packageName, R.layout.lock40_small).apply {
            setInt(R.id.lock40_root, "setBackgroundResource", if (samsung) R.drawable.lock40_bg_round_s else R.drawable.lock40_bg_round)
            setImageViewResource(R.id.lock40_icon, icon(kind))
            setTextViewText(R.id.lock40_big, if (mask) "•••" else s?.sv ?: "–")
            val pct = s?.pct
            if (kind == "bud" && pct != null && !mask) setImageViewBitmap(R.id.lock40_ring, ring(pct)) else setImageViewResource(R.id.lock40_ring, 0)
            setContentDescription(R.id.lock40_root, "$et ${if (mask) "" else s?.sv ?: ""}")
            setOnClickPendingIntent(R.id.lock40_root, open(ctx, s?.route ?: "homelab", code))
        } else RemoteViews(ctx.packageName, R.layout.lock40_wide).apply {
            setInt(R.id.lock40_root, "setBackgroundResource", if (samsung) R.drawable.lock40_bg_wide_s else R.drawable.lock40_bg_wide)
            setImageViewResource(R.id.lock40_icon, icon(kind))
            setTextViewText(R.id.lock40_title, if (s == null) et else if (mask) "$et · •••" else s.wt)
            setTextViewText(R.id.lock40_sub, if (s == null) es else if (mask) "Lås opp for å se" else s.ws)
            setOnClickPendingIntent(R.id.lock40_root, open(ctx, s?.route ?: "homelab", code))
        }
    }

    /** Alle låseskjerm-providerne: klassenavn → (type, bred). */
    val PROVIDERS: List<Triple<String, String, Boolean>> = listOf(
        Triple("LockSmallVaer40", "vaer", false), Triple("LockSmallHuske40", "huske", false), Triple("LockSmallPakke40", "pakke", false),
        Triple("LockSmallBud40", "bud", false), Triple("LockSmallRuter40", "ruter", false), Triple("LockSmallTrial40", "trial", false),
        Triple("LockWideKal40", "kal", true), Triple("LockWideRuter40", "ruter", true), Triple("LockWideHuske40", "huske", true),
        Triple("LockWidePakke40", "pakke", true), Triple("LockWideBrief40", "brief", true), Triple("LockWideBibel40", "bibel", true),
    )

    fun isKeyguard(m: AppWidgetManager, id: Int): Boolean = runCatching {
        m.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_HOST_CATEGORY, -1) == AppWidgetProviderInfoCompat.CATEGORY_KEYGUARD
    }.getOrDefault(false)

    fun update(ctx: Context, m: AppWidgetManager, ids: IntArray, kind: String, wide: Boolean) {
        ids.forEach { id -> runCatching { m.updateAppWidget(id, views(ctx, kind, wide, isKeyguard(m, id), 7600 + id % 300)) } }
    }

    /** Tegner alle låseskjerm-widgetene på nytt (etter WidgetWorker, eller når personvernvalget endres). */
    fun redraw(ctx: Context) {
        val m = AppWidgetManager.getInstance(ctx) ?: return
        PROVIDERS.forEach { (cls, kind, wide) ->
            val ids = runCatching { m.getAppWidgetIds(ComponentName(ctx, "no.kristo.finanshub.widget.$cls")) }.getOrNull() ?: return@forEach
            if (ids.isNotEmpty()) update(ctx, m, ids, kind, wide)
        }
    }

    /** Bibelvers-widgeten finnes bare for brukere med modulen. */
    fun syncBible(ctx: Context) {
        val on = runCatching { Bible37Store.enabled(ctx) }.getOrDefault(false)
        runCatching {
            ctx.packageManager.setComponentEnabledSetting(ComponentName(ctx.packageName, "no.kristo.finanshub.widget.LockWideBibel40"),
                if (on) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
        }
    }
}

/** Konstantene fra AppWidgetProviderInfo (samme verdier som plattformen). */
internal object AppWidgetProviderInfoCompat {
    const val CATEGORY_HOME = 1
    const val CATEGORY_KEYGUARD = 2
}

abstract class Lock40Provider(private val kind: String, private val wide: Boolean) : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        Lock40.update(context, appWidgetManager, appWidgetIds, kind, wide)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        Lock40.update(context, appWidgetManager, intArrayOf(appWidgetId), kind, wide)
    }

    override fun onEnabled(context: Context) {
        WidgetSync.schedule(context)
        WidgetSync.refresh(context)
    }
}

class LockSmallVaer40 : Lock40Provider("vaer", false)
class LockSmallHuske40 : Lock40Provider("huske", false)
class LockSmallPakke40 : Lock40Provider("pakke", false)
class LockSmallBud40 : Lock40Provider("bud", false)
class LockSmallRuter40 : Lock40Provider("ruter", false)
class LockSmallTrial40 : Lock40Provider("trial", false)
class LockWideKal40 : Lock40Provider("kal", true)
class LockWideRuter40 : Lock40Provider("ruter", true)
class LockWideHuske40 : Lock40Provider("huske", true)
class LockWidePakke40 : Lock40Provider("pakke", true)
class LockWideBrief40 : Lock40Provider("brief", true)
class LockWideBibel40 : Lock40Provider("bibel", true)

/* ======================= Genererte forhåndsvisninger (Android 15+) ======================= */

/**
 * AppWidgetManager.setWidgetPreview(provider, kategori, RemoteViews) med siste data, i samme layout som previewLayout
 * (prev40_* / lock40_*). Plattformen begrenser kallene; vi publiserer høyst hver 30. min per widget og bare når innholdet er endret.
 * Refleksjon fordi typesjekken kjører mot et eldre android.jar (compileSdk 35 har metoden).
 */
object Preview40 {
    /** provider-klasse → (layout-type, widgettype). «m»/«s» = Material/Samsung-kort, «ls»/«lw» = låseskjerm liten/bred. */
    private val HOME: List<Triple<String, String, String>> = listOf(
        Triple("WeatherReceiver", "m2", "vaer"), Triple("OneUiWeatherReceiver", "s2", "vaer"),
        Triple("KalReceiver26S", "m2", "kal"), Triple("KalReceiver26M", "m4", "kal"), Triple("S24KalReceiver26S", "s2", "kal"), Triple("S24KalReceiver26M", "s4", "kal"),
        Triple("TasksReceiver", "m2", "huske"), Triple("S24TasksReceiver", "s2", "huske"), Triple("S24TasksWideReceiver", "s4", "huske"),
        Triple("RuterReceiver27S", "m2", "ruter"), Triple("RuterReceiver27M", "m4", "ruter"), Triple("S24DeparturesReceiver", "s2", "ruter"),
        Triple("S24DeparturesWideReceiver", "s4", "ruter"), Triple("S27RuterSmallReceiver", "s2", "ruter"), Triple("S27RuterWideReceiver", "s4", "ruter"),
        Triple("PackagesReceiver", "m4", "pakke"), Triple("OneUiPackagesReceiver", "s2", "pakke"), Triple("S24PackagesReceiver", "s2", "pakke"),
        Triple("BudgetReceiver", "m2", "bud"), Triple("OneUiBudgetReceiver", "s4", "bud"),
    )

    private fun layout(t: String): Int = when (t) {
        "m4" -> R.layout.prev40_live_m4; "s2" -> R.layout.prev40_live_s2; "s4" -> R.layout.prev40_live_s4; else -> R.layout.prev40_live_m2
    }

    private fun views(ctx: Context, t: String, kind: String): RemoteViews? {
        val s = Lock40.snap(ctx, kind) ?: return null
        return RemoteViews(ctx.packageName, layout(t)).apply {
            setTextViewText(R.id.prev40_lab, s.lab)
            setTextViewText(R.id.prev40_big, s.big)
            setTextViewText(R.id.prev40_unit, s.unit)
            setTextViewText(R.id.prev40_sub, s.sub)
            setTextViewText(R.id.prev40_rows, s.rows.joinToString("\n"))
            setImageViewResource(R.id.prev40_icon, Lock40.icon(kind))
        }
    }

    /** Kalles etter hver henting (WidgetWorker) og når appen åpnes. */
    fun publish(ctx: Context) {
        if (Build.VERSION.SDK_INT < 35) return
        val m = AppWidgetManager.getInstance(ctx) ?: return
        val set = runCatching { AppWidgetManager::class.java.getMethod("setWidgetPreview", ComponentName::class.java, Int::class.javaPrimitiveType, RemoteViews::class.java) }.getOrNull() ?: return
        val sp = ctx.getSharedPreferences("preview40", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val e = sp.edit()
        fun push(cls: String, cat: Int, key: String, rv: RemoteViews?) {
            rv ?: return
            val k = "$cls|$cat"
            if (sp.getString("h_$k", null) == key || now - sp.getLong("at_$k", 0L) < 30 * 60_000L) return
            val ok = runCatching { set.invoke(m, ComponentName(ctx, "no.kristo.finanshub.widget.$cls"), cat, rv) as? Boolean ?: true }.getOrDefault(false)
            if (ok) e.putLong("at_$k", now).putString("h_$k", key)
        }
        HOME.forEach { (cls, t, kind) -> Lock40.snap(ctx, kind)?.let { s -> push(cls, AppWidgetProviderInfoCompat.CATEGORY_HOME, s.toString(), views(ctx, t, kind)) } }
        Lock40.PROVIDERS.forEach { (cls, kind, wide) ->
            val s = Lock40.snap(ctx, kind) ?: return@forEach
            // Forhåndsvisningen viser aldri skjulte beløp; den er for velgeren (ulåst telefon).
            push(cls, AppWidgetProviderInfoCompat.CATEGORY_KEYGUARD or AppWidgetProviderInfoCompat.CATEGORY_HOME, s.toString(), Lock40.views(ctx, kind, wide, false, 7590))
        }
        e.apply()
    }
}
