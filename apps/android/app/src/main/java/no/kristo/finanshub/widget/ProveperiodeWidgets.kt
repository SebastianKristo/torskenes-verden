package no.kristo.finanshub.widget

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import androidx.glance.layout.ContentScale
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
import no.kristo.finanshub.Notify31
import no.kristo.finanshub.TRIAL_CANCEL31
import no.kristo.finanshub.dShort31
import no.kristo.finanshub.family.FamilyPrefs
import no.kristo.finanshub.parseTrials31
import no.kristo.finanshub.trialColor32b
import no.kristo.finanshub.trialDays32b
import no.kristo.finanshub.trialDomain32b
import no.kristo.finanshub.trialPct32b
import no.kristo.finanshub.trialStartOf32b
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URLEncoder
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/*
 * Prompt 32 (ANDROID32): Prøveperiode-widgets (claude-code-proveperiode-widgets.md, Proveperiode Widgets.dc.html).
 *  - Material You (Glance, alle telefoner): 2 × 2 (chip med logo + navn · tall 52 sp · «dager igjen» · «før 149 kr/mnd») og
 *    4 × 2 («Prøveperioder · 3 aktive», hovedkort med rund rød teller og «Avsluttet» (ActionCallback), chips for de neste).
 *    Dynamiske farger: primaryContainer som bakgrunn, secondaryContainer for chips, radius 28.
 *  - Samsung One UI (providerne er av i manifestet og slås på bare når Build.MANUFACTURER er samsung, S24.enableProviders):
 *    gjennomsiktig hvit 78 % (blur kan ikke tegnes i Glance; One UI legger på gjennomsiktigheten fra startskjermen), radius 28.
 *    2 × 2: logo + navn · «2 d» · «igjen av prøven» · fremdrift. 4 × 2: «Prøveperioder» + «+» · rader (logo, navn, pris, dager, linje) ·
 *    blå pille «Avslutt {navn}» som åpner oppsigelsessiden.
 *  - Data: GET /api/widgets/trials (kompakt), ellers /finans/api/subscriptions/trials. Lagres per konto; dager igjen regnes ut når
 *    widgeten tegnes (WidgetWorker tegner hvert 15. minutt, også over midnatt). Logoene hentes én gang via serverens logo-cache.
 *  - «Avsluttet»: POST /api/widgets/trials/:id {status:'cancelled'} (eldre server: PATCH /finans/api/subscriptions/trials/:id),
 *    fjerner påminnelsene på telefonen og tegner widgetene på nytt.
 */

/* ---------------- Data ---------------- */

data class WTrial32b(val id: String, val name: String, val end: LocalDate, val start: LocalDate?, val price: String, val cancelUrl: String?, val domain: String)

private val OSLO32B: ZoneId = ZoneId.of("Europe/Oslo")

object Trials32bStore {
    private const val FILE = "trials32b_widgets"
    val data = MutableStateFlow<List<WTrial32b>?>(null)
    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun current(ctx: Context): List<WTrial32b> = data.value ?: (sp(ctx).getString("json", null)?.let { runCatching { parse(it) }.getOrNull() } ?: emptyList()).also { data.value = it }

    /** Aktive prøver som ikke er over, den som slutter først øverst. */
    fun active(l: List<WTrial32b>, today: LocalDate = LocalDate.now(OSLO32B)): List<WTrial32b> = l.filter { trialDays32b(it.end, today) >= 0 }.sortedBy { it.end }

    /** Fra appen (prøvene er lastet eller endret) eller fra hentingen. */
    fun saveRaw(ctx: Context, raw: String, acct: String?) {
        val l = runCatching { parse(raw) }.getOrNull() ?: return
        val app = ctx.applicationContext
        sp(app).edit().putString("json", toJson(l).toString()).apply { if (acct != null) putString("acct", acct) }.apply()
        data.value = l
        Thread { runCatching { kotlinx.coroutines.runBlocking { Trials32bWidgets.redraw(app) } } }.start()
    }

    fun remove(ctx: Context, id: String) {
        val l = current(ctx).filter { it.id != id }
        sp(ctx).edit().putString("json", toJson(l).toString()).apply()
        data.value = l
    }

    /** Brukerskille: ny konto eller utlogging tømmer prøvene i widgetene. */
    fun useAccount(ctx: Context, acct: String?) {
        val p = sp(ctx)
        if (acct != null && p.getString("acct", null) == acct) return
        p.edit().remove("json").apply { if (acct != null) putString("acct", acct) else remove("acct") }.apply()
        data.value = emptyList()
    }

    private fun toJson(l: List<WTrial32b>) = JSONObject().put("items", JSONArray().apply {
        l.forEach { t ->
            put(JSONObject().put("id", t.id).put("service", t.name).put("endsAt", t.end.toString()).put("start", t.start?.toString() ?: JSONObject.NULL)
                .put("priceLabel", t.price).put("cancelUrl", t.cancelUrl ?: JSONObject.NULL).put("domain", t.domain))
        }
    })

    private fun s(o: JSONObject, vararg k: String): String? = k.firstNotNullOfOrNull { key -> if (!o.has(key) || o.isNull(key)) null else o.optString(key).takeIf { it.isNotBlank() && it != "null" } }

    /**
     * Godtar /api/widgets/trials ({items|trials|all:[…]} eller {next, rest|upcoming:[…]}), /finans/api/subscriptions/trials og eget lagret format.
     * Felt: id, service|name|n, endsAt|ends_at|end, start|created, priceLabel|price_text|priceAfter|price_after|p, cancelUrl, domain.
     */
    fun parse(raw: String): List<WTrial32b> {
        val tr = raw.trim()
        val arr = ArrayList<JSONObject>()
        if (tr.startsWith("[")) JSONArray(tr).let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let(arr::add) }
        else {
            val o = JSONObject(tr)
            o.optJSONObject("next")?.let(arr::add)
            (o.optJSONArray("items") ?: o.optJSONArray("trials") ?: o.optJSONArray("all") ?: o.optJSONArray("rest") ?: o.optJSONArray("upcoming"))?.let { a ->
                for (i in 0 until a.length()) a.optJSONObject(i)?.let(arr::add)
            }
        }
        return arr.mapNotNull { o ->
            val id = s(o, "id") ?: return@mapNotNull null
            if ((s(o, "status") ?: "active") != "active" || o.optBoolean("done")) return@mapNotNull null
            val end = s(o, "endsAt", "ends_at", "end")?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: return@mapNotNull null
            val name = s(o, "service", "name", "n") ?: "Prøve"
            val price = s(o, "priceLabel", "price_label", "price_text", "priceText") ?: o.opt("priceAfter").let { v -> if (v is Number) "${v.toInt()} kr/mnd" else null }
                ?: o.opt("price_after").let { v -> if (v is Number) "${v.toInt()} kr/mnd" else null } ?: o.opt("p").let { v -> if (v is Number) "${v.toInt()} kr/mnd" else null } ?: ""
            WTrial32b(id, name, end, trialStartOf32b(o), price, s(o, "cancelUrl", "cancel_url") ?: TRIAL_CANCEL31[name.lowercase()], s(o, "domain") ?: trialDomain32b(name))
        }.distinctBy { it.id }
    }

    /* Logoene: filesDir/trials32b/<domene>.png, hentet én gang (30 dager). */
    private fun logoFile(ctx: Context, domain: String) = File(File(ctx.filesDir, "trials32b").apply { mkdirs() }, domain.replace(Regex("[^A-Za-z0-9._-]"), "_") + ".png")

    fun logo(ctx: Context, domain: String): Bitmap? = runCatching {
        val f = logoFile(ctx, domain)
        if (f.exists() && f.length() > 0) BitmapFactory.decodeFile(f.path) else null
    }.getOrNull()

    suspend fun fetchLogos(ctx: Context, api: Api, l: List<WTrial32b>) {
        l.take(6).forEach { t ->
            val f = logoFile(ctx, t.domain)
            if (f.exists() && System.currentTimeMillis() - f.lastModified() < 30L * 24 * 3600_000) return@forEach
            runCatching {
                val b = api.bytes("/finans/api/logo/" + URLEncoder.encode(t.domain, "UTF-8"))
                val bmp = BitmapFactory.decodeByteArray(b, 0, b.size) ?: return@runCatching
                // Liten nok for widgeten (Glance sender bildene i RemoteViews).
                val sc = Bitmap.createScaledBitmap(bmp, 64, 64, true)
                f.outputStream().use { sc.compress(Bitmap.CompressFormat.PNG, 100, it) }
            }
        }
    }
}

/** Henter prøvene til widgetene (kompakt endepunkt, ellers FinansHub-listen) og logoene. */
internal suspend fun fetchTrials32b(ctx: Context, api: Api, acct: String?) {
    val raw = runCatching { api.hlGet("/widgets/trials", timeout = 8_000) }.getOrNull()
        ?: runCatching { api.get("/subscriptions/trials") }.getOrNull() ?: return
    Trials32bStore.saveRaw(ctx, raw, acct)
    runCatching { Trials32bStore.fetchLogos(ctx, api, Trials32bStore.current(ctx)) }
}

class Trials32bWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val acct = runCatching { FamilyPrefs.account(ctx) }.getOrNull()?.takeIf { it.isNotBlank() }
        Trials32bStore.useAccount(ctx, acct)
        FamilyPrefs.api(ctx)?.let { api -> runCatching { fetchTrials32b(ctx, api, acct) } }
        Trials32bWidgets.redraw(ctx)
        return Result.success()
    }
}

object Trials32bWidgets {
    private const val WORK = "finanshub-trials32b"

    val ALL: List<GlanceAppWidget> get() = listOf(TrialsWidget32bS(), TrialsWidget32bM(), S32bTrialsSmall(), S32bTrialsWide())

    suspend fun redraw(ctx: Context) { ALL.forEach { w -> runCatching { w.updateAll(ctx) } } }

    /** Hent med en gang (appen lagret/endret en prøve, eller en widget ble lagt til). */
    fun refreshNow(ctx: Context) {
        runCatching {
            val req = OneTimeWorkRequestBuilder<Trials32bWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            WorkManager.getInstance(ctx.applicationContext).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, req)
        }
    }
}

/* ---------------- Widgetene ---------------- */

/** kind: m_s · m_m (Material You) eller s_s · s_w (Samsung). */
abstract class TrialsW32b(private val kind: String) : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val d0 = Trials32bStore.current(context)
        provideContent {
            val d by Trials32bStore.data.collectAsState()
            val l = Trials32bStore.active(d ?: d0)
            val logos = l.take(3).associate { it.id to Trials32bStore.logo(context, it.domain) }
            GlanceTheme { Body32b(kind, l, logos) }
        }
    }
}

class TrialsWidget32bS : TrialsW32b("m_s")
class TrialsWidget32bM : TrialsW32b("m_m")
class S32bTrialsSmall : TrialsW32b("s_s")
class S32bTrialsWide : TrialsW32b("s_w")

/** Mottakerne: henter prøvene når den første widgeten legges til. */
abstract class Receiver32b : Receiver24() {
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        Trials32bWidgets.refreshNow(context)
    }
}

class TrialsReceiver32bS : Receiver32b() { override val glanceAppWidget: GlanceAppWidget = TrialsWidget32bS() }
class TrialsReceiver32bM : Receiver32b() { override val glanceAppWidget: GlanceAppWidget = TrialsWidget32bM() }
class S32bTrialsSmallReceiver : Receiver32b() { override val glanceAppWidget: GlanceAppWidget = S32bTrialsSmall() }
class S32bTrialsWideReceiver : Receiver32b() { override val glanceAppWidget: GlanceAppWidget = S32bTrialsWide() }

private val TRIAL32B = ActionParameters.Key<String>("trial32b_id")

/** «Avsluttet»: markerer prøven som avsluttet på serveren, fjerner påminnelsene og tegner widgetene på nytt. */
class Trial32bDone : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[TRIAL32B] ?: return
        Trials32bStore.remove(context, id)
        Trials32bWidgets.redraw(context)
        val api = FamilyPrefs.api(context) ?: return
        val enc = URLEncoder.encode(id, "UTF-8")
        val ok = runCatching { api.request("POST", "/widgets/trials/$enc", JSONObject().put("status", "cancelled").put("action", "done"), prefix = Api.HOMELAB) }.isSuccess ||
            runCatching { api.patch("/subscriptions/trials/$enc", JSONObject().put("status", "cancelled")) }.isSuccess
        if (!ok) return
        // Påminnelsene på telefonen planlegges på nytt uten denne prøven.
        runCatching {
            val raw = api.get("/subscriptions/trials")
            Notify31.scheduleTrials(context, parseTrials31(raw))
            Trials32bStore.saveRaw(context, raw, runCatching { FamilyPrefs.account(context) }.getOrNull())
        }
        Trials32bWidgets.redraw(context)
    }
}

/* ---------------- Felles ---------------- */

private fun openSubs32b(ctx: Context, path: String = ""): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://subs$path"), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

/** Oppsigelsessiden (nettleser), ellers Abonnement. */
private fun cancelAction32b(ctx: Context, t: WTrial32b): Action = t.cancelUrl?.let { u ->
    actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
} ?: openSubs32b(ctx)

private fun cp32b(c: Long) = ColorProvider(Color(c))
private fun cp32b(c: Color) = ColorProvider(c)

@Composable
private fun T32b(text: String, size: TextUnit, color: ColorProvider, weight: FontWeight = FontWeight.Normal, maxLines: Int = 1, modifier: GlanceModifier = GlanceModifier) =
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight), maxLines = maxLines)

/** Rund (eller avrundet) logo på hvit bunn; første bokstav hvis logoen mangler. */
@Composable
private fun Logo32b(t: WTrial32b, bmp: Bitmap?, size: Dp, radius: Dp = size / 2) {
    Box(GlanceModifier.size(size).cornerRadius(radius).background(cp32b(Color.White)), contentAlignment = Alignment.Center) {
        if (bmp != null) Image(ImageProvider(bmp), contentDescription = null, modifier = GlanceModifier.size(size * .78f).cornerRadius(radius), contentScale = ContentScale.Fit)
        else T32b(t.name.take(1).uppercase(), (size.value * .5f).sp, cp32b(0xFF1B1A17), FontWeight.Bold)
    }
}

/** Fremdriftslinje (andel av prøven brukt) med fast bredde. */
@Composable
private fun Bar32b(pct: Float, width: Dp, height: Dp, track: ColorProvider, fill: ColorProvider) {
    Box(GlanceModifier.width(width).height(height).cornerRadius(height / 2).background(track)) {
        Box(GlanceModifier.width((width * pct).coerceAtLeast(height)).height(height).cornerRadius(height / 2).background(fill)) {}
    }
}

private fun unit32b(d: Int): String = when (d) { 0 -> "siste dag"; 1 -> "dag igjen"; else -> "dager igjen" }

@Composable
private fun Body32b(kind: String, l: List<WTrial32b>, logos: Map<String, Bitmap?>) {
    when (kind) {
        "m_s" -> MSmall32b(l, logos)
        "m_m" -> MMedium32b(l, logos)
        "s_s" -> SSmall32b(l, logos)
        else -> SWide32b(l, logos)
    }
}

/* ---------------- Material You ---------------- */

@Composable
private fun MEmpty32b(ctx: Context, fg: ColorProvider, chip: ColorProvider, onChip: ColorProvider) {
    T32b("Ingen aktive prøver", 14.sp, fg, FontWeight.Bold, maxLines = 2)
    Spacer(GlanceModifier.height(8.dp))
    Box(GlanceModifier.height(32.dp).cornerRadius(16.dp).background(chip).padding(horizontal = 12.dp).clickable(openSubs32b(ctx, "/trial")), contentAlignment = Alignment.Center) {
        T32b("+ Legg til", 13.sp, onChip, FontWeight.Bold)
    }
}

/** 2 × 2: chip med logo og navn · stort tall · «dager igjen» · «før 149 kr/mnd». */
@Composable
private fun MSmall32b(l: List<WTrial32b>, logos: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    val t = l.firstOrNull()
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.primaryContainer).padding(16.dp).clickable(openSubs32b(ctx))) {
        if (t == null) { Spacer(GlanceModifier.defaultWeight()); MEmpty32b(ctx, c.onPrimaryContainer, c.secondaryContainer, c.onSecondaryContainer); return@Column }
        val dd = trialDays32b(t.end)
        Row(GlanceModifier.height(28.dp).cornerRadius(14.dp).background(c.secondaryContainer).padding(start = 4.dp, end = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Logo32b(t, logos[t.id], 20.dp)
            Spacer(GlanceModifier.width(6.dp))
            T32b(t.name, 12.sp, c.onSecondaryContainer, FontWeight.Medium)
        }
        Spacer(GlanceModifier.defaultWeight())
        T32b(if (dd == 0) "I dag" else "$dd", if (dd == 0) 36.sp else 52.sp, trialColor32b(dd)?.let { cp32b(it) } ?: c.onPrimaryContainer, FontWeight.Medium)
        T32b(unit32b(dd), 13.sp, c.onPrimaryContainer, FontWeight.Medium)
        T32b(if (t.price.isBlank()) "Avslutt før ${dShort31(t.end)}" else "før ${t.price}", 11.5.sp, c.onPrimaryContainer)
    }
}

/** 4 × 2: «Prøveperioder · 3 aktive», hovedkort med rund rød teller og Avsluttet, chips for de neste. */
@Composable
private fun MMedium32b(l: List<WTrial32b>, logos: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    val c = GlanceTheme.colors
    val size = LocalSize.current
    val t = l.firstOrNull()
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(c.primaryContainer).padding(16.dp).clickable(openSubs32b(ctx))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T32b("Prøveperioder", 15.sp, c.onPrimaryContainer, FontWeight.Medium, modifier = GlanceModifier.defaultWeight())
            T32b(if (l.isEmpty()) "" else "${l.size} aktive", 12.sp, c.onPrimaryContainer)
        }
        Spacer(GlanceModifier.height(10.dp))
        if (t == null) { MEmpty32b(ctx, c.onPrimaryContainer, c.secondaryContainer, c.onSecondaryContainer); return@Column }
        val dd = trialDays32b(t.end)
        Row(GlanceModifier.fillMaxWidth().cornerRadius(20.dp).background(c.surface).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(GlanceModifier.size(52.dp).cornerRadius(26.dp).background(cp32b(trialColor32b(dd) ?: 0xFFB23A2A)), horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
                T32b("$dd", 20.sp, cp32b(Color.White), FontWeight.Medium)
                T32b(if (dd == 1) "DAG" else "DAGER", 9.sp, cp32b(Color.White), FontWeight.Medium)
            }
            Spacer(GlanceModifier.width(12.dp))
            Column(GlanceModifier.defaultWeight()) {
                T32b(t.name, 15.sp, c.onSurface, FontWeight.Medium)
                T32b("Avslutt før ${dShort31(t.end)}" + (if (t.price.isNotBlank()) " · ${t.price}" else ""), 12.sp, c.onSurfaceVariant)
            }
            Spacer(GlanceModifier.width(8.dp))
            Box(GlanceModifier.height(36.dp).cornerRadius(18.dp).background(c.onPrimaryContainer).padding(horizontal = 14.dp)
                .clickable(actionRunCallback<Trial32bDone>(actionParametersOf(TRIAL32B to t.id))), contentAlignment = Alignment.Center) {
                T32b("Avsluttet", 13.sp, c.primaryContainer, FontWeight.Medium)
            }
        }
        val rest = l.drop(1).take(2)
        if (rest.isNotEmpty() && size.height >= 160.dp) {
            Spacer(GlanceModifier.height(8.dp))
            Row(GlanceModifier.fillMaxWidth()) {
                rest.forEachIndexed { i, x ->
                    if (i > 0) Spacer(GlanceModifier.width(8.dp))
                    Row(GlanceModifier.defaultWeight().height(40.dp).cornerRadius(20.dp).background(c.secondaryContainer).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Logo32b(x, logos[x.id], 18.dp)
                        Spacer(GlanceModifier.width(8.dp))
                        T32b(x.name, 13.sp, c.onSecondaryContainer, FontWeight.Medium, modifier = GlanceModifier.defaultWeight())
                        T32b("${trialDays32b(x.end)} d", 12.5.sp, c.onSecondaryContainer, FontWeight.Medium)
                    }
                }
            }
        }
    }
}

/* ---------------- Samsung One UI ---------------- */

private val SBG32B = 0xC7FFFFFF    // hvit 78 %
private val SFG32B = 0xFF111111
private val SSUB32B = 0xFF555555

/** 2 × 2: logo + navn · «2 d» · «igjen av prøven» · fremdriftslinje. */
@Composable
private fun SSmall32b(l: List<WTrial32b>, logos: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    val size = LocalSize.current
    val t = l.firstOrNull()
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(cp32b(SBG32B)).padding(16.dp).clickable(openSubs32b(ctx))) {
        if (t == null) {
            T32b("Prøveperioder", 13.sp, cp32b(SFG32B), FontWeight.Bold)
            Spacer(GlanceModifier.defaultWeight())
            MEmpty32b(ctx, cp32b(SFG32B), cp32b(Color.White), cp32b(SFG32B))
            return@Column
        }
        val dd = trialDays32b(t.end)
        val col = cp32b(trialColor32b(dd) ?: SFG32B)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Logo32b(t, logos[t.id], 26.dp)
            Spacer(GlanceModifier.width(8.dp))
            T32b(t.name, 13.sp, cp32b(SFG32B), FontWeight.Bold)
        }
        Spacer(GlanceModifier.defaultWeight())
        Row(verticalAlignment = Alignment.Bottom) {
            T32b(if (dd == 0) "I dag" else "$dd", 40.sp, col, FontWeight.Bold)
            if (dd > 0) T32b(" d", 15.sp, col, FontWeight.Medium)
        }
        T32b("igjen av prøven", 12.sp, cp32b(SSUB32B))
        Spacer(GlanceModifier.height(6.dp))
        Bar32b(trialPct32b(t.end, t.start), (size.width - 32.dp).coerceAtLeast(40.dp), 6.dp, cp32b(0x1A000000), col)
    }
}

/** 4 × 2: «Prøveperioder» + «+» · rader (logo, navn, pris, dager, linje) · «Avslutt {navn}». */
@Composable
private fun SWide32b(l: List<WTrial32b>, logos: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    val size = LocalSize.current
    val t = l.firstOrNull()
    // Hvor mange rader som får plass: overskrift 30, pille 34, rad ca. 36 dp.
    val rows = ((size.height - 32.dp - 30.dp - 46.dp) / 38.dp).toInt().coerceIn(1, 3)
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(28.dp).background(cp32b(SBG32B)).padding(horizontal = 18.dp, vertical = 16.dp).clickable(openSubs32b(ctx))) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T32b("Prøveperioder", 15.sp, cp32b(SFG32B), FontWeight.Bold, modifier = GlanceModifier.defaultWeight())
            Box(GlanceModifier.size(30.dp).cornerRadius(15.dp).background(cp32b(Color.White)).clickable(openSubs32b(ctx, "/trial")), contentAlignment = Alignment.Center) {
                T32b("+", 17.sp, cp32b(SFG32B), FontWeight.Medium)
            }
        }
        if (t == null) { Spacer(GlanceModifier.height(10.dp)); T32b("Ingen aktive prøver", 14.sp, cp32b(SSUB32B)); return@Column }
        val barW = (size.width - 36.dp - 36.dp).coerceAtLeast(40.dp)
        // Én Column per rad: Glance tillater maks 10 barn i en Row/Column.
        l.take(rows).forEach { x ->
            val xd = trialDays32b(x.end)
            val col = cp32b(trialColor32b(xd) ?: SFG32B)
            Column(GlanceModifier.fillMaxWidth().padding(top = 8.dp)) {
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Logo32b(x, logos[x.id], 26.dp)
                    Spacer(GlanceModifier.width(10.dp))
                    T32b(x.name, 14.sp, cp32b(SFG32B), FontWeight.Medium, modifier = GlanceModifier.defaultWeight())
                    if (x.price.isNotBlank()) { T32b(x.price, 12.sp, cp32b(0xFF666666)); Spacer(GlanceModifier.width(8.dp)) }
                    T32b("$xd d", 14.sp, col, FontWeight.Bold)
                }
                Spacer(GlanceModifier.height(4.dp))
                Row(GlanceModifier.fillMaxWidth()) {
                    Spacer(GlanceModifier.width(36.dp))
                    Bar32b(trialPct32b(x.end, x.start), barW, 5.dp, cp32b(0x14000000), col)
                }
            }
        }
        Spacer(GlanceModifier.defaultWeight())
        Box(GlanceModifier.height(34.dp).cornerRadius(17.dp).background(cp32b(0xFF1259C3)).padding(horizontal = 16.dp).clickable(cancelAction32b(ctx, t)), contentAlignment = Alignment.Center) {
            T32b("Avslutt ${t.name}", 13.sp, cp32b(Color.White), FontWeight.Bold)
        }
    }
}
