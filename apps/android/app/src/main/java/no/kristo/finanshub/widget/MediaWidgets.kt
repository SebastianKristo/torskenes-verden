package no.kristo.finanshub.widget

import android.content.Context
import android.content.Intent
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
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
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
import kotlinx.coroutines.flow.MutableStateFlow
import no.kristo.finanshub.Api
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.family.FamilyPrefs
import org.json.JSONArray
import org.json.JSONObject

/*
 * Prompt 43 (claude-code-media-widgets.md, Media Widgets.dc.html 1b/1c): Media-widgets i Glance.
 *  - Material You (GlanceTheme, dynamiske farger): 2 × 2 (fart + øverste nedlasting med linje), 4 × 2 («Lastes ned · fart» + Pause alt +
 *    to nedlastinger), 4 × 3 («Kommer denne uka»).
 *  - Samsung One UI (samme receivere, Build.MANUFACTURER == samsung): hvit, 26 dp hjørner, store tall («3 lastes ned»), blå linjer #1f6fe5,
 *    gul for står fast.
 *  - Data: GET /api/widgets/media ({downloads|queue:[…], upcoming:[…], speed|dl, active, paused}); hentes av WidgetWorker hvert 15. min
 *    og når appen åpnes. «Pause alt» / «Fortsett» kaller POST /api/media/torrents/pauseAll|resumeAll og henter på nytt.
 *  - Trykk: finanshub://media/qbit (nedlasting) eller finanshub://media/snart.
 */

data class WDl43(val name: String, val sub: String, val pct: Int, val stalled: Boolean)
data class WUp43(val title: String, val sub: String)
data class WMedia43(val dl: Long, val active: Int, val paused: Boolean, val downloads: List<WDl43>, val upcoming: List<WUp43>)

object Media43Store {
    private const val FILE = "media43_widgets"
    val data = MutableStateFlow<WMedia43?>(null)
    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun current(ctx: Context): WMedia43? = data.value ?: sp(ctx).getString("json", null)?.let { runCatching { parse(it) }.getOrNull() }.also { data.value = it }

    fun saveRaw(ctx: Context, raw: String, acct: String?) {
        val m = runCatching { parse(raw) }.getOrNull() ?: return
        sp(ctx).edit().putString("json", raw).apply { if (acct != null) putString("acct", acct) }.apply()
        data.value = m
    }

    fun useAccount(ctx: Context, acct: String?) {
        val p = sp(ctx)
        if (acct != null && p.getString("acct", null) == acct) return
        p.edit().remove("json").apply { if (acct != null) putString("acct", acct) else remove("acct") }.apply()
        data.value = null
    }

    private fun s(o: JSONObject, vararg k: String): String? = k.firstNotNullOfOrNull { key -> if (!o.has(key) || o.isNull(key)) null else o.optString(key).takeIf { it.isNotBlank() && it != "null" } }
    private fun objs(a: JSONArray?): List<JSONObject> = (0 until (a?.length() ?: 0)).mapNotNull { a!!.optJSONObject(it) }

    fun parse(raw: String): WMedia43 {
        val o = JSONObject(raw)
        val dls = objs(o.optJSONArray("downloads") ?: o.optJSONArray("queue") ?: o.optJSONArray("torrents")).map { x ->
            // SERVER43 /api/widgets/media: progress i prosent, status-kode (dl · stall · meta · pause) og stalled.
            val pct = x.has("progressText") || x.has("status")
            val p = x.optDouble("progress", x.optDouble("pct", 0.0)).let { if (!pct && it <= 1.0) it * 100 else it }
            val st = s(x, "status", "state").orEmpty()
            WDl43(s(x, "title", "name") ?: "", listOfNotNull(s(x, "sub", "episode", "code")?.takeIf { it != "Film" }, s(x, "quality")).joinToString(" · "), p.toInt().coerceIn(0, 100),
                x.optBoolean("stalled", false) || st == "stall" || st.contains("stalled", true) || st.contains("warning", true))
        }
        val ups = objs(o.optJSONArray("upcoming") ?: o.optJSONArray("next")).map { x ->
            WUp43(s(x, "title", "seriesTitle") ?: "", listOfNotNull(s(x, "code"), s(x, "when", "time", "day")).joinToString(" · "))
        }
        val speed = if (o.has("speed")) o.optLong("speed") else o.optLong("dl", o.optLong("dlspeed", 0))
        return WMedia43(speed, o.optInt("active", dls.count { !it.stalled && it.pct < 100 }), o.optBoolean("allPaused", o.optBoolean("paused", false)), dls, ups)
    }
}

internal suspend fun fetchMedia43(ctx: Context, api: Api, acct: String?) {
    val raw = runCatching { api.hlGet("/widgets/media", timeout = 8_000) }.getOrNull() ?: return
    Media43Store.saveRaw(ctx, raw, acct)
}

object Media43Widgets {
    val ALL: List<GlanceAppWidget> get() = listOf(MediaWidget43S(), MediaWidget43M(), MediaWidget43L())
    suspend fun redraw(ctx: Context) { ALL.forEach { w -> runCatching { w.updateAll(ctx) } } }
}

abstract class MediaW43(private val kind: String) : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val d0 = Media43Store.current(context)
        provideContent {
            val d by Media43Store.data.collectAsState()
            GlanceTheme { MediaBody43(context, kind, d ?: d0) }
        }
    }
}

class MediaWidget43S : MediaW43("s")
class MediaWidget43M : MediaW43("m")
class MediaWidget43L : MediaW43("l")

class MediaSmallReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = MediaWidget43S() }
class MediaMediumReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = MediaWidget43M() }
class MediaLargeReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = MediaWidget43L() }

/** Pause alt / Fortsett alt fra 4 × 2. */
class MediaPause43 : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val api = FamilyPrefs.api(context) ?: return
        val paused = Media43Store.current(context)?.paused == true
        runCatching { api.hlPost("/media/torrents/" + if (paused) "resumeAll" else "pauseAll") }
        Media43Store.current(context)?.let { Media43Store.data.value = it.copy(paused = !paused) }
        runCatching { fetchMedia43(context, api, runCatching { FamilyPrefs.account(context) }.getOrNull()) }
        Media43Widgets.redraw(context)
    }
}

private fun open43(ctx: Context, tab: String): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://media/$tab"), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

private fun cp43(c: Long) = ColorProvider(Color(c))

private class Sty43(val bg: ColorProvider, val ink: ColorProvider, val mut: ColorProvider, val acc: ColorProvider, val track: ColorProvider, val chip: ColorProvider, val chipInk: ColorProvider, val radius: Dp)

@Composable
private fun sty43(): Sty43 {
    val samsung = Build.MANUFACTURER.equals("samsung", ignoreCase = true)
    return if (samsung) Sty43(cp43(0xFFFFFFFF), cp43(0xFF111111), cp43(0xFF6B6B6B), cp43(0xFF1F6FE5), cp43(0xFFE3E8F0), cp43(0xFF1F6FE5), cp43(0xFFFFFFFF), 26.dp)
    else Sty43(GlanceTheme.colors.primaryContainer, GlanceTheme.colors.onPrimaryContainer, GlanceTheme.colors.onSurfaceVariant, GlanceTheme.colors.primary,
        GlanceTheme.colors.secondaryContainer, GlanceTheme.colors.primary, GlanceTheme.colors.onPrimary, 28.dp)
}

@Composable
private fun T43(text: String, size: TextUnit, color: ColorProvider, weight: FontWeight = FontWeight.Normal, maxLines: Int = 1, modifier: GlanceModifier = GlanceModifier) =
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight), maxLines = maxLines)

private fun speed43w(b: Long): String = when {
    b >= 1L shl 20 -> String.format(java.util.Locale("nb", "NO"), "%.1f MB/s", b / (1L shl 20).toDouble())
    b > 0 -> "${b / 1024} kB/s"
    else -> "0 kB/s"
}

@Composable
private fun Bar43(pct: Int, width: Dp, st: Sty43, warn: Boolean) {
    Box(GlanceModifier.width(width).height(4.dp).cornerRadius(2.dp).background(st.track)) {
        Box(GlanceModifier.width((width * (pct / 100f)).coerceAtLeast(4.dp)).height(4.dp).cornerRadius(2.dp).background(if (warn) cp43(0xFFC48A1A) else st.acc)) {}
    }
}

@Composable
private fun DlRow43(d: WDl43, w: Dp, st: Sty43) {
    Column(GlanceModifier.fillMaxWidth().padding(bottom = 6.dp)) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T43(d.name, 12.5.sp, st.ink, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
            T43(if (d.stalled) "står fast" else "${d.pct} %", 12.sp, if (d.stalled) cp43(0xFFC48A1A) else st.ink, FontWeight.Bold)
        }
        if (d.sub.isNotBlank()) T43(d.sub, 11.sp, st.mut)
        Spacer(GlanceModifier.height(3.dp))
        Bar43(d.pct, w, st, d.stalled)
    }
}

@Composable
private fun MediaBody43(ctx: Context, kind: String, m: WMedia43?) {
    val st = sty43()
    val size = LocalSize.current
    val w = (size.width - 32.dp).coerceAtLeast(60.dp)
    val tab = if ((m?.downloads?.size ?: 0) > 0) "qbit" else "snart"
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(st.radius).background(st.bg).padding(16.dp).clickable(open43(ctx, tab))) {
        if (m == null) {
            T43("MEDIA", 11.sp, st.acc, FontWeight.Bold)
            Spacer(GlanceModifier.height(6.dp))
            T43("Åpne Media i appen for å hente data", 12.5.sp, st.mut, maxLines = 3)
            return@Column
        }
        val samsung = Build.MANUFACTURER.equals("samsung", ignoreCase = true)
        when (kind) {
            "s" -> {
                T43("MEDIA", 11.sp, st.acc, FontWeight.Bold)
                Spacer(GlanceModifier.height(4.dp))
                if (samsung) T43("${m.active} lastes ned", 22.sp, st.ink, FontWeight.Bold, maxLines = 2) else T43(speed43w(m.dl), 26.sp, st.ink, FontWeight.Bold)
                T43(if (samsung) speed43w(m.dl) else "${m.active} aktive", 12.sp, st.mut)
                Spacer(GlanceModifier.defaultWeight())
                m.downloads.firstOrNull()?.let { DlRow43(it, w, st) } ?: T43("Ingen nedlastinger", 12.sp, st.mut)
            }
            "m" -> {
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(GlanceModifier.defaultWeight()) {
                        T43(if (samsung) "${m.active} lastes ned" else "Lastes ned · ${speed43w(m.dl)}", 14.sp, st.ink, FontWeight.Bold)
                        if (samsung) T43(speed43w(m.dl), 12.sp, st.mut)
                    }
                    Box(GlanceModifier.height(36.dp).cornerRadius(18.dp).background(st.chip).padding(horizontal = 12.dp).clickable(actionRunCallback<MediaPause43>()),
                        contentAlignment = Alignment.Center) { T43(if (m.paused) "Fortsett" else "Pause alt", 12.5.sp, st.chipInk, FontWeight.Bold) }
                }
                Spacer(GlanceModifier.height(10.dp))
                if (m.downloads.isEmpty()) T43("Ingenting lastes ned nå", 12.5.sp, st.mut)
                m.downloads.take(2).forEach { DlRow43(it, w, st) }
            }
            else -> {
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    T43(if (samsung) "${m.active} lastes ned" else "Lastes ned · ${speed43w(m.dl)}", 14.sp, st.ink, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
                    Box(GlanceModifier.height(36.dp).cornerRadius(18.dp).background(st.chip).padding(horizontal = 12.dp).clickable(actionRunCallback<MediaPause43>()),
                        contentAlignment = Alignment.Center) { T43(if (m.paused) "Fortsett" else "Pause alt", 12.5.sp, st.chipInk, FontWeight.Bold) }
                }
                Spacer(GlanceModifier.height(8.dp))
                m.downloads.take(2).forEach { DlRow43(it, w, st) }
                Spacer(GlanceModifier.height(4.dp))
                T43("KOMMER DENNE UKA", 11.sp, st.acc, FontWeight.Bold)
                Spacer(GlanceModifier.height(4.dp))
                if (m.upcoming.isEmpty()) T43("Ingenting de neste 7 dagene", 12.sp, st.mut)
                m.upcoming.take(3).forEach { u ->
                    Row(GlanceModifier.fillMaxWidth().padding(bottom = 4.dp).clickable(open43(ctx, "snart")), verticalAlignment = Alignment.CenterVertically) {
                        Box(GlanceModifier.size(8.dp).cornerRadius(4.dp).background(st.acc)) {}
                        Spacer(GlanceModifier.width(8.dp))
                        T43(u.title, 12.5.sp, st.ink, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
                        T43(u.sub, 11.5.sp, st.mut)
                    }
                }
            }
        }
    }
}
