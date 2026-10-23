package no.kristo.finanshub.family

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import no.kristo.finanshub.AccountStore
import no.kristo.finanshub.Api
import no.kristo.finanshub.Notify
import no.kristo.finanshub.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * Familie: deler posisjonen med de andre på serveren mens delingen er på. Kjører som forgrunnstjeneste (varsel i
 * statuslinja) så Android ikke stopper den i bakgrunnen. Bruker plattformens LocationManager (GPS og nettverk), uten
 * Google Play-tjenester. Sender batteri, lading, aktivitet (ut fra farten), fart og nøyaktighet til /api/family/location.
 */
class FamilyService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var lm: LocationManager? = null
    private var lastSent: Location? = null
    private var lastSentAt = 0L
    private val queue = mutableListOf<JSONObject>()
    @Volatile private var queueAcct: String? = null

    private val listener = object : LocationListener {
        override fun onLocationChanged(loc: Location) { onFix(loc) }
        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP || !FamilyPrefs.sharing(this)) { stopSelf(); return START_NOT_STICKY }
        // Uten posisjonstillatelse kaster startForeground(type = location) SecurityException på Android 14+ (og
        // ForegroundServiceStartNotAllowedException når appen er i bakgrunnen). Det krasjet appen; nå stopper tjenesten bare.
        if (!hasLocation(this)) { stopSelf(); return START_NOT_STICKY }
        try { startAsForeground() } catch (e: Exception) {
            android.util.Log.w("FinansHub", "Familie: kunne ikke starte forgrunnstjenesten", e)
            stopSelf(); return START_NOT_STICKY
        }
        runCatching { startUpdates() }
        return START_STICKY
    }

    private fun startAsForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Familie · deling av posisjon", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Vises mens posisjonen deles med familien"
            })
        }
        val open = packageManager.getLaunchIntentForPackage(packageName)
        val pi = open?.let { PendingIntent.getActivity(this, 7001, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
        val stop = PendingIntent.getService(this, 7002, Intent(this, FamilyService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle("Deler posisjonen med familien")
            .setContentText(if (FamilyPrefs.precise(this)) "Nøyaktig posisjon" else "Omtrentlig posisjon")
            .setOngoing(true)
            .setSilent(true)
            .apply { if (pi != null) setContentIntent(pi) }
            .addAction(0, "Pause", stop)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION) else startForeground(NOTE_ID, n)
    }

    @SuppressLint("MissingPermission")
    private fun startUpdates() {
        if (!hasLocation(this)) { stopSelf(); return }
        val m = lm ?: (getSystemService(Context.LOCATION_SERVICE) as LocationManager).also { lm = it }
        runCatching { m.removeUpdates(listener) }
        val precise = FamilyPrefs.precise(this)
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { p -> runCatching { m.isProviderEnabled(p) }.getOrDefault(false) }
        for (p in providers) {
            if (p == LocationManager.GPS_PROVIDER && !precise) continue
            runCatching { m.requestLocationUpdates(p, MIN_TIME_MS, MIN_DIST_M, listener, Looper.getMainLooper()) }
        }
        // Siste kjente posisjon sendes med en gang, så de andre ser deg uten å vente på neste fix.
        providers.mapNotNull { p -> runCatching { m.getLastKnownLocation(p) }.getOrNull() }.maxByOrNull { it.time }?.let(::onFix)
    }

    private fun onFix(loc: Location) {
        val now = System.currentTimeMillis()
        val prev = lastSent
        // Geofencing på telefonen: krysser man en sonekant, sendes posisjonen med en gang (ellers kan serveren
        // først se det ved neste sending), og telefonen husker om man er inne eller ute.
        val crossed = FamilyPrefs.crossedZone(this, loc.latitude, loc.longitude)
        // Spar strøm og data: send når man har flyttet seg 25 m, eller hvert 5. minutt i ro.
        if (!crossed && prev != null && loc.distanceTo(prev) < MIN_DIST_M && now - lastSentAt < 5 * 60_000) return
        lastSent = loc; lastSentAt = now
        val speed = if (loc.hasSpeed()) loc.speed.toDouble() else null
        val o = JSONObject()
            .put("lat", loc.latitude).put("lon", loc.longitude)
            .put("acc", if (loc.hasAccuracy()) loc.accuracy.toDouble() else JSONObject.NULL)
            .put("speed", speed ?: JSONObject.NULL)
            .put("heading", if (loc.hasBearing()) loc.bearing.toDouble() else JSONObject.NULL)
            .put("alt", if (loc.hasAltitude()) loc.altitude else JSONObject.NULL)
            .put("activity", activityFromSpeed(speed))
            .put("device", Build.MODEL)
            // Prompt 24: stabil ID per installasjon og plattform, så serveren kan slå sammen enhetene til én person.
            .put("deviceId", installId24(this)).put("platform", "android")
            .put("ts", loc.time.takeIf { it > 0 } ?: now)
        if (FamilyPrefs.sensors(this)) battery(this)?.let { (lvl, ch) -> o.put("battery", lvl).put("charging", ch) }
        else o.remove("activity")
        // Køen tilhører én konto: bytter kontoen, kastes punktene fra den forrige (de sendes aldri med en annen innlogging).
        val acct = FamilyPrefs.account(this)
        synchronized(queue) { if (queueAcct != acct) { queue.clear(); queueAcct = acct }; queue += o; while (queue.size > 200) queue.removeAt(0) }
        scope.launch { flush(this@FamilyService) }
    }

    private suspend fun flush(ctx: Context) {
        if (!FamilyPrefs.sharing(ctx) || FamilyPrefs.account(ctx) != queueAcct) { synchronized(queue) { queue.clear() }; return }
        val batch = synchronized(queue) { queue.toList() }
        if (batch.isEmpty()) return
        val api = FamilyPrefs.api(ctx) ?: return
        try {
            val body = if (batch.size == 1) batch[0] else JSONObject().put("points", JSONArray(batch))
                .put("device", Build.MODEL).put("deviceId", installId24(ctx)).put("platform", "android")
            val r = JSONObject(api.hlPost("/family/location", body))
            synchronized(queue) { queue.removeAll(batch.toSet()) }
            // Prompt 45: sonevarsel med soneikonet, egen kanal «Sonevarsler» og av/på per person (P45b.kt).
            no.kristo.finanshub.ZoneNotify45.postEvents(ctx, api, r.optJSONArray("events"))
        } catch (_: Exception) {
            // Beholdes i køen og sendes ved neste posisjon.
        }
    }

    override fun onDestroy() {
        runCatching { lm?.removeUpdates(listener) }
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "no.kristo.finanshub.family.STOP"
        private const val CHANNEL = "family"
        private const val NOTE_ID = 7000
        private const val MIN_TIME_MS = 60_000L
        private const val MIN_DIST_M = 25f

        fun hasLocation(ctx: Context) = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

        /** Starter eller stopper tjenesten etter valget «Deling» (på / pause / av). */
        fun sync(ctx: Context) {
            val i = Intent(ctx, FamilyService::class.java)
            if (FamilyPrefs.sharing(ctx) && hasLocation(ctx)) runCatching { ContextCompat.startForegroundService(ctx, i) }
            else runCatching { ctx.stopService(i) }
        }

        fun activityFromSpeed(s: Double?): String = when {
            s == null -> "still"
            s < 0.5 -> "still"
            s < 2.2 -> "walking"
            s < 4.0 -> "running"
            s < 8.5 -> "cycling"
            else -> "driving"
        }

        fun battery(ctx: Context): Pair<Int, Boolean>? {
            val i = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
            val level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            val status = i.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            if (level < 0 || scale <= 0) return null
            return Math.round(level * 100f / scale) to (status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)
        }

        /** Varsel på telefonen når noen kommer til eller forlater en sone (hendelser serveren ga tilbake). */
        fun notifyEvents(ctx: Context, a: JSONArray?) {
            if (a == null) return
            for (i in 0 until a.length()) {
                val e = a.optJSONObject(i) ?: continue
                val who = e.optString("name").ifBlank { e.optString("username").ifBlank { "Noen" } }
                val zone = e.optString("zoneName").ifBlank { e.optString("zone").ifBlank { "sonen" } }
                val text = if (e.optString("kind") == "leave") "$who forlot $zone" else "$who kom til $zone"
                Notify.post(ctx, "Familie", text, "fam-" + e.optString("id", text), "familie")
            }
        }
    }
}

/**
 * Valgene for Familie på denne telefonen, og innloggingen bakgrunnsjobbene bruker.
 * Prompt 21 (brukerskille): deling, nøyaktighet, helse, sensorer, bakgrunn og soner lagres per konto («<konto>:<nøkkel>»).
 * Posisjon og helse sendes bare for kontoen som selv har slått på deling, og bare med den kontoens innlogging.
 * Deling er av som standard.
 */
object FamilyPrefs {
    private fun sp(ctx: Context) = ctx.getSharedPreferences("family", Context.MODE_PRIVATE)
    private val PER_ACCOUNT = listOf("sharing", "precise", "health", "sensors", "background", "zones", "inside")

    /** Kontoen valgene gjelder for: speilet av den aktive kontoen (settes av appen ved innlogging og kontobytte). */
    fun account(ctx: Context): String {
        sp(ctx).getString("acct", null)?.let { return it }
        val id = runCatching { AccountStore(ctx).active() }.getOrNull() ?: return ""
        useAccount(ctx, id)
        return id
    }

    /**
     * Ny aktiv konto (null = logget ut). Første gang flyttes valgene fra eldre versjoner (uten konto) over til kontoen
     * som er aktiv da, så en eksplisitt valgt deling beholdes.
     */
    fun useAccount(ctx: Context, id: String?) {
        val p = sp(ctx)
        val e = p.edit()
        if (id != null && !p.getBoolean("migrated21", false)) {
            val all = p.all
            for (k in PER_ACCOUNT) {
                val v = all[k] ?: continue
                val nk = "$id:$k"
                @Suppress("UNCHECKED_CAST")
                when (v) {
                    is Boolean -> e.putBoolean(nk, v)
                    is String -> e.putString(nk, v)
                    is Set<*> -> e.putStringSet(nk, v as Set<String>)
                }
                e.remove(k)
            }
            e.putBoolean("migrated21", true)
        }
        if (id == null) e.remove("acct") else e.putString("acct", id)
        e.apply()
    }

    private fun k(ctx: Context, key: String): String = account(ctx) + ":" + key
    fun sharing(ctx: Context) = account(ctx).isNotEmpty() && sp(ctx).getBoolean(k(ctx, "sharing"), false)
    fun precise(ctx: Context) = sp(ctx).getBoolean(k(ctx, "precise"), true)
    fun setSharing(ctx: Context, on: Boolean) { sp(ctx).edit().putBoolean(k(ctx, "sharing"), on).apply() }
    fun setPrecise(ctx: Context, on: Boolean) { sp(ctx).edit().putBoolean(k(ctx, "precise"), on).apply() }
    fun health(ctx: Context): Set<String> = if (account(ctx).isEmpty()) emptySet() else sp(ctx).getStringSet(k(ctx, "health"), emptySet()) ?: emptySet()
    /** «Batteri og bevegelse» sendes med posisjonen (Helse og posisjon). */
    fun sensors(ctx: Context) = sp(ctx).getBoolean(k(ctx, "sensors"), true)
    fun putSensors(ctx: Context, on: Boolean) { sp(ctx).edit().putBoolean(k(ctx, "sensors"), on).apply() }
    /** Health Connect-dialogen er vist minst én gang (Familie viser da «Ingen data» med fremgangsmåte). Gjelder telefonen. */
    fun healthAsked(ctx: Context) = sp(ctx).getBoolean("healthAsked", false)
    fun putHealthAsked(ctx: Context) { sp(ctx).edit().putBoolean("healthAsked", true).apply() }
    /** «Også i bakgrunnen» (Helse og posisjon). */
    fun background(ctx: Context) = sp(ctx).getBoolean(k(ctx, "background"), true)
    fun putBackground(ctx: Context, on: Boolean) { sp(ctx).edit().putBoolean(k(ctx, "background"), on).apply() }

    /** Sonene (lat, lon, radius) fra siste henting, så tjenesten kan sjekke sonekanter uten nett. */
    fun setZones(ctx: Context, zones: List<Triple<String, Pair<Double, Double>, Double>>) {
        val a = JSONArray()
        zones.forEach { (id, ll, r) -> a.put(JSONObject().put("id", id).put("lat", ll.first).put("lon", ll.second).put("r", r)) }
        sp(ctx).edit().putString(k(ctx, "zones"), a.toString()).apply()
    }

    /** true når posisjonen har gått inn i eller ut av en sone siden forrige gang (15 % slingringsmonn ut, som på serveren). */
    fun crossedZone(ctx: Context, lat: Double, lon: Double): Boolean {
        val a = runCatching { JSONArray(sp(ctx).getString(k(ctx, "zones"), "[]")) }.getOrNull() ?: return false
        val inside = sp(ctx).getStringSet(k(ctx, "inside"), emptySet())?.toMutableSet() ?: mutableSetOf()
        var changed = false
        val d = FloatArray(1)
        for (i in 0 until a.length()) {
            val z = a.optJSONObject(i) ?: continue
            val id = z.optString("id")
            Location.distanceBetween(lat, lon, z.optDouble("lat"), z.optDouble("lon"), d)
            val r = z.optDouble("r", 100.0)
            val was = id in inside
            val now = if (was) d[0] <= r * 1.15 else d[0] <= r
            if (now != was) { changed = true; if (now) inside += id else inside -= id }
        }
        if (changed) sp(ctx).edit().putStringSet(k(ctx, "inside"), inside).apply()
        return changed
    }
    fun setHealth(ctx: Context, keys: Set<String>) { sp(ctx).edit().putStringSet(k(ctx, "health"), keys).apply() }

    /** Innloggingen til kontoen valgene gjelder for (samme som widgetene bruker). Ingen konto → ingenting sendes. */
    fun api(ctx: Context): Api? {
        val store = AccountStore(ctx)
        val list = runCatching { store.load() }.getOrDefault(emptyList())
        val id = account(ctx)
        val acc = list.firstOrNull { it.id == id } ?: return null
        val base = listOf(acc.server, acc.external, acc.local).firstOrNull { it.isNotBlank() } ?: return null
        return Api(base, acc.token)
    }
}

/** Prompt 24: stabil enhets-ID for denne installasjonen (UUID, lagres første gang). */
internal fun installId24(ctx: Context): String {
    val sp = ctx.applicationContext.getSharedPreferences("family24", Context.MODE_PRIVATE)
    sp.getString("installId", null)?.let { return it }
    val id = "and-" + java.util.UUID.randomUUID().toString()
    sp.edit().putString("installId", id).apply()
    return id
}
