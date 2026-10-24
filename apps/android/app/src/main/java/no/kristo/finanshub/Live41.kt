package no.kristo.finanshub

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/*
 * Prompt 41 (ANDROID41): Live Update for «Drar snart» / «Sjekket inn» (Hjemlys «Si fra») og for Min reise, og geofence for skolesonene.
 *  - Android 16: «promoted ongoing» (brikke i statuslinja, shortCriticalText) via refleksjon, som Hjemlys40Notify. Android 12–15: pågående varsel.
 *    Samsung One UI 7+: Now Bar-feltene legges på som extras.
 *  - Drar snart: «Drar om ca. 30 min · 23:04» med «+ 15 min» og «Drar nå». Ved tiden: lokalt varsel «Drar du nå?» (Ja / + 15 min). Ingen svar = ingen alarm.
 *  - Sjekket inn: brikke «● Inne 19:42», forsvinner etter 15 min.
 *  - Min reise: «Hjem om 37 min · 45 kl. 16:50», forsvinner hjemme eller etter 90 min (uten varsling til andre).
 *  - Skolesoner: LocationManager.addProximityAlert per sone (ingen Play Services). «Forlater skolen» = ute av siste sone i ≥ 2 min
 *    (AlarmManager), bare hverdager 07–18 og ikke innen 10 min etter ankomst → POST /api/ruter/left-school {at, zoneId, arrivedAt}.
 */

/** Api med kontoen som er aktiv i appen (for varselknapper og geofence når appen ikke kjører). */
internal fun bgApi41(ctx: Context): Api? {
    val st = runCatching { AccountStore(ctx) }.getOrNull() ?: return null
    val l = runCatching { st.load() }.getOrDefault(emptyList())
    val a = l.firstOrNull { it.id == st.active() } ?: l.firstOrNull() ?: return null
    return Api(a.external.ifBlank { a.server }, a.token)
}

object Live41 {
    const val CH = "live41"
    const val ID_SOON = 7410
    const val ID_IN = 7411
    const val ID_TRIP = 7412
    const val ID_ASK = 7413
    private const val GREEN = 0xFF2F9E5B.toInt()
    private const val GOLD = 0xFFF2A93B.toInt()
    private const val BLUE = 0xFF3B6FB0.toInt()

    private fun channel(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CH) == null) nm.createNotificationChannel(NotificationChannel(CH, "Live Update · Si fra og Min reise", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Drar snart, Sjekket inn og Min reise som pågående varsel"
            setSound(null, null); enableVibration(false); setShowBadge(false)
        })
    }

    private fun canPost(ctx: Context) = Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun open(ctx: Context, link: String, code: Int): PendingIntent = PendingIntent.getActivity(ctx, code,
        Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    internal fun act(ctx: Context, act: String, code: Int, extra: Bundle? = null): PendingIntent = PendingIntent.getBroadcast(ctx, code,
        Intent(ctx, Live41Receiver::class.java).setAction(Live41Receiver.ACTION).putExtra("act", act).apply { extra?.let { putExtras(it) } },
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun hm(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).let { "%02d:%02d".format(it.hour, it.minute) }

    /** Felles bygger: brikke (chip), tittel/tekst, farge, knapper, utløp. */
    private fun build(ctx: Context, title: String, text: String, chip: String, color: Int, link: String, actions: List<Pair<String, PendingIntent>>, timeoutMs: Long?, progress: Int? = null): Notification {
        channel(ctx)
        val b = Notification.Builder(ctx, CH)
            .setSmallIcon(Hjemlys40Notify.icon(ctx)).setContentTitle(title).setContentText(text).setSubText("Vel fremme")
            .setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_STATUS).setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(color).setContentIntent(open(ctx, link, 7420)).setShowWhen(false)
        timeoutMs?.let { b.setTimeoutAfter(it.coerceAtLeast(60_000L)) }
        actions.forEach { (n, pi) -> b.addAction(Notification.Action.Builder(null, n, pi).build()) }
        val ex = Bundle()
        ex.putInt("android.ongoingActivityNoti.style", 1)
        ex.putString("android.ongoingActivityNoti.primaryInfo", title)
        ex.putString("android.ongoingActivityNoti.secondaryInfo", text)
        ex.putString("android.ongoingActivityNoti.chipExpandedText", chip)
        ex.putInt("android.ongoingActivityNoti.chipBgColor", color)
        ex.putString("android.ongoingActivityNoti.nowbarPrimaryInfo", chip)
        ex.putString("android.ongoingActivityNoti.nowbarSecondaryInfo", title)
        if (Build.VERSION.SDK_INT >= 36) {
            ex.putBoolean("android.requestPromotedOngoing", true)
            b.addExtras(ex)
            runCatching { Notification.Builder::class.java.getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType).invoke(b, true) }
            runCatching { Notification.Builder::class.java.getMethod("setShortCriticalText", String::class.java).invoke(b, chip) }
        } else b.addExtras(ex)
        progress?.let { b.setProgress(100, it.coerceIn(0, 100), false) }
        return b.build()
    }

    private fun nm(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    /** Drar snart: «Drar om ca. 30 min · 23:04», «+ 15 min» og «Drar nå». Ved tiden: «Drar du nå?». */
    fun soon(ctx: Context, leaveAt: Long, noticeId: String?) {
        if (!canPost(ctx)) return
        ctx.getSharedPreferences("live41", Context.MODE_PRIVATE).edit().putLong("soonAt", leaveAt).putString("soonId", noticeId).apply()
        val mins = ((leaveAt - System.currentTimeMillis()) / 60_000L).coerceAtLeast(0)
        val n = build(ctx, "Drar om ca. $mins min · ${hm(leaveAt)}", "Familien vet at du drar snart", "$mins min", BLUE, "finanshub://hjemlys",
            listOf("+ 15 min" to act(ctx, "soon_plus", 7421), "Drar nå" to act(ctx, "soon_now", 7422)), leaveAt - System.currentTimeMillis() + 30 * 60_000L)
        runCatching { nm(ctx).notify(ID_SOON, n) }
        // Lokalt varsel ved tiden (inexact holder: «Ingen svar = ingen alarm»).
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        runCatching { am.set(AlarmManager.RTC_WAKEUP, leaveAt, act(ctx, "soon_ask", 7423)) }
    }

    fun ask(ctx: Context) {
        if (!canPost(ctx)) return
        runCatching { nm(ctx).cancel(ID_SOON) }
        channel(ctx)
        val n = Notification.Builder(ctx, CH).setSmallIcon(Hjemlys40Notify.icon(ctx)).setContentTitle("Drar du nå?").setContentText("Si fra til familien med ett trykk")
            .setAutoCancel(true).setContentIntent(open(ctx, "finanshub://hjemlys", 7424))
            .addAction(Notification.Action.Builder(null, "Ja", act(ctx, "soon_now", 7425)).build())
            .addAction(Notification.Action.Builder(null, "+ 15 min", act(ctx, "soon_plus", 7426)).build()).build()
        runCatching { nm(ctx).notify(ID_ASK, n) }
    }

    /** Sjekket inn: «● Inne 19:42», forsvinner etter 15 min. */
    fun checkedIn(ctx: Context, place: String?) {
        if (!canPost(ctx)) return
        val now = System.currentTimeMillis()
        val n = build(ctx, "Inne · ${hm(now)}", place?.takeIf { it.isNotBlank() } ?: "Sjekket inn", "● Inne ${hm(now)}", GOLD, "finanshub://hjemlys", emptyList(), 15 * 60_000L)
        runCatching { nm(ctx).notify(ID_IN, n) }
    }

    fun endSoon(ctx: Context) { runCatching { nm(ctx).cancel(ID_SOON); nm(ctx).cancel(ID_ASK) } }

    /** Min reise: «Hjem om 37 min · 45 kl. 16:50». */
    fun trip(ctx: Context, t: Trip41, expiresAt: Long?) {
        if (!canPost(ctx)) return
        val o = t.options.firstOrNull() ?: return
        val arr = epoch41(o.arr); val dep = epoch41(o.dep)
        val mins = arr?.let { ((it - System.currentTimeMillis()) / 60_000L).coerceAtLeast(0) }
        val bus = o.legs.firstOrNull { it.mode == "bus" }
        val title = "Hjem om ${mins ?: o.minutes ?: 0} min" + (bus?.let { b -> " · ${b.line ?: "buss"} kl. ${hm41(b.dep)}" } ?: "")
        val text = (t.alert?.text ?: o.legs.joinToString(" › ") { legLabel41(it) }).take(120)
        val pr = if (arr != null && dep != null && arr > dep) (((System.currentTimeMillis() - dep).toDouble() / (arr - dep)) * 100).toInt() else null
        val n = build(ctx, title, text, "${mins ?: o.minutes ?: 0} min", GREEN, "finanshub://ruter",
            listOf("Skjul" to act(ctx, "trip_hide", 7427)), (expiresAt ?: (System.currentTimeMillis() + 90 * 60_000L)) - System.currentTimeMillis(), pr)
        runCatching { nm(ctx).notify(ID_TRIP, n) }
    }

    fun endTrip(ctx: Context) { runCatching { nm(ctx).cancel(ID_TRIP) } }
}

/** Knappene i Live Update-varslene og varselet ved tiden. */
class Live41Receiver : BroadcastReceiver() {
    companion object { const val ACTION = "no.kristo.finanshub.LIVE41" }

    override fun onReceive(ctx: Context, intent: Intent) {
        val act = intent.getStringExtra("act") ?: return
        val sp = ctx.getSharedPreferences("live41", Context.MODE_PRIVATE)
        val id = sp.getString("soonId", null)
        val pend = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val api = bgApi41(ctx)
                when (act) {
                    "soon_ask" -> Live41.ask(ctx)
                    "soon_plus" -> {
                        val at = maxOf(sp.getLong("soonAt", System.currentTimeMillis()), System.currentTimeMillis()) + 15 * 60_000L
                        if (id != null) runCatching { api?.request("PATCH", "/hjemlys/notice/" + Uri.encode(id), JSONObject().put("plus", 15), prefix = Api.HOMELAB) }
                        runCatching { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(Live41.ID_ASK) }
                        Live41.soon(ctx, at, id)
                    }
                    "soon_now" -> {
                        if (id != null) runCatching { api?.request("POST", "/hjemlys/notice/" + Uri.encode(id) + "/now", JSONObject(), prefix = Api.HOMELAB) }
                        Live41.endSoon(ctx)
                    }
                    "trip_hide" -> { runCatching { api?.request("POST", "/ruter/journey/hide", JSONObject(), prefix = Api.HOMELAB) }; Live41.endTrip(ctx) }
                }
            } finally { pend.finish() }
        }
    }
}

/* ======================= Skolesoner (geofence) ======================= */

object SchoolZones41 {
    const val ACTION = "no.kristo.finanshub.ZONE41"
    private const val PREF = "zones41"

    fun save(ctx: Context, zones: List<Zone41>, base: String?, token: String?) {
        val arr = JSONArray()
        zones.forEach { z -> arr.put(JSONObject().put("id", z.id).put("name", z.name).put("lat", z.lat).put("lon", z.lon).put("r", z.radius)) }
        val sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val old = runCatching { JSONArray(sp.getString("zones", "[]")) }.getOrDefault(JSONArray())
        sp.edit().putString("zones", arr.toString()).apply()
        register(ctx, old, arr)
    }

    private fun pi(ctx: Context, id: String): PendingIntent = PendingIntent.getBroadcast(ctx, 7500 + (id.hashCode() and 0x3FF),
        Intent(ctx, SchoolZone41Receiver::class.java).setAction(ACTION).putExtra("zone", id), PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** Maks 20 soner. Krever posisjonstilgang (også i bakgrunnen for at det skal virke med appen lukket). */
    @android.annotation.SuppressLint("MissingPermission")
    private fun register(ctx: Context, old: JSONArray, now: JSONArray) {
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
        for (i in 0 until old.length()) old.optJSONObject(i)?.optString("id")?.let { runCatching { lm.removeProximityAlert(pi(ctx, it)) } }
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        for (i in 0 until minOf(20, now.length())) {
            val z = now.optJSONObject(i) ?: continue
            runCatching { lm.addProximityAlert(z.optDouble("lat"), z.optDouble("lon"), z.optDouble("r", 150.0).toFloat(), -1, pi(ctx, z.optString("id"))) }
        }
    }

    internal fun prefs(ctx: Context) = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    /**
     * Prompt 50 (P50Fam.kt): skole-områdene fra Familie › Steder. Nærhetsvarslene registreres av Geofence50 (én region per område,
     * maks 20 totalt), så de gamle skolesone-varslene fjernes her og «inside» ryddes for områder som ikke finnes lenger.
     */
    fun saveOnly50(ctx: Context, zones: List<Zone41>) {
        val sp = prefs(ctx)
        val old = runCatching { JSONArray(sp.getString("zones", "[]")) }.getOrDefault(JSONArray())
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        if (lm != null) for (i in 0 until old.length()) old.optJSONObject(i)?.optString("id")?.let { runCatching { lm.removeProximityAlert(pi(ctx, it)) } }
        val arr = JSONArray()
        zones.forEach { z -> arr.put(JSONObject().put("id", z.id).put("name", z.name).put("lat", z.lat).put("lon", z.lon).put("r", z.radius)) }
        val ids = zones.map { it.id }.toSet()
        val inside = (sp.getStringSet("inside", emptySet()) ?: emptySet()).filter { it in ids }.toSet()
        sp.edit().putString("zones", arr.toString()).putStringSet("inside", inside).apply()
    }
}

class SchoolZone41Receiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val sp = SchoolZones41.prefs(ctx)
        val inside = (sp.getStringSet("inside", emptySet()) ?: emptySet()).toMutableSet()
        val now = System.currentTimeMillis()
        if (intent.getStringExtra("act") == "check") { check(ctx, intent.getLongExtra("leftAt", 0L), intent.getStringExtra("zone")); return }
        val zone = intent.getStringExtra("zone") ?: return
        if (!intent.hasExtra(LocationManager.KEY_PROXIMITY_ENTERING)) return
        val entering = intent.getBooleanExtra(LocationManager.KEY_PROXIMITY_ENTERING, false)
        if (entering) {
            if (inside.isEmpty()) sp.edit().putLong("arrivedAt", now).apply()
            inside += zone
            sp.edit().putStringSet("inside", inside).remove("leftAt").apply()
            post(ctx, "/ruter/arrived-school", JSONObject().put("at", Instant.ofEpochMilli(now).toString()))
        } else {
            inside -= zone
            sp.edit().putStringSet("inside", inside).apply()
            if (inside.isEmpty()) {
                sp.edit().putLong("leftAt", now).putString("leftZone", zone).apply()
                // Ute i ≥ 2 min (unngå flimmer mellom soner): sjekk igjen om 2 minutter.
                val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                val p = PendingIntent.getBroadcast(ctx, 7499, Intent(ctx, SchoolZone41Receiver::class.java).setAction(SchoolZones41.ACTION)
                    .putExtra("act", "check").putExtra("leftAt", now).putExtra("zone", zone), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                runCatching { am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 2 * 60_000L, p) }
            }
        }
    }

    private fun check(ctx: Context, leftAt: Long, zone: String?) {
        val sp = SchoolZones41.prefs(ctx)
        if (!(sp.getStringSet("inside", emptySet()) ?: emptySet()).isEmpty() || sp.getLong("leftAt", -1L) != leftAt) return
        val z = ZonedDateTime.ofInstant(Instant.ofEpochMilli(leftAt), ZoneId.of("Europe/Oslo"))
        if (z.dayOfWeek == DayOfWeek.SATURDAY || z.dayOfWeek == DayOfWeek.SUNDAY || z.hour < 7 || z.hour >= 18) return
        val arrived = sp.getLong("arrivedAt", 0L)
        if (arrived > 0 && leftAt - arrived < 10 * 60_000L) return
        val body = JSONObject().put("at", Instant.ofEpochMilli(leftAt).toString())
        zone?.let { body.put("zoneId", it.toIntOrNull() ?: it) }
        if (arrived > 0) body.put("arrivedAt", Instant.ofEpochMilli(arrived).toString())
        val pend = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val api = bgApi41(ctx) ?: return@launch
                val ok = runCatching { api.request("POST", "/ruter/left-school", body, prefix = Api.HOMELAB) }.isSuccess
                if (!ok) return@launch
                // Live Update «Hjem om 37 min · 45 kl. 16:50» (uten varsling til andre).
                runCatching { parseTrip41(api.request("GET", "/ruter/my-trip?dir=toHome", prefix = Api.HOMELAB)) }.getOrNull()?.let { Live41.trip(ctx, it, leftAt + 90 * 60_000L) }
            } finally { pend.finish() }
        }
    }

    private fun post(ctx: Context, path: String, body: JSONObject) {
        val pend = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try { runCatching { bgApi41(ctx)?.request("POST", path, body, prefix = Api.HOMELAB) } } finally { pend.finish() }
        }
    }
}
