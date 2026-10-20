package no.kristo.finanshub

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import no.kristo.finanshub.family.FamilyPrefs
import no.kristo.finanshub.family.FamilyService
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

/*
 * Prompt 40 (ANDROID40): Hjemlys (claude-code-hjemlys.md, fasit Hjemme trygt Varianter.dc.html 2b).
 *
 * Server (SERVER40, tåler 404): POST /api/hjemlys/start {eta, mode, waitMin, recipients?} → {session}; GET /api/hjemlys →
 * {mine|null, household:[{userId, name, avatar, state, eta, since}]}; PATCH /api/hjemlys/:id {eta?, pos?, battery?, signal?,
 * unlockedAt?, plus?} (maks hvert 30. s / 50 m); POST …/:id/ok | /home | /end; GET /api/hjemlys/suggest; sanntid «hjemlys».
 *
 * Android 16+: «promoted ongoing» Live Update med Notification.ProgressStyle (segmenter per etappe, punkt for hvor du er),
 * shortCriticalText («8 min» som brikke i statuslinja). Alt det nye kalles med refleksjon bak SDK_INT-sjekk (compileSdk 35).
 * Android 12–15: vanlig pågående varsel (setOngoing, setProgress, CATEGORY_NAVIGATION) med samme tekst og knapper.
 * Samsung One UI 7+: samme varsel vises i Now Bar (Samsungs Live Notification-felt legges på som extras der de finnes).
 * Forgrunnstjeneste type «location» mens Hjemlys er aktivt; stoppes når du er hjemme eller avslutter.
 * Personvern: posisjon/batteri sendes til serveren, som deler dem med husstanden først når økta er «late».
 */

data class HlMember40(val userId: String, val name: String, val avatar: String?, val state: String, val eta: String?, val since: String?, val share: JSONObject?)
data class HlSession40(
    val id: String, val userId: String?, val name: String?, val state: String, val eta: String?, val startedAt: String?, val waitMin: Int,
    val progress: Double?, val leg: String?, val lateMinutes: Int?, val recipients: List<String>, val share: JSONObject?,
)
data class Hjemlys40(val mine: HlSession40?, val household: List<HlMember40>)
data class HlSuggest40(val suggest: Boolean, val reason: String?, val eta: String?, val text: String? = null, val recipients: List<String> = emptyList())
/** 1a: reisemåter fra GET /api/hjemlys/route → {from:{name, km}, options:[{mode, label, legs, eta, minutes}], geometry?}. */
data class HlOption40(val mode: String, val label: String, val legs: List<String>, val eta: String?, val minutes: Int?)
data class HlRoute40(val fromName: String?, val km: Double?, val options: List<HlOption40>, val geometry: List<Pair<Double, Double>>)
data class HlLog40(val at: String?, val text: String, val who: String?)

internal fun parseHlRoute40(raw: String): HlRoute40 {
    val o = JSONObject(raw)
    val f = o.optJSONObject("from")
    val opts = o.optJSONArray("options")?.let { a -> (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { x ->
        HlOption40(x.s37("mode") ?: "kollektiv", x.s37("label") ?: x.s37("mode") ?: "", x.optJSONArray("legs")?.let { l -> (0 until l.length()).map { k -> l.optJSONObject(k)?.let { it.s37("label") ?: it.s37("mode") } ?: l.optString(k) }.filter { it.isNotBlank() } } ?: emptyList(),
            x.s37("eta"), if (x.has("minutes")) x.optInt("minutes") else null)
    } } } ?: emptyList()
    val g = o.opt("geometry")
    val pts = ArrayList<Pair<Double, Double>>()
    val arr = (g as? JSONArray) ?: (g as? JSONObject)?.optJSONArray("coordinates")
    if (arr != null) for (i in 0 until arr.length()) {
        val e = arr.opt(i)
        when (e) {
            is JSONArray -> if (e.length() >= 2) pts += e.optDouble(1) to e.optDouble(0) // GeoJSON [lon, lat]
            is JSONObject -> pts += e.optDouble("lat") to e.optDouble("lon")
        }
    }
    return HlRoute40(f?.s37("name"), f?.optDouble("km", Double.NaN)?.takeIf { !it.isNaN() }, opts, pts.filter { !it.first.isNaN() && !it.second.isNaN() })
}

internal fun parseHlSession40(o: JSONObject?): HlSession40? {
    o ?: return null
    val id = o.s37("id") ?: return null
    return HlSession40(id, o.s37("userId"), o.s37("name"), o.s37("state") ?: "onTheWay", o.s37("eta"), o.s37("startedAt"), o.optInt("waitMin", 15),
        o.optDouble("progress", Double.NaN).takeIf { !it.isNaN() }, o.s37("leg"), if (o.has("lateMinutes")) o.optInt("lateMinutes") else null,
        o.optJSONArray("recipients")?.let { a -> (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { it.s37("name") ?: it.s37("userId") } ?: a.optString(i).takeIf { it.isNotBlank() } } } ?: emptyList(),
        o.optJSONObject("share"))
}

internal fun parseHl40(raw: String): Hjemlys40 {
    val o = JSONObject(raw)
    val hh = o.optJSONArray("household")?.let { a -> (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { m ->
        HlMember40(m.s37("userId") ?: return@let null, m.s37("name") ?: "", m.s37("avatar"), m.s37("state") ?: "onTheWay", m.s37("eta"), m.s37("since"), m.optJSONObject("share"))
    } } } ?: emptyList()
    return Hjemlys40(parseHlSession40(o.optJSONObject("mine") ?: o.optJSONObject("session")), hh)
}

private val OSLO_HL40: ZoneId = ZoneId.of("Europe/Oslo")

/** «23:38» fra ISO-tid. */
fun hlClock40(iso: String?): String? = iso?.let { runCatching { Instant.parse(it).atZone(OSLO_HL40).let { z -> "%02d:%02d".format(z.hour, z.minute) } }.getOrNull() }

/** Minutter igjen til forventet tid (negativt = over tiden). */
fun hlMinutes40(iso: String?, now: Long = System.currentTimeMillis()): Int? = iso?.let { runCatching { Math.floorDiv(Instant.parse(it).toEpochMilli() - now + 30_000, 60_000L).toInt() }.getOrNull() }

/* ======================= Appen (AppViewModel) ======================= */

fun AppViewModel.loadHjemlys40(force: Boolean = false) {
    val s = p40
    if (!force && System.currentTimeMillis() - s.hlAt < 20_000 && (s.hl != null || s.hlMissing)) return
    s.hlAt = System.currentTimeMillis()
    launch40 {
        try {
            val h = parseHl40(api40 { hlGet("/hjemlys", timeout = 8_000) })
            s.hl = h; s.hlMissing = false
            Hjemlys40Prefs.sync(appCtx40, h.mine, account?.id)
            Hjemlys40Notify.household(appCtx40, h.household, myUserId40() ?: h.mine?.userId)
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404) s.hlMissing = true
        } catch (_: Exception) { }
        if (!s.hlMissing) runCatching {
            val o = JSONObject(api40 { hlGet("/hjemlys/suggest", timeout = 6_000) })
            val sug = HlSuggest40(o.optBoolean("suggest", false), o.s37("reason"), o.s37("eta"), o.s37("text"),
                o.optJSONArray("recipients")?.let { a -> (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { it.s37("name") } ?: a.optString(i).takeIf { it.isNotBlank() } } } ?: emptyList())
            s.hlSuggest = sug
            // 1b: Glimt foreslår som varsel («Ja, start» / «Ikke nå»), høyst én gang per forslag og dag.
            if (sug.suggest && s.hl?.mine == null) Hjemlys40Notify.suggest(appCtx40, sug)
        }
    }
}

/** 1a: reisemåtene og ruten hjem (mock på serveren uten nøkkel). 404 → bare egen tid. */
fun AppViewModel.loadHlRoute40(mode: String? = null) {
    val s = p40
    launch40 {
        runCatching { parseHlRoute40(api40 { hlGet("/hjemlys/route" + (mode?.let { "?mode=" + java.net.URLEncoder.encode(it, "UTF-8") } ?: ""), timeout = 10_000) }) }
            .onSuccess { s.hlRoute = it; if (s.hlMode == null) s.hlMode = it.options.firstOrNull()?.mode }
    }
}

/** 1b: familiens logg for økta (GET /api/hjemlys/:id/log → [{at, text, who}]). */
fun AppViewModel.loadHlLog40(id: String) {
    val s = p40
    launch40 {
        runCatching {
            val raw = api40 { hlGet("/hjemlys/" + java.net.URLEncoder.encode(id, "UTF-8") + "/log", timeout = 8_000) }
            val a = runCatching { JSONArray(raw) }.getOrNull() ?: JSONObject(raw).optJSONArray("log") ?: JSONArray()
            s.hlLog = (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { HlLog40(it.s37("at"), it.s37("text") ?: "", it.s37("who")) } }
        }
    }
}

/** «Ikke nå» på Glimt-forslaget: ikke spør igjen i dag. */
fun snoozeSuggest40(ctx: Context) {
    ctx.applicationContext.getSharedPreferences("hjemlys40", Context.MODE_PRIVATE).edit().putString("snooze", java.time.LocalDate.now().toString()).apply()
    (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(Hjemlys40Notify.ID_SUGGEST)
}

/** Start: forventet tid, reisemåte (1a), mottakere = husstanden, ventetid 5/10/15/30 min. */
fun AppViewModel.startHjemlys40(etaMs: Long, waitMin: Int, mode: String = p40.hlMode ?: "egen") {
    val s = p40
    if (s.hlBusy) return
    s.hlBusy = true
    launch40 {
        try {
            val body = JSONObject().put("eta", Instant.ofEpochMilli(etaMs).toString()).put("mode", mode).put("waitMin", waitMin)
            val o = JSONObject(api40 { hlPost("/hjemlys/start", body) })
            val ses = parseHlSession40(o.optJSONObject("session") ?: o)
            Haptics.success() // siden blir stående og viser den aktive økta
            ses?.id?.let { loadHlLog40(it) }
            if (ses != null) {
                s.hl = (s.hl ?: Hjemlys40(null, emptyList())).copy(mine = ses)
                Hjemlys40Prefs.sync(appCtx40, ses, account?.id)
                Hjemlys40Service.start(appCtx40)
            }
            flash("Vel fremme er på · husstanden ser at du er på vei")
            loadHjemlys40(force = true)
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            message = if (e.status == 404) "Vel fremme finnes ikke på serveren ennå. Oppdater Homelab." else e.message
        } catch (e: Exception) { message = e.message } finally { s.hlBusy = false }
    }
}

/** «+ 10 min», «Jeg er hjemme», «Alt OK» og «Avslutt» fra appen (samme som knappene i varselet). */
fun AppViewModel.hjemlysAct40(act: String) {
    val id = p40.hl?.mine?.id ?: return
    Haptics.tap()
    launch40 {
        val r = runCatching { if (act == "plus15") Hjemlys40Api.act(api40 { this }, id, "plus", 15) else Hjemlys40Api.act(api40 { this }, id, act) }
        r.exceptionOrNull()?.let { message = it.message }
        r.getOrNull()?.let { ses -> Hjemlys40Prefs.sync(appCtx40, ses, account?.id); Hjemlys40Service.refresh(appCtx40) }
        if (act == "home" || act == "end") { Hjemlys40Prefs.clear(appCtx40); Hjemlys40Service.stop(appCtx40) }
        loadHjemlys40(force = true)
    }
}

/** Sanntid «hjemlys» {session|household|…}: oppdater kortene og varslene (mottakere: «sen» i egen kanal, «er hjemme»). */
fun AppViewModel.onHjemlys40(msg: JSONObject) {
    val ses = parseHlSession40(msg.optJSONObject("session") ?: msg.takeIf { it.has("id") && it.has("state") })
    val me = myUserId40()
    val mine = p40.hl?.mine
    if (ses != null && ses.userId != null && ses.id != mine?.id && ses.userId != me && ses.userId != mine?.userId) {
        Hjemlys40Notify.other(appCtx40, ses)
    }
    loadHjemlys40(force = true)
}

/** Brukerens id på serveren (Familie), så egen økt ikke vises som «husstanden». */
fun AppViewModel.myUserId40(): String? = family?.me?.userId ?: p40.hl?.mine?.userId

/** Fra WidgetWorker (hvert 15. min, også når appen er lukket): varsler om husstanden («sen» / «er hjemme») og egen økt. */
suspend fun pollHjemlys40(ctx: Context, api: Api) {
    val h = runCatching { parseHl40(api.hlGet("/hjemlys", timeout = 8_000)) }.getOrNull() ?: return
    val hadMine = Hjemlys40Prefs.session(ctx) != null
    Hjemlys40Prefs.sync(ctx, h.mine, null)
    if (hadMine && h.mine == null) Hjemlys40Service.stop(ctx) else if (h.mine != null) Hjemlys40Service.refresh(ctx)
    Hjemlys40Notify.household(ctx, h.household, h.mine?.userId)
}

/* ======================= Delt mellom appen, tjenesten og knappene ======================= */

object Hjemlys40Api {
    /** act: plus | home | ok | end. */
    suspend fun act(api: Api, id: String, act: String, plus: Int = 10): HlSession40? {
        val e = java.net.URLEncoder.encode(id, "UTF-8")
        val raw = when (act) {
            "plus" -> api.request("PATCH", "/hjemlys/$e", JSONObject().put("plus", plus), prefix = Api.HOMELAB)
            "home" -> api.hlPost("/hjemlys/$e/home")
            "ok" -> api.hlPost("/hjemlys/$e/ok")
            else -> api.hlPost("/hjemlys/$e/end")
        }
        return runCatching { JSONObject(raw).let { parseHlSession40(it.optJSONObject("session") ?: it) } }.getOrNull()
    }
}

/** Økta på telefonen (tjenesten og knappene i varselet trenger den uten at appen er åpen). */
object Hjemlys40Prefs {
    private fun sp(ctx: Context) = ctx.applicationContext.getSharedPreferences("hjemlys40", Context.MODE_PRIVATE)

    fun sync(ctx: Context, s: HlSession40?, acct: String?) {
        if (s == null || s.state == "home" || s.state == "ended") { clear(ctx); return }
        sp(ctx).edit().putString("id", s.id).putString("state", s.state).putString("eta", s.eta).putInt("wait", s.waitMin)
            .putString("leg", s.leg).putFloat("progress", (s.progress ?: -1.0).toFloat()).putInt("late", s.lateMinutes ?: 0)
            .putString("recipients", JSONArray(s.recipients).toString()).putString("acct", acct).apply()
        runCatching { no.kristo.finanshub.widget.HjemlysWidget40.redraw(ctx) }
    }

    fun clear(ctx: Context) {
        val p = sp(ctx)
        val keep = p.all.filterKeys { it == "snooze" || it == "sugShown" }
        p.edit().clear().apply { keep.forEach { (k, v) -> putString(k, v as? String) } }.apply()
        runCatching { no.kristo.finanshub.widget.HjemlysWidget40.redraw(ctx) }
    }

    fun session(ctx: Context): HlSession40? {
        val p = sp(ctx)
        val id = p.getString("id", null) ?: return null
        val rec = runCatching { JSONArray(p.getString("recipients", "[]")).let { a -> (0 until a.length()).map { a.optString(it) } } }.getOrDefault(emptyList())
        return HlSession40(id, null, null, p.getString("state", "onTheWay") ?: "onTheWay", p.getString("eta", null), null, p.getInt("wait", 15),
            p.getFloat("progress", -1f).toDouble().takeIf { it >= 0 }, p.getString("leg", null), p.getInt("late", 0), rec, null)
    }

    fun api(ctx: Context): Api? = FamilyPrefs.api(ctx) ?: run {
        val store = AccountStore(ctx)
        val list = runCatching { store.load() }.getOrDefault(emptyList())
        val acc = list.firstOrNull { it.id == store.active() } ?: list.firstOrNull() ?: return null
        val base = listOf(acc.server, acc.external, acc.local).firstOrNull { it.isNotBlank() } ?: return null
        Api(base, acc.token)
    }
}

/* ======================= Varslene (Live Update) ======================= */

object Hjemlys40Notify {
    const val CH = "hjemlys40"
    const val CH_LATE = "hjemlys40_sen"
    const val CH_FOLLOW = "hjemlys40_folg"
    const val ID = 7400
    const val ID_SUGGEST = 7399
    private const val GREEN = 0xFF2F9E5B.toInt()
    private const val RED = 0xFFD9412E.toInt()
    private const val GOLD = 0xFFF2A93B.toInt()

    /** Lite ikon (glødende prikk). */
    internal fun icon(ctx: Context): Int = R.drawable.ic_hjemlys40

    fun channels(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CH) == null) nm.createNotificationChannel(NotificationChannel(CH, "Vel fremme · på vei hjem", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Live Update mens Vel fremme er på (tid igjen, etapper, + 10 min og Jeg er hjemme)"
            setSound(null, null); enableVibration(false); setShowBadge(false)
        })
        // Høy viktighet for «sen» (kan overstyre Ikke forstyrr hvis brukeren tillater det for kanalen).
        if (nm.getNotificationChannel(CH_LATE) == null) nm.createNotificationChannel(NotificationChannel(CH_LATE, "Vel fremme · noen er sen", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Når noen i husstanden ikke er hjemme til forventet tid og ikke har svart"
            enableVibration(true); setBypassDnd(true); lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        })
        if (nm.getNotificationChannel(CH_FOLLOW) == null) nm.createNotificationChannel(NotificationChannel(CH_FOLLOW, "Vel fremme · følg hjem", NotificationManager.IMPORTANCE_LOW).apply {
            description = "«Følg … hjem» mens noen i husstanden har Vel fremme på, og «er hjemme»"
            setShowBadge(false)
        })
    }

    private fun open(ctx: Context, code: Int): PendingIntent = PendingIntent.getActivity(ctx, code,
        Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://familie"), ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun action(ctx: Context, act: String, code: Int): PendingIntent = PendingIntent.getBroadcast(ctx, code,
        Intent(ctx, Hjemlys40Receiver::class.java).setAction(Hjemlys40Receiver.ACTION).putExtra("act", act), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** Etappene («Gå · Trikk 19 · Gå») fra leg-teksten. */
    private fun legs(leg: String?): List<String> = leg?.split(Regex("\\s*[·,>→]\\s*"))?.map { it.trim() }?.filter { it.isNotEmpty() }?.take(4)?.ifEmpty { null } ?: listOf("Gå", "Hjem")

    /** Selve Live Update-varselet for egen økt. */
    fun build(ctx: Context, s: HlSession40, recipients: String): Notification {
        channels(ctx)
        val mins = hlMinutes40(s.eta)
        val late = s.state == "late" || (mins != null && mins < 0 && s.state != "home")
        val home = s.state == "home"
        val chip = when {
            home -> "✓ Hjemme"
            late -> "! ${s.lateMinutes?.takeIf { it > 0 } ?: -(mins ?: 0)} min over"
            mins != null -> "${mins.coerceAtLeast(0)} min"
            else -> "På vei"
        }
        val eta = hlClock40(s.eta)
        val title = when { home -> "Hjemme ${hlClock40(Instant.now().toString())} ✓"; late -> "Vel fremme · ${s.lateMinutes ?: -(mins ?: 0)} min over"; else -> "På vei hjem" + (eta?.let { " · $it" } ?: "") }
        val text = when {
            home -> "$recipients har fått beskjed"
            late -> "Familien har fått beskjed med posisjonen din"
            else -> listOfNotNull(s.leg, recipients.takeIf { it.isNotBlank() }?.let { "$it følger med" }).joinToString(" · ").ifBlank { "Si fra når du er hjemme" }
        }
        val color = if (home) GOLD else if (late) RED else GREEN
        val pr = ((s.progress ?: estimate(s)) * 100).toInt().coerceIn(0, 100)
        val b = Notification.Builder(ctx, if (late) CH_LATE else CH)
        b.setSmallIcon(icon(ctx))
        b.setContentTitle(title)
            .setContentText(text)
            .setSubText("Vel fremme")
            .setOngoing(!home)
            .setOnlyAlertOnce(!late)
            .setCategory(Notification.CATEGORY_NAVIGATION)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(color)
            .setContentIntent(open(ctx, 7401))
            .setShowWhen(false)
        if (!home) {
            if (late) {
                b.addAction(Notification.Action.Builder(null, "Alt OK", action(ctx, "ok", 7402)).build())
                b.addAction(Notification.Action.Builder(null, "+ 15 min", action(ctx, "plus15", 7403)).build())
            } else {
                b.addAction(Notification.Action.Builder(null, "+ 10 min", action(ctx, "plus", 7404)).build())
                b.addAction(Notification.Action.Builder(null, "Jeg er hjemme", action(ctx, "home", 7405)).build())
            }
        }
        val extras = Bundle()
        // Samsung One UI 7+ (Now Bar / Live Notifications): feltene leses der de støttes, ellers ignoreres de.
        extras.putInt("android.ongoingActivityNoti.style", 1)
        extras.putString("android.ongoingActivityNoti.primaryInfo", if (home) "Hjemme" else if (late) chip else "Hjem om $chip")
        extras.putString("android.ongoingActivityNoti.secondaryInfo", s.leg ?: "Vel fremme")
        extras.putString("android.ongoingActivityNoti.chipExpandedText", chip)
        extras.putInt("android.ongoingActivityNoti.chipBgColor", color)
        extras.putString("android.ongoingActivityNoti.nowbarPrimaryInfo", if (home) "Hjemme" else chip)
        extras.putString("android.ongoingActivityNoti.nowbarSecondaryInfo", "Vel fremme")
        extras.putInt("android.ongoingActivityNoti.progress", pr)
        extras.putInt("android.ongoingActivityNoti.progressMax", 100)
        if (Build.VERSION.SDK_INT >= 36 && !home) {
            // Android 16: be om «promoted ongoing» (Live Update) – brikke i statuslinja og øverst i skuffen.
            extras.putBoolean("android.requestPromotedOngoing", true)
            b.addExtras(extras)
            runCatching { Notification.Builder::class.java.getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType).invoke(b, true) }
            runCatching { Notification.Builder::class.java.getMethod("setShortCriticalText", String::class.java).invoke(b, chip) }
            if (!progressStyle(b, legs(s.leg), pr, color)) b.setProgress(100, pr, false)
        } else {
            b.addExtras(extras)
            if (!home) b.setProgress(100, pr, false)
        }
        return b.build()
    }

    /** Fremdrift fra start → forventet tid når serveren ikke sender progress. */
    private fun estimate(s: HlSession40): Double {
        val end = s.eta?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return 0.0
        val start = s.startedAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: (end - 30 * 60_000L)
        val now = System.currentTimeMillis()
        return ((now - start).toDouble() / (end - start).coerceAtLeast(60_000L)).coerceIn(0.0, 1.0)
    }

    /** Notification.ProgressStyle (API 36) med ett segment per etappe og et punkt der du er. Refleksjon: compileSdk har ikke typen. */
    private fun progressStyle(b: Notification.Builder, legs: List<String>, pr: Int, color: Int): Boolean = runCatching {
        val ps = Class.forName("android.app.Notification\$ProgressStyle")
        val seg = Class.forName("android.app.Notification\$ProgressStyle\$Segment")
        val pt = Class.forName("android.app.Notification\$ProgressStyle\$Point")
        val style = ps.getConstructor().newInstance()
        val n = legs.size.coerceAtLeast(1)
        val segs = (0 until n).map { i ->
            val sg = seg.getConstructor(Int::class.javaPrimitiveType).newInstance(100 / n + if (i == n - 1) 100 % n else 0)
            runCatching { seg.getMethod("setColor", Int::class.javaPrimitiveType).invoke(sg, if (i % 2 == 0) color else Color.argb(255, 120, 170, 255)) }
            sg
        }
        ps.getMethod("setProgressSegments", java.util.List::class.java).invoke(style, segs)
        val p0 = pt.getConstructor(Int::class.javaPrimitiveType).newInstance(pr.coerceIn(1, 99))
        runCatching { pt.getMethod("setColor", Int::class.javaPrimitiveType).invoke(p0, Color.WHITE) }
        runCatching { ps.getMethod("setProgressPoints", java.util.List::class.java).invoke(style, listOf(p0)) }
        ps.getMethod("setProgress", Int::class.javaPrimitiveType).invoke(style, pr)
        runCatching { ps.getMethod("setStyledByProgress", Boolean::class.javaPrimitiveType).invoke(style, true) }
        b.setStyle(style as Notification.Style)
        true
    }.getOrDefault(false)

    /** 1b: «Kinoen er ferdig. Skal jeg si fra til Rune og Cybele når du er hjemme?» med «Ja, start» / «Ikke nå». */
    fun suggest(ctx: Context, s: HlSuggest40) {
        if (!Notify.allowed(ctx)) return
        val sp = ctx.applicationContext.getSharedPreferences("hjemlys40", Context.MODE_PRIVATE)
        val today = java.time.LocalDate.now().toString()
        val key = today + "|" + (s.text ?: s.reason ?: "")
        if (sp.getString("snooze", null) == today || sp.getString("sugShown", null) == key) return
        sp.edit().putString("sugShown", key).apply()
        channels(ctx)
        val who = s.recipients.map { firstName37(it) }.let { l -> if (l.isEmpty()) "familien" else if (l.size == 1) l[0] else l.dropLast(1).joinToString(", ") + " og " + l.last() }
        val text = s.text ?: ((s.reason?.let { "$it. " } ?: "") + "Skal jeg si fra til $who når du er hjemme?")
        val yes = PendingIntent.getActivity(ctx, 7397, Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://hjemlys/start" + (s.eta?.let { "?eta=" + Uri.encode(it) } ?: "")), ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(ctx, CH_FOLLOW)
        n.setSmallIcon(icon(ctx))
        n.setContentTitle("✦ Glimt").setContentText(text).setStyle(Notification.BigTextStyle().bigText(text)).setColor(GOLD).setAutoCancel(true)
            .setContentIntent(open(ctx, 7396))
            .addAction(Notification.Action.Builder(null, "Ja, start", yes).build())
            .addAction(Notification.Action.Builder(null, "Ikke nå", action(ctx, "snooze", 7398)).build())
        runCatching { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ID_SUGGEST, n.build()) }
    }

    private val shownOther = HashMap<String, String>()

    /** Mottaker: «Følg Sebastian hjem» (pågående), «Sebastian er sen» (høy viktighet) eller «Sebastian er hjemme 23:36». */
    fun other(ctx: Context, s: HlSession40) {
        if (!Notify.allowed(ctx)) return
        channels(ctx)
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val who = s.name?.let { firstName37(it) } ?: "Noen"
        val key = s.userId ?: s.id
        val nid = 7450 + (key.hashCode() and 0x3F)
        if (shownOther[key] == s.state && s.state != "onTheWay") return
        shownOther[key] = s.state
        val n = when (s.state) {
            "late" -> Notification.Builder(ctx, CH_LATE).setSmallIcon(icon(ctx))
                .setContentTitle("Vel fremme: $who er ikke hjemme ennå")
                .setContentText("Ventet ${hlClock40(s.eta) ?: "–"}" + (s.lateMinutes?.let { " · $it min over" } ?: "") + " · trykk for siste posisjon")
                .setCategory(Notification.CATEGORY_ALARM).setColor(RED).setAutoCancel(true).setContentIntent(open(ctx, nid))
            "home" -> Notification.Builder(ctx, CH_FOLLOW).setSmallIcon(icon(ctx))
                .setContentTitle("$who er vel fremme ${hlClock40(Instant.now().toString())}").setContentText("Vel fremme er avsluttet")
                .setColor(GOLD).setAutoCancel(true).setContentIntent(open(ctx, nid))
            "ended" -> { nm.cancel(nid); return }
            else -> Notification.Builder(ctx, CH_FOLLOW).setSmallIcon(icon(ctx))
                .setContentTitle("Følg $who hjem").setContentText("Hjemme ca. ${hlClock40(s.eta) ?: "–"} · du får beskjed når $who er hjemme")
                .setOngoing(true).setOnlyAlertOnce(true).setColor(GREEN).setContentIntent(open(ctx, nid)).apply {
                    val m = hlMinutes40(s.eta)
                    if (Build.VERSION.SDK_INT >= 36 && m != null) runCatching { Notification.Builder::class.java.getMethod("setShortCriticalText", String::class.java).invoke(this, "${m.coerceAtLeast(0)} min") }
                }
        }
        runCatching { nm.notify(nid, n.build()) }
    }

    /** Fra GET /api/hjemlys: husstanden (samme varsler som sanntid, uten duplikater). */
    fun household(ctx: Context, l: List<HlMember40>, me: String?) {
        l.filter { it.userId != me }.forEach { m -> other(ctx, HlSession40(m.userId, m.userId, m.name, m.state, m.eta, m.since, 15, null, null, null, emptyList(), m.share)) }
    }
}

/* ======================= Forgrunnstjenesten (type location) ======================= */

class Hjemlys40Service : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var lm: LocationManager? = null
    private var last: Location? = null
    private var lastAt = 0L
    private var ticker: Job? = null
    private var unlockedAt: Long? = null
    private val unlock = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) { unlockedAt = System.currentTimeMillis() }
    }
    private val listener = object : LocationListener {
        override fun onLocationChanged(loc: Location) { onFix(loc) }
        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val s = Hjemlys40Prefs.session(this)
        if (intent?.action == STOP || s == null) { stopSelf(); return START_NOT_STICKY }
        try {
            val n = Hjemlys40Notify.build(this, s, recipients(s))
            if (Build.VERSION.SDK_INT >= 29 && FamilyService.hasLocation(this)) startForeground(Hjemlys40Notify.ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            else startForeground(Hjemlys40Notify.ID, n)
        } catch (e: Exception) {
            // Uten posisjonstillatelse (Android 14+) eller fra bakgrunnen: vis bare varselet, uten tjeneste.
            runCatching { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(Hjemlys40Notify.ID, Hjemlys40Notify.build(this, s, recipients(s))) }
            stopSelf(); return START_NOT_STICKY
        }
        if (intent?.action != REFRESH) {
            runCatching { startUpdates() }
            runCatching { ContextCompat.registerReceiver(this, unlock, IntentFilter(Intent.ACTION_USER_PRESENT), ContextCompat.RECEIVER_NOT_EXPORTED) }
            if (ticker?.isActive != true) ticker = scope.launch { tick() }
        }
        return START_STICKY
    }

    // Prompt 41 (Live Update-fiks 4): du selv er aldri blant «følger med»; 3+: «Rune, Cybele og 1 til».
    private fun recipients(s: HlSession40): String {
        val me = runCatching { AccountStore(this).let { st -> st.load().let { l -> l.firstOrNull { it.id == st.active() } ?: l.firstOrNull() } } }.getOrNull()
        val l = s.recipients.filter { n -> n != s.userId && (me == null || (!n.equals(me.name, true) && !n.equals(me.username, true) && !n.equals(firstName37(me.name), true))) }.map { firstName37(it) }
        return when (l.size) { 0 -> "Husstanden"; 1 -> l[0]; 2 -> l[0] + " og " + l[1]; else -> l[0] + ", " + l[1] + " og ${l.size - 2} til" }
    }

    /** Hvert minutt: ny tekst («7 min»), og status fra serveren (sen/hjemme). */
    private suspend fun tick() {
        while (scope.isActive) {
            val s = Hjemlys40Prefs.session(this) ?: break
            runCatching {
                val api = Hjemlys40Prefs.api(this) ?: return@runCatching
                val h = parseHl40(api.hlGet("/hjemlys", timeout = 8_000))
                Hjemlys40Prefs.sync(this, h.mine, null)
            }
            val cur = Hjemlys40Prefs.session(this)
            if (cur == null) { done(s); break }
            post(cur)
            delay(60_000)
        }
        stopSelf()
    }

    private fun post(s: HlSession40) {
        runCatching { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(Hjemlys40Notify.ID, Hjemlys40Notify.build(this, s, recipients(s))) }
    }

    /** Hjemme/avsluttet: «Hjemme 23:36 ✓» i 5 min, så borte. */
    private fun done(s: HlSession40) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        runCatching { stopForeground(STOP_FOREGROUND_DETACH) }
        runCatching { nm.notify(Hjemlys40Notify.ID, Hjemlys40Notify.build(this, s.copy(state = "home"), recipients(s))) }
        android.os.Handler(Looper.getMainLooper()).postDelayed({ runCatching { nm.cancel(Hjemlys40Notify.ID) } }, 5 * 60_000L)
    }

    @SuppressLint("MissingPermission")
    private fun startUpdates() {
        if (!FamilyService.hasLocation(this)) return
        val m = lm ?: (getSystemService(Context.LOCATION_SERVICE) as LocationManager).also { lm = it }
        runCatching { m.removeUpdates(listener) }
        listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { p -> runCatching { m.isProviderEnabled(p) }.getOrDefault(false) }.forEach { p ->
            runCatching { m.requestLocationUpdates(p, 30_000L, 50f, listener, Looper.getMainLooper()) }
        }
    }

    /** Maks hvert 30. s / 50 m: posisjon, batteri, dekning og siste opplåsing (deles av serveren først når økta er sen). */
    private fun onFix(loc: Location) {
        val now = System.currentTimeMillis()
        val prev = last
        if (prev != null && (now - lastAt < 30_000 || loc.distanceTo(prev) < 50f) && now - lastAt < 5 * 60_000) return
        last = loc; lastAt = now
        val s = Hjemlys40Prefs.session(this) ?: return
        scope.launch {
            val api = Hjemlys40Prefs.api(this@Hjemlys40Service) ?: return@launch
            val body = JSONObject().put("pos", JSONObject().put("lat", loc.latitude).put("lon", loc.longitude).put("acc", if (loc.hasAccuracy()) loc.accuracy.toDouble() else JSONObject.NULL))
            FamilyService.battery(this@Hjemlys40Service)?.let { (lvl, ch) -> body.put("battery", JSONObject().put("level", lvl).put("charging", ch)) }
            signal()?.let { body.put("signal", it) }
            unlockedAt?.let { body.put("unlockedAt", Instant.ofEpochMilli(it).toString()) }
            runCatching {
                val r = api.request("PATCH", "/hjemlys/" + java.net.URLEncoder.encode(s.id, "UTF-8"), body, prefix = Api.HOMELAB)
                val ses = JSONObject(r).let { parseHlSession40(it.optJSONObject("session") ?: it) }
                if (ses != null) {
                    Hjemlys40Prefs.sync(this@Hjemlys40Service, ses, null)
                    if (ses.state == "home" || ses.state == "ended") { done(ses); stopSelf() } else post(ses)
                }
            }
        }
    }

    /** Dekning: «wifi» / «4G» / «5G» med nivå 0–4 når telefonen oppgir det. */
    private fun signal(): JSONObject? = runCatching {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return null
        val o = JSONObject().put("type", when {
            caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            else -> "other"
        })
        if (Build.VERSION.SDK_INT >= 28) runCatching {
            val tm = getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
            tm.signalStrength?.level?.let { o.put("level", it) }
        }
        o
    }.getOrNull()

    override fun onDestroy() {
        runCatching { lm?.removeUpdates(listener) }
        runCatching { unregisterReceiver(unlock) }
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        const val STOP = "no.kristo.finanshub.hjemlys40.STOP"
        const val REFRESH = "no.kristo.finanshub.hjemlys40.REFRESH"

        fun start(ctx: Context) { runCatching { ContextCompat.startForegroundService(ctx, Intent(ctx, Hjemlys40Service::class.java)) } }
        fun refresh(ctx: Context) {
            if (Hjemlys40Prefs.session(ctx) == null) return
            runCatching { ContextCompat.startForegroundService(ctx, Intent(ctx, Hjemlys40Service::class.java).setAction(REFRESH)) }
        }
        fun stop(ctx: Context) {
            runCatching { ctx.startService(Intent(ctx, Hjemlys40Service::class.java).setAction(STOP)) }
            runCatching { ctx.stopService(Intent(ctx, Hjemlys40Service::class.java)) }
        }
        fun hasLocation(ctx: Context) = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }
}

/** Knappene i varselet («+ 10 min», «Jeg er hjemme», «Alt OK», «+ 15 min») virker uten å åpne appen. */
class Hjemlys40Receiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != ACTION) return
        val act = intent.getStringExtra("act") ?: return
        if (act == "snooze") { snoozeSuggest40(ctx); return }
        val s = Hjemlys40Prefs.session(ctx) ?: return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val api = Hjemlys40Prefs.api(ctx) ?: return@launch
                val ses = when (act) {
                    "plus" -> Hjemlys40Api.act(api, s.id, "plus", 10)
                    "plus15" -> Hjemlys40Api.act(api, s.id, "plus", 15)
                    else -> Hjemlys40Api.act(api, s.id, act)
                }
                if (act == "home" || act == "end" || ses?.state == "home" || ses?.state == "ended") {
                    Hjemlys40Prefs.clear(ctx)
                    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    runCatching { nm.notify(Hjemlys40Notify.ID, Hjemlys40Notify.build(ctx, (ses ?: s).copy(state = "home"), "Husstanden")) }
                    Hjemlys40Service.stop(ctx)
                } else {
                    Hjemlys40Prefs.sync(ctx, ses ?: s, null)
                    Hjemlys40Service.refresh(ctx)
                }
            } catch (_: Exception) {
            } finally { pending.finish() }
        }
    }

    companion object { const val ACTION = "no.kristo.finanshub.hjemlys40.ACT" }
}

/** Dyplenke finanshub://hjemlys: åpner Hjemlys; /start starter med én gang («Ja, start» / «Start for meg»), /home = «Jeg er hjemme». */
fun AppViewModel.hjemlysLink40(uri: Uri) {
    go(Screen.Homelab)
    val s = p40
    s.hlSheet = true
    s.hlLateFor = null
    val path = uri.path?.trim('/').orEmpty()
    runCatching { (appCtx40.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(Hjemlys40Notify.ID_SUGGEST) }
    when (path) {
        "ok" -> launch40 { if (p40.hl?.mine == null) runCatching { p40.hl = parseHl40(api40 { hlGet("/hjemlys", timeout = 8_000) }) }; hjemlysAct40("ok") }
        "home" -> launch40 { if (p40.hl?.mine == null) runCatching { p40.hl = parseHl40(api40 { hlGet("/hjemlys", timeout = 8_000) }) }; hjemlysAct40("home") }
        "start" -> {
            if (Hjemlys40Prefs.session(appCtx40) != null || !Hjemlys40Service.hasLocation(appCtx40)) { loadHjemlys40(force = true); return }
            val eta = uri.getQueryParameter("eta")?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
                ?: s.hlSuggest?.eta?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
                ?: s.hlRoute?.options?.firstOrNull()?.eta?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
                ?: (System.currentTimeMillis() + 30 * 60_000L)
            startHjemlys40(eta.coerceAtLeast(System.currentTimeMillis() + 5 * 60_000L), 15)
        }
        else -> loadHjemlys40(force = true)
    }
}
