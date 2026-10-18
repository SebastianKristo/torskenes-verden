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
        startAsForeground()
        startUpdates()
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
            .put("ts", loc.time.takeIf { it > 0 } ?: now)
        battery(this)?.let { (lvl, ch) -> o.put("battery", lvl).put("charging", ch) }
        synchronized(queue) { queue += o; while (queue.size > 200) queue.removeAt(0) }
        scope.launch { flush(this@FamilyService) }
    }

    private suspend fun flush(ctx: Context) {
        val batch = synchronized(queue) { queue.toList() }
        if (batch.isEmpty()) return
        val api = FamilyPrefs.api(ctx) ?: return
        try {
            val body = if (batch.size == 1) batch[0] else JSONObject().put("points", JSONArray(batch))
            val r = JSONObject(api.hlPost("/family/location", body))
            synchronized(queue) { queue.removeAll(batch.toSet()) }
            notifyEvents(ctx, r.optJSONArray("events"))
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

/** Valgene for Familie på denne telefonen, og innloggingen bakgrunnsjobbene bruker. */
object FamilyPrefs {
    private fun sp(ctx: Context) = ctx.getSharedPreferences("family", Context.MODE_PRIVATE)
    fun sharing(ctx: Context) = sp(ctx).getBoolean("sharing", false)
    fun precise(ctx: Context) = sp(ctx).getBoolean("precise", true)
    fun setSharing(ctx: Context, on: Boolean) { sp(ctx).edit().putBoolean("sharing", on).apply() }
    fun setPrecise(ctx: Context, on: Boolean) { sp(ctx).edit().putBoolean("precise", on).apply() }
    fun health(ctx: Context): Set<String> = sp(ctx).getStringSet("health", emptySet()) ?: emptySet()

    /** Sonene (lat, lon, radius) fra siste henting, så tjenesten kan sjekke sonekanter uten nett. */
    fun setZones(ctx: Context, zones: List<Triple<String, Pair<Double, Double>, Double>>) {
        val a = JSONArray()
        zones.forEach { (id, ll, r) -> a.put(JSONObject().put("id", id).put("lat", ll.first).put("lon", ll.second).put("r", r)) }
        sp(ctx).edit().putString("zones", a.toString()).apply()
    }

    /** true når posisjonen har gått inn i eller ut av en sone siden forrige gang (15 % slingringsmonn ut, som på serveren). */
    fun crossedZone(ctx: Context, lat: Double, lon: Double): Boolean {
        val a = runCatching { JSONArray(sp(ctx).getString("zones", "[]")) }.getOrNull() ?: return false
        val inside = sp(ctx).getStringSet("inside", emptySet())?.toMutableSet() ?: mutableSetOf()
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
        if (changed) sp(ctx).edit().putStringSet("inside", inside).apply()
        return changed
    }
    fun setHealth(ctx: Context, keys: Set<String>) { sp(ctx).edit().putStringSet("health", keys).apply() }

    /** Den aktive kontoen (samme som widgetene bruker). */
    fun api(ctx: Context): Api? {
        val store = AccountStore(ctx)
        val list = runCatching { store.load() }.getOrDefault(emptyList())
        val acc = list.firstOrNull { it.id == store.active() } ?: list.firstOrNull() ?: return null
        val base = listOf(acc.server, acc.external, acc.local).firstOrNull { it.isNotBlank() } ?: return null
        return Api(base, acc.token)
    }
}
