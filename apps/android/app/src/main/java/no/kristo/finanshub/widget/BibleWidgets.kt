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
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
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
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlinx.coroutines.flow.MutableStateFlow
import no.kristo.finanshub.Api
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.Notify31
import no.kristo.finanshub.OSLO37
import no.kristo.finanshub.Verse37
import no.kristo.finanshub.biblePeriod37
import no.kristo.finanshub.localVerse37
import no.kristo.finanshub.parseVerse37
import org.json.JSONObject
import java.time.LocalDate

/*
 * Prompt 37 (ANDROID37): bibelvers-widgets (claude-code-bibelvers.md, Bibelvers.dc.html → ANDROID · SAMSUNG).
 *  - Material You 4 × 2: dynamiske farger, ✝-brikke, «Dagens vers», verset (kursiv) og referansen, «Neste ›».
 *  - Rund 2 × 2: ✝, referansen og «Trykk for å lese».
 *  - Samsung (One UI) 4 × 2: hvit glass (88 %), «Bibelvers» + dato, vers, referanse og «Neste ›». Av på andre telefoner.
 *  - Trykk åpner verset i appen (finanshub://bibel). «Neste ›» viser morgendagens vers bare i widgeten.
 *  - Bare for brukere med modulen (standard sebastian): ellers slås mottakerne av (finnes ikke i widgetgalleriet).
 *  - Data: GET /api/bible/today (WidgetWorker hvert 15. minutt og når appen henter verset); lokale vers (1930) uten server.
 */
object Bible37Store {
    private const val FILE = "bible37_widgets"
    val data = MutableStateFlow<Verse37?>(null)
    /** «Neste ›»: forskyvning i widgeten (nullstilles hver dag). */
    val alt = MutableStateFlow<Verse37?>(null)
    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    private val RECEIVERS = listOf("no.kristo.finanshub.widget.Bible37Receiver", "no.kristo.finanshub.widget.Bible37RoundReceiver", "no.kristo.finanshub.widget.S37BibleReceiver")

    fun enabled(ctx: Context) = sp(ctx).getBoolean("on", false)

    fun current(ctx: Context): Verse37? = data.value ?: sp(ctx).getString("json", null)?.let { raw ->
        runCatching { parseVerse37(JSONObject(raw)) }.getOrNull()
    }?.also { data.value = it }

    fun save(ctx: Context, v: Verse37?, on: Boolean, acct: String?) {
        val app = ctx.applicationContext
        val p = sp(app)
        val was = p.getBoolean("on", false)
        p.edit().putBoolean("on", on).putString("acct", acct).apply {
            if (v != null) putString("json", JSONObject().put("ref", v.ref).put("text", v.text).put("period", v.period).put("date", v.date ?: JSONObject.NULL).toString()) else remove("json")
        }.apply()
        data.value = v
        if (was != on || !p.getBoolean("fixed", false)) { p.edit().putBoolean("fixed", true).apply(); setReceivers(app, on) }
        Thread { runCatching { kotlinx.coroutines.runBlocking { Bible37Widgets.redraw(app) } } }.start()
    }

    /** Mottakerne slås av for brukere uten modulen (og Samsung-varianten på andre telefoner). */
    private fun setReceivers(ctx: Context, on: Boolean) {
        val pm = ctx.packageManager
        val samsung = Build.MANUFACTURER.equals("samsung", ignoreCase = true)
        RECEIVERS.forEach { c ->
            val want = on && (samsung || !c.endsWith("S37BibleReceiver"))
            runCatching {
                pm.setComponentEnabledSetting(ComponentName(ctx.packageName, c),
                    if (want) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
            }
        }
    }

    fun useAccount(ctx: Context, acct: String?) {
        val p = sp(ctx)
        if (acct != null && p.getString("acct", null) == acct) return
        p.edit().remove("json").putBoolean("on", false).apply()
        data.value = null
    }

    /** Dagens vers, eller «Neste ›»-verset for i dag. */
    fun shown(ctx: Context): Verse37? {
        val p = sp(ctx)
        val today = LocalDate.now(OSLO37).toString()
        val off = if (p.getString("offDay", null) == today) p.getInt("off", 0) else 0
        if (off == 0) return current(ctx) ?: if (enabled(ctx)) localVerse37() else null
        return alt.value ?: localVerse37(biblePeriod37(), off)
    }

    internal fun bumpOffset(ctx: Context): Int {
        val p = sp(ctx)
        val today = LocalDate.now(OSLO37).toString()
        val off = (if (p.getString("offDay", null) == today) p.getInt("off", 0) else 0) + 1
        p.edit().putString("offDay", today).putInt("off", off).apply()
        return off
    }
}

/** Henter dagens vers til widgetene. 403/enabled:false = modulen er av for brukeren. 404 = eldre server (lokale vers for sebastian). */
internal suspend fun fetchBible37(ctx: Context, api: Api, acct: String?, username: String?) {
    try {
        val o = JSONObject(api.hlGet("/bible/today?period=" + biblePeriod37(), timeout = 8_000))
        val on = o.optBoolean("enabled", o.has("ref"))
        Bible37Store.save(ctx, if (on) parseVerse37(o) else null, on, acct)
    } catch (e: no.kristo.finanshub.ApiException) {
        when (e.status) {
            403 -> Bible37Store.save(ctx, null, false, acct)
            404, 405 -> { val on = username.equals("sebastian", true); Bible37Store.save(ctx, if (on) localVerse37() else null, on, acct) }
        }
    }
}

object Bible37Widgets {
    val ALL: List<GlanceAppWidget> get() = listOf(Bible37Widget(), Bible37RoundWidget(), S37BibleWidget())
    suspend fun redraw(ctx: Context) { ALL.forEach { w -> runCatching { w.updateAll(ctx) } } }
}

/** «Neste ›»: morgendagens vers bare i widgeten. */
class BibleNext37 : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val off = Bible37Store.bumpOffset(context)
        var v: Verse37? = null
        for (api in Notify31.api(context)) {
            v = runCatching { parseVerse37(JSONObject(api.hlGet("/bible/next?offset=$off&period=" + biblePeriod37(), timeout = 6_000))) }.getOrNull()
            if (v != null) break
        }
        Bible37Store.alt.value = v ?: localVerse37(biblePeriod37(), off)
        Bible37Widgets.redraw(context)
    }
}

abstract class BibleW37(private val kind: String) : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val v0 = Bible37Store.shown(context)
        val on0 = Bible37Store.enabled(context)
        provideContent {
            val d by Bible37Store.data.collectAsState()
            val a by Bible37Store.alt.collectAsState()
            val ctx = LocalContext.current
            val v = if (a != null) Bible37Store.shown(ctx) else d ?: v0
            GlanceTheme {
                when (kind) {
                    "round" -> BibleRound37(v, on0)
                    "s" -> BibleSamsung37(v, on0)
                    else -> BibleMy37(v, on0)
                }
            }
        }
    }
}
class Bible37Widget : BibleW37("m")
class Bible37RoundWidget : BibleW37("round")
class S37BibleWidget : BibleW37("s")

class Bible37Receiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = Bible37Widget() }
class Bible37RoundReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = Bible37RoundWidget() }
class S37BibleReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S37BibleWidget() }

private fun openBible37(ctx: Context): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://bibel"), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

private fun cp37(c: Long) = ColorProvider(Color(c))

@Composable
private fun T37(text: String, size: TextUnit, color: ColorProvider, weight: FontWeight = FontWeight.Normal, maxLines: Int = 1, italic: Boolean = false,
    align: TextAlign = TextAlign.Start, modifier: GlanceModifier = GlanceModifier) =
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight, fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal, textAlign = align), maxLines = maxLines)

private fun date37(): String {
    val d = LocalDate.now(OSLO37)
    val wd = listOf("Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn")[d.dayOfWeek.value - 1]
    return "$wd ${d.dayOfMonth}. " + listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")[d.monthValue - 1]
}

/** Material You 4 × 2. */
@Composable
private fun BibleMy37(v: Verse37?, on: Boolean) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.secondaryContainer).padding(horizontal = 18.dp, vertical = 14.dp).clickable(openBible37(ctx))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(GlanceModifier.size(26.dp).cornerRadius(13.dp).background(c.primary), contentAlignment = Alignment.Center) { T37("✝", 13.sp, c.onPrimary, FontWeight.Bold) }
            Spacer(GlanceModifier.width(8.dp))
            T37("Dagens vers", 13.sp, c.onSecondaryContainer, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
            T37(date37(), 11.5.sp, c.onSecondaryContainer)
        }
        Spacer(GlanceModifier.height(8.dp))
        if (v == null || !on) T37(if (on) "Åpne Homelab for å hente dagens vers." else "Bibelvers er ikke slått på for denne brukeren.", 14.sp, c.onSecondaryContainer, maxLines = 3)
        else T37("«${v.text}»", 15.sp, c.onSecondaryContainer, maxLines = 4, italic = true, modifier = GlanceModifier.defaultWeight())
        Spacer(GlanceModifier.height(6.dp))
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T37(v?.ref ?: "", 13.sp, c.onSecondaryContainer, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
            if (v != null && on) Box(GlanceModifier.height(28.dp).cornerRadius(14.dp).background(c.primary).padding(horizontal = 12.dp).clickable(actionRunCallback<BibleNext37>()),
                contentAlignment = Alignment.Center) { T37("Neste ›", 12.sp, c.onPrimary, FontWeight.Bold) }
        }
    }
}

/** Rund 2 × 2: ✝, referansen og «Trykk for å lese». */
@Composable
private fun BibleRound37(v: Verse37?, on: Boolean) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    Box(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(70.dp).background(c.secondaryContainer).padding(14.dp).clickable(openBible37(ctx)), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            T37("✝", 22.sp, c.primary, FontWeight.Bold, align = TextAlign.Center)
            T37(if (on) v?.ref ?: "Dagens vers" else "Bibelvers", 12.sp, c.onSecondaryContainer, FontWeight.Bold, maxLines = 2, align = TextAlign.Center)
            T37(if (on) "Trykk for å lese" else "Ikke på", 10.5.sp, c.onSecondaryContainer, align = TextAlign.Center)
        }
    }
}

/** Samsung (One UI) 4 × 2: hvit glass, radius 26. */
@Composable
private fun BibleSamsung37(v: Verse37?, on: Boolean) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(26.dp).background(cp37(0xE0FFFFFF)).padding(horizontal = 18.dp, vertical = 16.dp).clickable(openBible37(ctx))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T37("Bibelvers", 12.sp, cp37(0xFFB23A2A), FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
            T37(date37(), 11.5.sp, cp37(0xFF8F897C))
        }
        Spacer(GlanceModifier.height(6.dp))
        if (v == null || !on) T37(if (on) "Åpne Homelab for å hente dagens vers." else "Bibelvers er ikke slått på for denne brukeren.", 14.sp, cp37(0xFF1B1A17), maxLines = 3)
        else T37("«${v.text}»", 15.sp, cp37(0xFF1B1A17), maxLines = 4, italic = true, modifier = GlanceModifier.defaultWeight())
        Spacer(GlanceModifier.height(6.dp))
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T37(v?.ref ?: "", 13.sp, cp37(0xFF1B1A17), FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
            if (v != null && on) T37("Neste ›", 12.5.sp, cp37(0xFF2B5D8A), FontWeight.Bold, modifier = GlanceModifier.clickable(actionRunCallback<BibleNext37>()))
        }
    }
}
