package no.kristo.finanshub.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
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
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlinx.coroutines.flow.MutableStateFlow
import no.kristo.finanshub.Api
import no.kristo.finanshub.ApiException
import no.kristo.finanshub.MainActivity
import no.kristo.finanshub.family.FamilyPrefs
import no.kristo.finanshub.lastFix50
import no.kristo.finanshub.sendOrQueue51
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import androidx.glance.color.ColorProvider as DayNight51

/*
 * Prompt 51 (ANDPLAT51): nye hjemskjerm-widgets (Glance), samme som iOS-widgetene i runde 3:
 *  - «Planlegging · saldo» (2 × 2 og 4 × 2): laveste saldo de neste 30 dagene (GET /finans/api/fin51/calendar?days=30 → lowest),
 *    hvilken konto og dag, og de neste trekkene. Trykk → Planlegging (finanshub://plan, ANDFEAT51).
 *  - «Sjekk inn» (2 × 2): «Alt bra» sender en innsjekk til familien med ett trykk (POST /api/family/checkin {to, quick:'ok', lat?, lon?});
 *    posisjonen sendes bare med selve innsjekken. «Hent meg» åpner Sjekk inn i appen (bekreftes der – høy prioritet skal ikke sendes
 *    ved et uhell fra hjemskjermen). Uten nett legges innsjekken i offline-køen (Offline51Plat.kt).
 *  - Pakker og avganger finnes fra før (PackagesWidget, Ruter27-widgetene) og er uendret.
 * Data hentes av WidgetWorker hvert 15. minutt ([fetchPlat51]) og lagres per konto (samme regel som de andre widgetene).
 * Tilgjengelighet: knappene har innholdsbeskrivelse, tekst i sp (skalerer med systemets tekststørrelse), trykkflater ≥ 48 dp.
 */

data class WPlanItem51(val date: String, val name: String, val amount: Double)
data class WPlan51(val balance: Double?, val account: String?, val date: String?, val items: List<WPlanItem51>, val warn: String?, val at: Long)
data class WCheckin51(val people: List<String>, val sentAt: Long?, val sentText: String?)

private val OSLO51: ZoneId = ZoneId.of("Europe/Oslo")

object Plat51Store {
    private const val FILE = "widgets51plat"
    val plan = MutableStateFlow<WPlan51?>(null)
    val checkin = MutableStateFlow<WCheckin51?>(null)
    private fun sp(ctx: Context) = ctx.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun currentPlan(ctx: Context): WPlan51? = plan.value ?: sp(ctx).getString("plan", null)?.let { runCatching { parsePlan(it, sp(ctx).getLong("planAt", 0L)) }.getOrNull() }?.also { plan.value = it }

    fun currentCheckin(ctx: Context): WCheckin51 = checkin.value ?: run {
        val p = sp(ctx)
        val ids = runCatching { JSONArray(p.getString("people", "[]")).let { a -> (0 until a.length()).map { a.optString(it) } } }.getOrDefault(emptyList())
        WCheckin51(ids.filter { it.isNotBlank() }, p.getLong("sentAt", 0L).takeIf { it > 0 }, p.getString("sentText", null))
    }.also { checkin.value = it }

    fun savePlan(ctx: Context, raw: String) {
        val now = System.currentTimeMillis()
        val pl = runCatching { parsePlan(raw, now) }.getOrNull() ?: return
        sp(ctx).edit().putString("plan", raw).putLong("planAt", now).apply()
        plan.value = pl
    }

    fun savePeople(ctx: Context, ids: List<String>) {
        sp(ctx).edit().putString("people", JSONArray(ids).toString()).apply()
        checkin.value = currentCheckin(ctx).copy(people = ids)
    }

    fun sent(ctx: Context, text: String) {
        val now = System.currentTimeMillis()
        sp(ctx).edit().putLong("sentAt", now).putString("sentText", text).apply()
        checkin.value = currentCheckin(ctx).copy(sentAt = now, sentText = text)
    }

    /** Ny konto eller utlogging: ingenting fra en annen konto vises. */
    fun useAccount(ctx: Context, acct: String?) {
        val p = sp(ctx)
        if (acct != null && p.getString("acct", null) == acct) return
        p.edit().clear().apply { if (acct != null) putString("acct", acct) }.apply()
        plan.value = null
        checkin.value = WCheckin51(emptyList(), null, null)
    }

    /** /finans/api/fin51/calendar → laveste saldo + de neste trekkene (utgifter fra i dag). */
    fun parsePlan(raw: String, at: Long): WPlan51 {
        val o = JSONObject(raw)
        val low = o.optJSONObject("lowest")
        val today = LocalDate.now(OSLO51).toString()
        val items = o.optJSONArray("items")?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }.orEmpty()
            .filter { it.optDouble("amount", 0.0) < 0 && it.optString("date") >= today }
            .sortedBy { it.optString("date") }
            .map { WPlanItem51(it.optString("date"), it.optString("name").ifBlank { "Trekk" }, it.optDouble("amount", 0.0)) }
        val warn = o.optJSONArray("warnings")?.optString(0)?.takeIf { it.isNotBlank() }
        return WPlan51(
            low?.let { if (it.has("balance") && !it.isNull("balance")) it.optDouble("balance") else null },
            low?.optString("account")?.takeIf { it.isNotBlank() }, low?.optString("date")?.takeIf { it.isNotBlank() },
            items.take(4), warn, at,
        )
    }
}

/** Fra WidgetWorker: Planlegging-saldo og mottakerne for «Alt bra». 404 = eldre server (widgeten viser «Ikke tilgjengelig»). */
internal suspend fun fetchPlat51(ctx: Context, api: Api, acct: String?) {
    Plat51Store.useAccount(ctx, acct)
    runCatching { Plat51Store.savePlan(ctx, api.get("/fin51/calendar?days=30")) }
    runCatching {
        val o = JSONObject(api.hlGet("/family/checkin", timeout = 10_000))
        val ids = o.optJSONArray("people")?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }.orEmpty()
            .filter { !it.optBoolean("self") }.mapNotNull { (it.optString("userId").ifBlank { it.optString("id") }).takeIf { s -> s.isNotBlank() } }
        Plat51Store.savePeople(ctx, ids)
    }
    Plat51Widgets.redraw(ctx)
}

object Plat51Widgets {
    suspend fun redraw(ctx: Context) {
        runCatching { Plan51SaldoWidget().updateAll(ctx) }
        runCatching { Checkin51Widget().updateAll(ctx) }
    }
}

/* ---------------- Farger (papir, lys/mørk) ---------------- */

private val BG51 = DayNight51(day = Color(0xFFF7F2E8), night = Color(0xFF1E1B17))
private val INK51 = DayNight51(day = Color(0xFF2B2620), night = Color(0xFFF2ECE1))
private val MUT51 = DayNight51(day = Color(0xFF6E665A), night = Color(0xFFB9B0A2))
private val CHIP51 = DayNight51(day = Color(0xFFEDE5D6), night = Color(0xFF2C2822))
private val RED51 = ColorProvider(Color(0xFFB4442F))
private val GREEN51 = ColorProvider(Color(0xFF2F7A4F))
private val WHITE51 = ColorProvider(Color.White)

private fun open51(ctx: Context, link: String): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

private fun kr51(v: Double): String = NumberFormat.getIntegerInstance(Locale.forLanguageTag("nb-NO")).format(Math.round(v)) + " kr"

private fun day51(d: String?): String = runCatching {
    val ld = LocalDate.parse(d!!.take(10))
    val today = LocalDate.now(OSLO51)
    when (ld) { today -> "i dag"; today.plusDays(1) -> "i morgen"; else -> ld.format(DateTimeFormatter.ofPattern("EEE d. MMM", Locale.forLanguageTag("nb-NO"))) }
}.getOrDefault(d ?: "")

/* ---------------- Planlegging · saldo ---------------- */

class Plan51SaldoWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val d0 = Plat51Store.currentPlan(context)
        provideContent {
            val d by Plat51Store.plan.collectAsState()
            GlanceTheme { PlanBody51(d ?: d0) }
        }
    }
}

@Composable
private fun PlanBody51(p: WPlan51?) {
    val ctx = LocalContext.current
    val wide = LocalSize.current.width >= 220.dp
    val desc = if (p?.balance == null) "Planlegging, saldo ikke tilgjengelig" else "Laveste saldo ${kr51(p.balance)} ${day51(p.date)}"
    Column(
        GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(24.dp).background(BG51).padding(14.dp)
            .clickable(open51(ctx, "finanshub://plan")).semantics { contentDescription = desc },
    ) {
        Text("PLANLEGGING", style = TextStyle(color = MUT51, fontSize = 11.sp, fontWeight = FontWeight.Bold))
        Spacer(GlanceModifier.height(4.dp))
        if (p?.balance == null) {
            Text("Ikke tilgjengelig ennå", style = TextStyle(color = INK51, fontSize = 15.sp, fontWeight = FontWeight.Medium))
            Text("Åpne Planlegging i appen", style = TextStyle(color = MUT51, fontSize = 12.sp))
            return@Column
        }
        Text("Laveste saldo", style = TextStyle(color = MUT51, fontSize = 12.sp))
        Text(kr51(p.balance), style = TextStyle(color = if (p.balance < 0) RED51 else INK51, fontSize = if (wide) 28.sp else 24.sp, fontWeight = FontWeight.Bold), maxLines = 1)
        Text(listOfNotNull(p.account, day51(p.date).takeIf { it.isNotBlank() }).joinToString(" · "), style = TextStyle(color = MUT51, fontSize = 12.sp), maxLines = 1)
        if (wide && p.items.isNotEmpty()) {
            Spacer(GlanceModifier.height(8.dp))
            p.items.take(3).forEach { i ->
                Row(GlanceModifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(day51(i.date), style = TextStyle(color = MUT51, fontSize = 12.sp), modifier = GlanceModifier.width(76.dp), maxLines = 1)
                    Text(i.name, style = TextStyle(color = INK51, fontSize = 13.sp), modifier = GlanceModifier.defaultWeight(), maxLines = 1)
                    Text(kr51(i.amount), style = TextStyle(color = INK51, fontSize = 13.sp, fontWeight = FontWeight.Medium), maxLines = 1)
                }
            }
        } else if (p.warn != null) {
            Spacer(GlanceModifier.height(6.dp))
            Text(p.warn, style = TextStyle(color = RED51, fontSize = 12.sp), maxLines = 2)
        }
    }
}

/* ---------------- Sjekk inn ---------------- */

class Checkin51Widget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val d0 = Plat51Store.currentCheckin(context)
        provideContent {
            val d by Plat51Store.checkin.collectAsState()
            GlanceTheme { CheckinBody51(d ?: d0) }
        }
    }
}

@Composable
private fun CheckinBody51(c: WCheckin51) {
    val ctx = LocalContext.current
    val sent = c.sentAt?.takeIf { System.currentTimeMillis() - it < 3 * 3600_000L }
    Column(GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(24.dp).background(BG51).padding(12.dp)) {
        Text("SJEKK INN", style = TextStyle(color = MUT51, fontSize = 11.sp, fontWeight = FontWeight.Bold),
            modifier = GlanceModifier.clickable(open51(ctx, "finanshub://familie/sjekk")))
        Text(
            if (sent != null) (c.sentText ?: "Sendt") + " · " + Instant.ofEpochMilli(sent).atZone(OSLO51).format(DateTimeFormatter.ofPattern("HH:mm"))
            else if (c.people.isEmpty()) "Åpne appen én gang for å velge familien" else "Si fra til familien",
            style = TextStyle(color = INK51, fontSize = 13.sp), maxLines = 2,
        )
        Spacer(GlanceModifier.defaultWeight())
        Btn51("Alt bra", "Sjekk inn: alt bra", GREEN51, WHITE51,
            if (c.people.isEmpty()) open51(ctx, "finanshub://familie/sjekk") else actionRunCallback<Checkin51Ok>())
        Spacer(GlanceModifier.height(6.dp))
        Btn51("Hent meg", "Hent meg – åpner Sjekk inn for å bekrefte", CHIP51, INK51, open51(ctx, "finanshub://familie/sjekk"))
    }
}

@Composable
private fun Btn51(text: String, desc: String, bg: ColorProvider, fg: ColorProvider, action: Action) {
    Box(
        GlanceModifier.fillMaxWidth().height(48.dp).cornerRadius(24.dp).background(bg).clickable(action).semantics { contentDescription = desc },
        contentAlignment = Alignment.Center,
    ) { Text(text, style = TextStyle(color = fg, fontSize = 15.sp, fontWeight = FontWeight.Bold), maxLines = 1) }
}

/** «Alt bra»: innsjekk til familien (posisjonen bare med denne innsjekken). Uten nett: offline-køen. */
class Checkin51Ok : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val c = Plat51Store.currentCheckin(context)
        val api = FamilyPrefs.api(context) ?: return
        if (c.people.isEmpty()) return
        val b = JSONObject().put("to", JSONArray(c.people)).put("quick", "ok")
        lastFix50(context)?.let { b.put("lat", it.latitude).put("lon", it.longitude).put("acc", it.accuracy.toDouble()) }
        val text = try {
            if (sendOrQueue51(context, api, "POST", "/family/checkin", b, "Sjekk inn: alt bra", kind = "checkin")) "Sendt: alt bra" else "I kø – sendes med nett"
        } catch (e: ApiException) { "Feil: " + (e.message ?: "ikke sendt") }
        Plat51Store.sent(context, text)
        Plat51Widgets.redraw(context)
    }
}

class Plan51SaldoReceiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = Plan51SaldoWidget() }
class Checkin51Receiver : Receiver24() { override val glanceAppWidget: GlanceAppWidget = Checkin51Widget() }
