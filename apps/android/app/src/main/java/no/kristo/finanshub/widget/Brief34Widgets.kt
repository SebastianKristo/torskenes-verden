package no.kristo.finanshub.widget

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.SweepGradient
import android.net.Uri
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
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import no.kristo.finanshub.Api
import no.kristo.finanshub.Brief34
import no.kristo.finanshub.BriefEv34
import no.kristo.finanshub.BriefNews34
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.Notify
import no.kristo.finanshub.briefKind34
import no.kristo.finanshub.briefTitle34
import no.kristo.finanshub.parseBrief34
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/*
 * Prompt 34 (ANDROID34): Glimt-brief-widgets (claude-code-glimt-brief.md, Glimt Brief.dc.html mode android | samsung).
 *  - Android (Glance, Material You) 4 × 2: primaryContainer, figur, tittel (Morgenbrief/Dagsbrief/Kveldsbrief), temperatur-pille,
 *    oppsummering (2 linjer) og chips (8° lettskyet · Tannlege 15:15 · 3 nyheter).
 *  - Samsung (One UI) 4 × 2: hvit 78 % (One UI legger på blur fra startskjermen), tittel, oppsummering (3 linjer), «Åpne brief ›»,
 *    figur + temperatur. Samsung-varianten er på fra installasjonen og slås av på andre telefoner (Widgets33.fix).
 *  - Trykk → finanshub://brief. Data: GET /api/widgets/brief (kompakt), ellers /api/brief?kind=…; hentes av WidgetWorker hvert
 *    15. minutt (dekker 06:30, 11:00 og 17:00) og når appen lager en ny brief. «Morgenbrief er klar»-varsel én gang per morgen (kan slås av).
 *  - Figuren tegnes som bitmap (android.graphics), samme mål som GlimtFigure34 i appen.
 * Prompt 35 (ANDROID35): alle størrelser (claude-code-glimt-brief.md → «Alle widget-størrelser»), SizeMode.Responsive:
 *  - Material You 2×2 (figur, stor temperatur, tilstand, chip med neste) · 4×1 (figur, oppsummering, temperatur-pille) · 4×2 (som før) ·
 *    4×4 (figur + oppsummering, værkort med nedbør, 2 avtaler, Åpne brief / Spør Glimt).
 *  - Samsung 2×2 · 4×1 · 4×2 · 4×4 (to fliser, 2 avtaler, 2 nyheter), hvit 78 %, radius 26. Egne oppføringer per størrelse i velgeren.
 *  - Figuren er en av de 13 Glimt-figurene (ui/GlimtFigs35.kt): temafiguren (Dråpe på regndager), ellers verten. Trykk-vinkingen beholdes.
 *  - Trykk på avtale → kalender://hendelse/{id}, nyhet → artikkelen, resten → finanshub://brief.
 */

object Brief34Store {
    private const val FILE = "brief34_widgets"
    val data = MutableStateFlow<Brief34?>(null)
    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun current(ctx: Context): Brief34? = data.value ?: sp(ctx).getString("json", null)?.let { raw ->
        runCatching { parseBrief34(raw, sp(ctx).getString("kind", null) ?: briefKind34()) }.getOrNull()
    }?.also { data.value = it }

    fun save(ctx: Context, b: Brief34, acct: String?) {
        val app = ctx.applicationContext
        sp(app).edit().putString("json", toJson(b).toString()).putString("kind", b.kind).apply { if (acct != null) putString("acct", acct) }.apply()
        data.value = b
        Thread { runCatching { kotlinx.coroutines.runBlocking { Brief34Widgets.redraw(app) } } }.start()
    }

    /** Kontobytte eller utlogging tømmer briefen i widgetene. */
    fun useAccount(ctx: Context, acct: String?) {
        val p = sp(ctx)
        if (acct != null && p.getString("acct", null) == acct) return
        p.edit().remove("json").apply { if (acct != null) putString("acct", acct) else remove("acct") }.apply()
        data.value = null
    }

    /** Prompt 35: tegn widgetene på nytt i bakgrunnen (ny figur valgt). */
    fun redrawAsync(ctx: Context) { val app = ctx.applicationContext; Thread { runCatching { kotlinx.coroutines.runBlocking { Brief34Widgets.redraw(app) } } }.start() }

    fun notifyOn(ctx: Context): Boolean = sp(ctx).getBoolean("notify", true)

    /** «Morgenbrief er klar» én gang per dag, fra 06:30. */
    fun maybeNotify(ctx: Context, b: Brief34) {
        // Prompt 35: varsel for hver valgte brief (Innstillinger → Glimt), fra klokkeslettet, én gang per brief og dag.
        val set = no.kristo.finanshub.Glimt35Prefs.load(ctx)
        if (!notifyOn(ctx) || set?.brief == false) return
        val slot = set?.briefs?.get(b.kind)
        if (set != null && slot?.on != true) return
        if (set == null && b.kind != "morning") return
        val now = LocalTime.now(ZoneId.of("Europe/Oslo"))
        val at = slot?.at?.let { runCatching { LocalTime.parse(it.padStart(5, '0')) }.getOrNull() } ?: LocalTime.of(6, 30)
        if (now.isBefore(at)) return
        val today = LocalDate.now(ZoneId.of("Europe/Oslo")).toString()
        val p = sp(ctx)
        if (p.getString("notified_" + b.kind, null) == today) return
        p.edit().putString("notified_" + b.kind, today).apply()
        Notify.post(ctx, briefTitle34(b.kind) + " er klar", b.summary, "brief34-${b.kind}-$today", "ai")
    }

    private fun toJson(b: Brief34): JSONObject = JSONObject().put("kind", b.kind).put("title", b.title).put("summary", b.summary)
        .put("generatedAt", b.generatedAt ?: JSONObject.NULL)
        .put("weather", b.wx?.let { w ->
            JSONObject().put("now", w.now ?: JSONObject.NULL).put("hi", w.hi ?: JSONObject.NULL).put("lo", w.lo ?: JSONObject.NULL).put("cond", w.cond)
                .put("code", w.code ?: JSONObject.NULL).put("rain12h", JSONArray(w.rain)).put("vsYesterday", w.vsYesterday ?: JSONObject.NULL)
                .put("sunset", w.sunset ?: JSONObject.NULL).put("place", w.place).put("rainSoon", w.rainSoon)
        } ?: JSONObject.NULL)
        .put("events", JSONArray().apply { b.events.forEach { e -> put(JSONObject().put("id", e.id ?: JSONObject.NULL).put("title", e.title).put("date", e.date.toString()).put("start", e.start ?: JSONObject.NULL).put("location", e.loc ?: JSONObject.NULL).put("color", e.color?.let { "#" + java.lang.Long.toHexString(it and 0xFFFFFFL).padStart(6, '0') } ?: JSONObject.NULL)) } })
        .put("host", b.host ?: JSONObject.NULL)
        .put("news", JSONArray().apply { b.news.forEach { n -> put(JSONObject().put("source", n.src).put("title", n.title).put("url", n.url ?: JSONObject.NULL).put("time", n.time ?: JSONObject.NULL).put("image", n.image ?: JSONObject.NULL).put("lead", n.lead ?: JSONObject.NULL)) } })
}

/** Henter briefen til widgetene (kompakt endepunkt, ellers hele briefen). */
internal suspend fun fetchBrief34(ctx: Context, api: Api, acct: String?) {
    val kind = no.kristo.finanshub.briefKind35(no.kristo.finanshub.Glimt35Prefs.load(ctx))
    val raw = runCatching { api.hlGet("/widgets/brief?kind=$kind", timeout = 8_000) }.getOrNull()
        ?: runCatching { api.hlGet("/brief?kind=$kind", timeout = 8_000) }.getOrNull() ?: return
    val b = runCatching { parseBrief34(raw, kind) }.getOrNull() ?: return
    Brief34Store.save(ctx, b, acct)
    Brief34Store.maybeNotify(ctx, b)
}

object Brief34Widgets {
    val ALL: List<GlanceAppWidget> get() = listOf(BriefWidget34(), S34BriefWidget(), S35Brief22Widget(), S35Brief41Widget(), S35Brief44Widget())
    suspend fun redraw(ctx: Context) { ALL.forEach { w -> runCatching { w.updateAll(ctx) } } }
}

/* ---------------- Figuren som bitmap ---------------- */

private val fig34 = HashMap<Int, Bitmap>()

/** Positurene til figuren i widgeten: 0 ro, 1 armen opp, 2 armen ned (vinking), 3 blunk, 4 snakker. */
object GlimtPose34 { const val IDLE = 0; const val UP = 1; const val DOWN = 2; const val BLINK = 3; const val TALK = 4 }

/** Glimt-figuren som bitmap, 96 × 108 px, i valgt positur. */
internal fun glimtBitmap34(pose: Int = GlimtPose34.IDLE): Bitmap {
    fig34[pose]?.let { return it }
    val S = 96f
    val bmp = Bitmap.createBitmap(S.toInt() + 16, (S * 1.12f).toInt() + 4, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    c.translate(8f, 4f)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    val ink = 0xFF1B1A17.toInt()
    // Armene.
    p.color = ink
    val armDeg = when (pose) { GlimtPose34.UP -> 58f; GlimtPose34.DOWN -> 22f; else -> -10f }
    c.save(); c.rotate(armDeg, -S * .06f + S * .22f * .9f, S * .61f)
    c.drawRoundRect(RectF(-S * .06f, S * .56f, -S * .06f + S * .22f, S * .66f), S * .05f, S * .05f, p); c.restore()
    c.save(); c.rotate(12f, S + S * .06f - S * .1f, S * .65f)
    c.drawRoundRect(RectF(S + S * .06f - S * .2f, S * .6f, S + S * .06f, S * .7f), S * .05f, S * .05f, p); c.restore()
    // Regnbueringen.
    val ringW = S * .07f
    val cx = S / 2; val cy = S * .14f + S / 2
    p.style = Paint.Style.STROKE; p.strokeWidth = ringW
    p.shader = SweepGradient(cx, cy, intArrayOf(0xFFB23A2A.toInt(), 0xFFE8794A.toInt(), 0xFFF2C14E.toInt(), 0xFF3FBF9A.toInt(), 0xFF7A5AD6.toInt(), 0xFFB23A2A.toInt()), null)
    c.drawCircle(cx, cy, S / 2 - ringW / 2, p)
    p.shader = null; p.style = Paint.Style.FILL
    // Fjeset.
    val fx = S * .08f; val fy = S * .22f; val fs = S * .84f
    p.color = 0xFFFFFDF8.toInt(); c.drawCircle(fx + fs / 2, fy + fs / 2, fs / 2, p)
    p.color = ink
    val ew = S * .1f; val eh = if (pose == GlimtPose34.BLINK) S * .025f else S * .14f
    val ey = if (pose == GlimtPose34.BLINK) fy + fs * .36f + S * .06f else fy + fs * .36f
    c.drawRoundRect(RectF(fx + fs * .27f, ey, fx + fs * .27f + ew, ey + eh), S * .06f, S * .06f, p)
    c.drawRoundRect(RectF(fx + fs - fs * .27f - ew, ey, fx + fs - fs * .27f, ey + eh), S * .06f, S * .06f, p)
    p.color = 0x59E8794A
    c.drawOval(RectF(fx + fs * .16f, fy + fs * .56f, fx + fs * .16f + S * .1f, fy + fs * .56f + S * .06f), p)
    c.drawOval(RectF(fx + fs - fs * .16f - S * .1f, fy + fs * .56f, fx + fs - fs * .16f, fy + fs * .56f + S * .06f), p)
    p.color = 0xFFB23A2A.toInt()
    val mw = S * .22f; val mh = if (pose == GlimtPose34.TALK || pose == GlimtPose34.UP) S * .19f else S * .12f; val mx = fx + fs / 2 - mw / 2; val my = fy + fs * .6f
    c.drawArc(RectF(mx, my - mh, mx + mw, my + mh), 0f, 180f, true, p)
    // Stjernen.
    p.color = 0xFFFF7A52.toInt()
    val st = S * .2f; val sx = S / 2 - st / 2; val sy = -S * .02f; val k = st / 24f
    val path = android.graphics.Path().apply {
        moveTo(sx + 12 * k, sy + 1.5f * k); cubicTo(sx + 12.6f * k, sy + 6.4f * k, sx + 16.6f * k, sy + 10.4f * k, sx + 21.5f * k, sy + 11 * k); lineTo(sx + 21.5f * k, sy + 13 * k)
        cubicTo(sx + 16.6f * k, sy + 13.6f * k, sx + 12.6f * k, sy + 17.6f * k, sx + 12 * k, sy + 22.5f * k); cubicTo(sx + 11.4f * k, sy + 17.6f * k, sx + 7.4f * k, sy + 13.6f * k, sx + 2.5f * k, sy + 13 * k)
        lineTo(sx + 2.5f * k, sy + 11 * k); cubicTo(sx + 7.4f * k, sy + 10.4f * k, sx + 11.4f * k, sy + 6.4f * k, sx + 12 * k, sy + 1.5f * k); close()
    }
    c.drawPath(path, p)
    fig34[pose] = bmp
    return bmp
}

/* ---------------- Trykk på Glimt: vinker og sier det viktigste akkurat nå ---------------- */

object Glimt34Poke {
    val pose = MutableStateFlow(GlimtPose34.IDLE)
    val bubble = MutableStateFlow<String?>(null)
    @Volatile var running = false

    fun tips(b: Brief34?): List<String> {
        val t = ArrayList<String>()
        b?.next?.let { e -> t.add("Neste: ${e.title}" + (e.start?.let { " $it" } ?: "")) }
        b?.wx?.let { w -> w.now?.let { n -> t.add("Det er $n°" + (if (w.cond.isNotBlank()) ", ${w.cond}" else "") + " ute") } }
        b?.wx?.rainSoon?.takeIf { it.startsWith("regn") }?.let { t.add("Ta med paraply ☂ – $it") }
        b?.news?.firstOrNull()?.let { n -> t.add("${n.src}: ${n.title}") }
        t.add("Hei! Jeg er Glimt ✦")
        return t
    }
}

/** Figuren vinker (armen opp og ned), snakker og blunker – så tilbake til ro etter noen sekunder. */
class GlimtPoke34 : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val sp = context.getSharedPreferences("brief34_widgets", Context.MODE_PRIVATE)
        val n = sp.getInt("tip", -1) + 1
        sp.edit().putInt("tip", n).apply()
        val tips = Glimt34Poke.tips(Brief34Store.current(context))
        Glimt34Poke.bubble.value = tips[n % tips.size]
        if (Glimt34Poke.running) return
        Glimt34Poke.running = true
        try {
            val seq = intArrayOf(GlimtPose34.UP, GlimtPose34.DOWN, GlimtPose34.UP, GlimtPose34.DOWN, GlimtPose34.TALK, GlimtPose34.IDLE, GlimtPose34.TALK)
            Glimt34Poke.pose.value = seq[0]
            Brief34Widgets.redraw(context)
            for (i in 1 until seq.size) { delay(420); Glimt34Poke.pose.value = seq[i] }
            delay(4200)
            Glimt34Poke.pose.value = GlimtPose34.BLINK
            delay(250)
        } finally {
            Glimt34Poke.pose.value = GlimtPose34.IDLE
            Glimt34Poke.bubble.value = null
            Glimt34Poke.running = false
            Brief34Widgets.redraw(context)
        }
    }
}

/* ---------------- Widgetene ---------------- */

/* Prompt 35: de fire størrelsene. Glance velger den største som får plass. */
private val W22 = DpSize(110.dp, 110.dp)
private val W41 = DpSize(250.dp, 50.dp)
private val W42 = DpSize(250.dp, 110.dp)
private val W44 = DpSize(250.dp, 250.dp)

/** kind: m (Material You) eller s (Samsung). */
abstract class BriefW34(private val kind: String) : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Responsive(setOf(W22, W41, W42, W44))
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val b0 = Brief34Store.current(context)
        provideContent {
            val b by Brief34Store.data.collectAsState()
            val pose by Glimt34Poke.pose.collectAsState()
            val say by Glimt34Poke.bubble.collectAsState()
            val bb = b ?: b0
            val size = LocalSize.current
            val sz = when { size.width < 200.dp -> 22; size.height < 100.dp -> 41; size.height < 220.dp -> 42; else -> 44 }
            GlanceTheme {
                if (kind == "m") when (sz) { 22 -> M22Brief35(bb, pose, say); 41 -> M41Brief35(bb, pose, say); 44 -> M44Brief35(bb, pose, say); else -> MBrief34(bb, pose, say) }
                else when (sz) { 22 -> S22Brief35(bb, pose, say); 41 -> S41Brief35(bb, pose, say); 44 -> S44Brief35(bb, pose, say); else -> SBrief34(bb, pose, say) }
            }
        }
    }
}
class BriefWidget34 : BriefW34("m")
class S34BriefWidget : BriefW34("s")
/** Prompt 35: Samsung har egne oppføringer per størrelse i widgetvelgeren (samme responsive innhold). */
class S35Brief22Widget : BriefW34("s")
class S35Brief41Widget : BriefW34("s")
class S35Brief44Widget : BriefW34("s")

class BriefReceiver34 : Receiver24() { override val glanceAppWidget: GlanceAppWidget = BriefWidget34() }
class S34BriefReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S34BriefWidget() }
class S35Brief22Receiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S35Brief22Widget() }
class S35Brief41Receiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S35Brief41Widget() }
class S35Brief44Receiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = S35Brief44Widget() }

private fun openBrief34(ctx: Context): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://brief"), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

private fun openUri35(ctx: Context, uri: String): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse(uri), ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

/** Trykk på avtale → kalender://hendelse/{id} (Kalender-appen), ellers Kalender i Homelab. */
private fun openEvent35(ctx: Context, e: BriefEv34): Action {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse("kalender://hendelse/" + Uri.encode(e.id ?: ""))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val ok = e.id != null && runCatching { i.resolveActivity(ctx.packageManager) != null }.getOrDefault(false)
    return if (ok) actionStartActivity(i) else openUri35(ctx, "finanshub://kalender")
}

/** Trykk på nyhet → artikkelen. */
private fun openNews35(ctx: Context, n: BriefNews34): Action = n.url?.let { u ->
    actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
} ?: openBrief34(ctx)

private fun cp34(c: Long) = ColorProvider(Color(c))

@Composable
private fun T34(text: String, size: TextUnit, color: ColorProvider, weight: FontWeight = FontWeight.Normal, maxLines: Int = 1, modifier: GlanceModifier = GlanceModifier) =
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight), maxLines = maxLines)

/** Temafiguren: Dråpe på regndager, ellers verten (brukerens figur, Glimt Natt 21–06). */
private fun figId35(ctx: Context, b: Brief34?): String {
    val w = b?.wx
    if (w != null && (w.cond.contains("regn") || w.cond.contains("snø") || w.rainSoon.startsWith("regn"))) return "drape"
    b?.host?.let { return no.kristo.finanshub.ui.Fig35.norm(it) }
    return no.kristo.finanshub.hostChar35(no.kristo.finanshub.Glimt35Prefs.load(ctx)?.char ?: "glimt")
}

/** Posituren ved trykk-vinkingen → humør og tidspunkt i figurens animasjon. */
private fun figPose35(pose: Int): Pair<String, Float?> = when (pose) {
    GlimtPose34.UP -> "glad" to .55f
    GlimtPose34.DOWN -> "glad" to .3f
    GlimtPose34.TALK -> "talk" to .15f
    GlimtPose34.BLINK -> "idle" to 4.03f
    else -> "idle" to null
}

/** Figuren [w] bred (bitmapen har luft rundt for hopp og gnister). */
@Composable
private fun Fig35W(b: Brief34?, pose: Int, w: Dp, poke: Boolean = true) {
    val ctx = LocalContext.current
    val id = figId35(ctx, b)
    val (mood, t) = figPose35(pose)
    val bmp = no.kristo.finanshub.ui.fig35Bitmap(id, 144, mood, t)
    val h = w * (bmp.height.toFloat() / bmp.width.toFloat())
    val m = GlanceModifier.size(w, h)
    Image(ImageProvider(bmp), contentDescription = "Hils på " + no.kristo.finanshub.ui.Fig35.name(id), modifier = if (poke) m.clickable(actionRunCallback<GlimtPoke34>()) else m)
}

private fun nextLine35(b: Brief34?): String = b?.next?.let { e -> e.title + (e.start?.let { " $it" } ?: "") } ?: "Fri resten av dagen"

/* ---------------- Material You ---------------- */

/** 2 × 2: figur, stor temperatur, tilstand og chip med neste. */
@Composable
private fun M22Brief35(b: Brief34?, pose: Int, say: String?) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.primaryContainer).padding(14.dp).clickable(openBrief34(ctx))) {
        Fig35W(b, pose, 34.dp)
        Spacer(GlanceModifier.defaultWeight())
        if (say != null) T34(say, 12.sp, c.onPrimaryContainer, FontWeight.Bold, maxLines = 3) else {
            T34(b?.wx?.now?.let { "$it°" } ?: "–", 32.sp, c.onPrimaryContainer, FontWeight.Bold)
            T34(b?.wx?.cond ?: briefTitle34(b?.kind ?: briefKind34()), 12.5.sp, c.onPrimaryContainer)
            Spacer(GlanceModifier.height(8.dp))
            Box(GlanceModifier.height(26.dp).cornerRadius(13.dp).background(c.secondaryContainer).padding(horizontal = 10.dp), contentAlignment = Alignment.CenterStart) {
                T34(nextLine35(b), 11.5.sp, c.onSecondaryContainer, FontWeight.Bold)
            }
        }
    }
}

/** 4 × 1: figur + oppsummering (2 linjer) + temperatur-pille. */
@Composable
private fun M41Brief35(b: Brief34?, pose: Int, say: String?) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    Row(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.primaryContainer).padding(horizontal = 14.dp, vertical = 8.dp).clickable(openBrief34(ctx)),
        verticalAlignment = Alignment.CenterVertically) {
        Fig35W(b, pose, 30.dp)
        Spacer(GlanceModifier.width(10.dp))
        T34(say ?: b?.summary ?: "Åpne Homelab for å lage briefen.", 13.sp, c.onPrimaryContainer, if (say != null) FontWeight.Bold else FontWeight.Normal, maxLines = 2, modifier = GlanceModifier.defaultWeight())
        b?.wx?.now?.let { t ->
            Spacer(GlanceModifier.width(8.dp))
            Box(GlanceModifier.height(30.dp).cornerRadius(15.dp).background(c.onPrimaryContainer).padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                T34("$t°", 12.sp, c.primaryContainer, FontWeight.Bold)
            }
        }
    }
}

/** 4 × 4: figur + oppsummering, værkort med nedbør, 2 avtaler og knappene Åpne brief / Spør Glimt. */
@Composable
private fun M44Brief35(b: Brief34?, pose: Int, say: String?) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.primaryContainer).padding(16.dp).clickable(openBrief34(ctx))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Fig35W(b, pose, 44.dp)
            Spacer(GlanceModifier.width(10.dp))
            Column(GlanceModifier.defaultWeight()) {
                T34(briefTitle34(b?.kind ?: briefKind34()), 15.sp, c.onPrimaryContainer, FontWeight.Bold)
                T34(say ?: b?.summary ?: "Åpne Homelab for å lage briefen.", 12.5.sp, c.onPrimaryContainer, if (say != null) FontWeight.Bold else FontWeight.Normal, maxLines = 2)
            }
        }
        Spacer(GlanceModifier.height(10.dp))
        b?.wx?.let { w ->
            Column(GlanceModifier.fillMaxWidth().cornerRadius(20.dp).background(c.secondaryContainer).padding(horizontal = 12.dp, vertical = 10.dp)) {
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    T34(w.now?.let { "$it°" } ?: "–", 22.sp, c.onSecondaryContainer, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
                    T34("↑${w.hi ?: "–"}° ↓${w.lo ?: "–"}°", 12.sp, c.onSecondaryContainer, FontWeight.Bold)
                }
                if (w.rain.isNotEmpty()) {
                    Spacer(GlanceModifier.height(6.dp))
                    val mx = maxOf(.6, w.rain.maxOrNull() ?: 0.0)
                    Row(GlanceModifier.fillMaxWidth().height(30.dp), verticalAlignment = Alignment.Bottom) {
                        w.rain.take(12).forEachIndexed { i, r ->
                            if (i > 0) Spacer(GlanceModifier.width(2.dp))
                            Box(GlanceModifier.defaultWeight().height((30 * (r / mx).coerceIn(.08, 1.0)).dp).cornerRadius(2.dp).background(c.onSecondaryContainer)) {}
                        }
                    }
                }
            }
        }
        Spacer(GlanceModifier.height(6.dp))
        b?.events?.take(2)?.forEach { e -> EvRow35(e, c.onPrimaryContainer, c.onPrimaryContainer) }
        Spacer(GlanceModifier.defaultWeight())
        Row(GlanceModifier.fillMaxWidth()) {
            Box(GlanceModifier.height(32.dp).cornerRadius(16.dp).background(c.onPrimaryContainer).padding(horizontal = 14.dp).clickable(openBrief34(ctx)), contentAlignment = Alignment.Center) {
                T34("Åpne brief", 12.sp, c.primaryContainer, FontWeight.Bold)
            }
            Spacer(GlanceModifier.width(6.dp))
            Box(GlanceModifier.height(32.dp).cornerRadius(16.dp).background(c.secondaryContainer).padding(horizontal = 14.dp).clickable(openUri35(ctx, "finanshub://chat")), contentAlignment = Alignment.Center) {
                T34("Spør Glimt", 12.sp, c.onSecondaryContainer, FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun EvRow35(e: BriefEv34, ink: ColorProvider, mut: ColorProvider) {
    val ctx = LocalContext.current
    Row(GlanceModifier.fillMaxWidth().padding(vertical = 4.dp).clickable(openEvent35(ctx, e)), verticalAlignment = Alignment.CenterVertically) {
        Box(GlanceModifier.size(4.dp, 24.dp).cornerRadius(2.dp).background(ColorProvider(Color(e.color ?: 0xFFB23A2A)))) {}
        Spacer(GlanceModifier.width(8.dp))
        T34(e.title, 12.5.sp, ink, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
        T34(e.start ?: "Hele dagen", 10.5.sp, mut, FontWeight.Medium)
    }
}

/** Material You 4 × 2. */
@Composable
private fun MBrief34(b: Brief34?, pose: Int, say: String?) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    val size = LocalSize.current
    val kick = briefTitle34(b?.kind ?: briefKind34())
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.primaryContainer).padding(16.dp).clickable(openBrief34(ctx))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Fig35W(b, pose, 30.dp)
            Spacer(GlanceModifier.width(10.dp))
            T34(kick, 14.sp, c.onPrimaryContainer, FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
            b?.wx?.now?.let { t ->
                Box(GlanceModifier.height(28.dp).cornerRadius(14.dp).background(c.onPrimaryContainer).padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                    T34("$t°", 12.sp, c.primaryContainer, FontWeight.Bold)
                }
            }
        }
        Spacer(GlanceModifier.height(10.dp))
        if (say != null) Box(GlanceModifier.cornerRadius(12.dp).background(c.onPrimaryContainer).padding(horizontal = 10.dp, vertical = 6.dp)) {
            T34(say, 13.sp, c.primaryContainer, FontWeight.Bold, maxLines = 2)
        } else T34(b?.summary ?: "Åpne Homelab for å lage briefen.", 13.5.sp, c.onPrimaryContainer, maxLines = 2)
        Spacer(GlanceModifier.defaultWeight())
        if (b != null && size.height >= 150.dp) Row(GlanceModifier.fillMaxWidth()) {
            b.chips.take(if (size.width >= 320.dp) 3 else 2).forEachIndexed { i, ch ->
                if (i > 0) Spacer(GlanceModifier.width(6.dp))
                Box(GlanceModifier.height(30.dp).cornerRadius(15.dp).background(c.secondaryContainer).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    T34(ch, 12.sp, c.onSecondaryContainer, FontWeight.Bold)
                }
            }
        }
    }
}

/* ---------------- Samsung One UI (hvit 78 %, radius 26) ---------------- */

private const val S_BG35 = 0xC7FFFFFF
private const val S_INK35 = 0xFF1B1A17
private const val S_SUB35 = 0xFF3D3A33
private const val S_BLUE35 = 0xFF2B5D8A

/** 2 × 2: figur, temperatur, tittel og neste. */
@Composable
private fun S22Brief35(b: Brief34?, pose: Int, say: String?) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(26.dp).background(cp34(S_BG35)).padding(horizontal = 16.dp, vertical = 14.dp).clickable(openBrief34(ctx))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Fig35W(b, pose, 34.dp)
            Spacer(GlanceModifier.defaultWeight())
            T34(b?.wx?.now?.let { "$it°" } ?: "", 24.sp, cp34(S_INK35), FontWeight.Bold)
        }
        Spacer(GlanceModifier.defaultWeight())
        T34(briefTitle34(b?.kind ?: briefKind34()), 14.sp, cp34(S_INK35), FontWeight.Bold)
        T34(say ?: b?.next?.let { e -> e.title + (e.start?.let { " · $it" } ?: "") } ?: "Fri resten av dagen", 12.sp, cp34(S_SUB35), maxLines = 2)
    }
}

/** 4 × 1: figur, «Kveldsbrief · 8°», neste og «Åpne ›». */
@Composable
private fun S41Brief35(b: Brief34?, pose: Int, say: String?) {
    val ctx = LocalContext.current
    Row(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(26.dp).background(cp34(S_BG35)).padding(horizontal = 16.dp, vertical = 8.dp).clickable(openBrief34(ctx)),
        verticalAlignment = Alignment.CenterVertically) {
        Fig35W(b, pose, 30.dp)
        Spacer(GlanceModifier.width(12.dp))
        Column(GlanceModifier.defaultWeight()) {
            T34(briefTitle34(b?.kind ?: briefKind34()) + (b?.wx?.now?.let { " · $it°" } ?: ""), 13.5.sp, cp34(S_INK35), FontWeight.Bold)
            T34(say ?: nextLine35(b), 12.sp, cp34(S_SUB35))
        }
        T34("Åpne ›", 12.sp, cp34(S_BLUE35), FontWeight.Bold)
    }
}

/** Samsung One UI 4 × 2. */
@Composable
private fun SBrief34(b: Brief34?, pose: Int, say: String?) {
    val ctx = LocalContext.current
    val kick = briefTitle34(b?.kind ?: briefKind34())
    Row(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(26.dp).background(cp34(S_BG35)).padding(horizontal = 18.dp, vertical = 16.dp).clickable(openBrief34(ctx)),
        verticalAlignment = Alignment.CenterVertically) {
        Column(GlanceModifier.defaultWeight().fillMaxSize()) {
            T34(kick, 16.sp, cp34(S_INK35), FontWeight.Bold)
            Spacer(GlanceModifier.height(6.dp))
            if (say != null) Box(GlanceModifier.cornerRadius(12.dp).background(cp34(0xFF22476B)).padding(horizontal = 10.dp, vertical = 6.dp)) {
                T34(say, 13.sp, cp34(0xFFFFFFFF), FontWeight.Bold, maxLines = 3)
            } else T34(b?.summary ?: "Åpne Homelab for å lage briefen.", 13.sp, cp34(S_SUB35), maxLines = 3)
            Spacer(GlanceModifier.defaultWeight())
            T34("Åpne brief ›", 12.sp, cp34(S_BLUE35), FontWeight.Bold)
        }
        Spacer(GlanceModifier.width(10.dp))
        Column(GlanceModifier.width(76.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Fig35W(b, pose, 56.dp)
            Spacer(GlanceModifier.height(4.dp))
            T34(b?.wx?.now?.let { "$it°" } ?: "", 13.sp, cp34(S_INK35), FontWeight.Bold)
        }
    }
}

/** 4 × 4: oppsummering, to fliser (vær blå, neste avtale), 2 avtaler og 2 nyheter. */
@Composable
private fun S44Brief35(b: Brief34?, pose: Int, say: String?) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(26.dp).background(cp34(S_BG35)).padding(horizontal = 18.dp, vertical = 16.dp).clickable(openBrief34(ctx))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Fig35W(b, pose, 44.dp)
            Spacer(GlanceModifier.width(10.dp))
            Column(GlanceModifier.defaultWeight()) {
                T34(briefTitle34(b?.kind ?: briefKind34()), 16.sp, cp34(S_INK35), FontWeight.Bold)
                T34(say ?: b?.summary ?: "Åpne Homelab for å lage briefen.", 12.5.sp, cp34(S_SUB35), if (say != null) FontWeight.Bold else FontWeight.Normal, maxLines = 2)
            }
        }
        Spacer(GlanceModifier.height(10.dp))
        Row(GlanceModifier.fillMaxWidth()) {
            Column(GlanceModifier.defaultWeight().cornerRadius(16.dp).background(cp34(S_BLUE35)).padding(horizontal = 12.dp, vertical = 10.dp)) {
                T34(b?.wx?.now?.let { "$it°" } ?: "–", 22.sp, cp34(0xFFFFFFFF), FontWeight.Bold)
                T34((b?.wx?.cond ?: "") + (b?.wx?.hi?.let { " · ↑$it°" } ?: ""), 12.sp, cp34(0xE6FFFFFF))
            }
            Spacer(GlanceModifier.width(8.dp))
            Column(GlanceModifier.defaultWeight().cornerRadius(16.dp).background(cp34(0x1A2B5D8A)).padding(horizontal = 12.dp, vertical = 10.dp)) {
                T34("Neste", 11.sp, cp34(S_SUB35))
                T34(b?.next?.title ?: "Fri", 13.5.sp, cp34(S_INK35), FontWeight.Bold)
                T34(b?.next?.start ?: "", 12.sp, cp34(S_BLUE35), FontWeight.Bold)
            }
        }
        Spacer(GlanceModifier.height(6.dp))
        b?.events?.take(2)?.forEach { e -> EvRow35(e, cp34(S_INK35), cp34(0xFF6B665C)) }
        b?.news?.take(2)?.forEach { n ->
            Row(GlanceModifier.fillMaxWidth().padding(vertical = 5.dp).clickable(openNews35(ctx, n))) {
                T34(n.src.take(4).uppercase(), 10.sp, cp34(0xFFB23A2A), FontWeight.Bold, modifier = GlanceModifier.width(34.dp))
                T34(n.title, 13.sp, cp34(S_INK35), FontWeight.Medium, maxLines = 2, modifier = GlanceModifier.defaultWeight())
            }
        }
    }
}
