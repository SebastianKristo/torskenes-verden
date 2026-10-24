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
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalTime
import java.util.concurrent.TimeUnit

/*
 * Prompt 31 (ANDROID31): varsler når appen er lukket. Serveren har ingen FCM-nøkler, så appen henter selv:
 *  - Notify31Worker (WorkManager, hvert 15. minutt, samme mønster som widgetene): GET /api/notify/pending?since= (AI-svar,
 *    prøve-varsler, oppdatering, rask time) → lokale varsler, og GET /finans/api/subscriptions/trials → nye prøve-varsler planlegges.
 *  - Notify31Follow (engangsjobb når appen går i bakgrunnen med en Glimt-jobb som ikke er ferdig): spør GET /api/assist/:id i
 *    opptil fire minutter og varsler med svaret («Glimt»).
 *  - Prøve-varsler: AlarmManager.setAndAllowWhileIdle til kjent tid (09:00 / 18:00 Europe/Oslo), handlinger Avslutt nå (åpner
 *    oppsigelsessiden), Behold (PATCH status kept) og Minn meg i morgen (PATCH snooze + nytt lokalt varsel i morgen 09:00).
 * Bruker plattformens Notification.Builder (minSdk 26), kanal «glimt31».
 */
object Notify31 {
    private const val PREFS = "notify31"
    private const val CH = "glimt31"
    private const val PERIODIC = "notify31-pending"
    private const val FOLLOW = "notify31-follow"
    const val ACT_FIRE = "no.kristo.finanshub.TRIAL31_FIRE"
    const val ACT_KEEP = "no.kristo.finanshub.TRIAL31_KEEP"
    const val ACT_SNOOZE = "no.kristo.finanshub.TRIAL31_SNOOZE"

    internal fun sp(ctx: Context): SharedPreferences = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun setForeground(ctx: Context, fg: Boolean) {
        val e = sp(ctx).edit().putBoolean("fg", fg)
        // Alt som kom mens appen var åpen er sett: workeren varsler bare om det som kommer etterpå.
        if (fg) e.putLong("since", System.currentTimeMillis())
        e.apply()
    }
    /** Prompt 45: appen er åpen og i forgrunnen (da vises ingen systemvarsler for Glimt-svar). */
    fun isForeground(ctx: Context): Boolean = sp(ctx).getBoolean("fg", false)
    fun setAiBg(ctx: Context, on: Boolean) = sp(ctx).edit().putBoolean("ai_bg", on).apply()

    /** Glimt-jobber som venter på svar (følges opp i bakgrunnen). Verdien er «hjem|spørsmål» eller «chat|spørsmål». */
    fun remember(ctx: Context, id: String, q: String, from: String) {
        val o = runCatching { JSONObject(sp(ctx).getString("jobs", "{}") ?: "{}") }.getOrDefault(JSONObject())
        o.put(id, JSONObject().put("q", q).put("from", from).put("t", System.currentTimeMillis()))
        sp(ctx).edit().putString("jobs", o.toString()).apply()
    }
    fun forget(ctx: Context, id: String) {
        val o = runCatching { JSONObject(sp(ctx).getString("jobs", "{}") ?: "{}") }.getOrDefault(JSONObject())
        o.remove(id)
        sp(ctx).edit().putString("jobs", o.toString()).putString("seen", (seen(ctx) + id).takeLast(60).joinToString(",")).apply()
    }
    internal fun jobs(ctx: Context): JSONObject = runCatching { JSONObject(sp(ctx).getString("jobs", "{}") ?: "{}") }.getOrDefault(JSONObject())
    internal fun seen(ctx: Context): List<String> = (sp(ctx).getString("seen", "") ?: "").split(',').filter { it.isNotBlank() }
    internal fun markSeen(ctx: Context, id: String) { sp(ctx).edit().putString("seen", (seen(ctx) + id).takeLast(60).joinToString(",")).apply() }

    private fun allowed(ctx: Context): Boolean = Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Hovedbryteren «Varsler» (Notify.applyPrefs) og «AI-svar i bakgrunnen» (category ai). */
    private fun on(ctx: Context, category: String): Boolean {
        val n = ctx.getSharedPreferences("notify_prefs", Context.MODE_PRIVATE)
        if (!n.getBoolean("on", true)) return false
        if (category == "ai" && !sp(ctx).getBoolean("ai_bg", true)) return false
        return true
    }

    /** Prompt 39: den gamle kanalen «glimt31» (IMPORTANCE_HIGH, telefonens standardlyd) er erstattet av Sound39.glimtChannel. */
    @Suppress("unused") private fun channel(ctx: Context): String = Sound39.glimtChannel(ctx, remind = true)

    private fun openIntent(ctx: Context, link: String?, code: Int): PendingIntent {
        val i = if (link != null && link.startsWith("finanshub://")) Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(ctx.packageName)
        else ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent(Intent.ACTION_MAIN).setPackage(ctx.packageName)
        i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Lokalt varsel. tag gir fast id, så samme svar fra appen og fra workeren bare vises én gang. */
    fun post(ctx: Context, title: String, body: String, tag: String, link: String?, category: String = "ai", actions: List<Notification.Action> = emptyList()) {
        if (!allowed(ctx) || !on(ctx, category)) return
        val id = tag.hashCode()
        // Prompt 39: Glimt-svar på egen kanal «glimt_ai» (myk dråpe, IMPORTANCE_DEFAULT – før IMPORTANCE_HIGH med telefonens
        // standardlyd), tittel «Glimt», Glimt-logoen som stort ikon, hvit ring + stjerne i statuslinjen og farge #E0553D.
        val ai = category == "ai"
        val b = Notification.Builder(ctx, Sound39.glimtChannel(ctx, remind = !ai))
        b.setSmallIcon(if (ai) no.kristo.finanshub.R.drawable.ic_glimt39_badge else no.kristo.finanshub.R.drawable.ic_launcher_monochrome)
        b.setContentTitle(if (ai) "Glimt" else title).setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(openIntent(ctx, link, id))
            .setGroup(if (category == "trial") "trials31" else "glimt31")
        if (ai) {
            b.setCategory(Notification.CATEGORY_MESSAGE).setColor(0xFFE0553D.toInt())
            val logo = glimtLogo39(ctx)
            if (logo != null) b.setLargeIcon(logo)
            if (Build.VERSION.SDK_INT >= 28) {
                val me = android.app.Person.Builder().setName("Du").build()
                val glimt = android.app.Person.Builder().setName("Glimt").setKey("glimt").setBot(true)
                    .apply { if (logo != null) setIcon(android.graphics.drawable.Icon.createWithBitmap(logo)) }.build()
                b.setStyle(Notification.MessagingStyle(me).addMessage(body, System.currentTimeMillis(), glimt))
            } else b.setStyle(Notification.BigTextStyle().bigText(body))
        } else b.setStyle(Notification.BigTextStyle().bigText(body))
        actions.forEach { b.addAction(it) }
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(id, b.build()) } catch (_: SecurityException) {}
        markSeen(ctx, tag)
    }

    /** Glimt-logoen (regnbuering med rød stjerne, res/drawable-nodpi/glimt39_varsel_rund.png). */
    private fun glimtLogo39(ctx: Context): android.graphics.Bitmap? =
        runCatching { android.graphics.BitmapFactory.decodeResource(ctx.resources, no.kristo.finanshub.R.drawable.glimt39_varsel_rund) }.getOrNull()

    fun cancel(ctx: Context, tag: String) = runCatching { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(tag.hashCode()) }

    /** Hvert 15. minutt med nett (beholdes hvis den finnes). */
    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<Notify31Worker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        runCatching { WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req) }
    }

    /** Med en gang: følger opp Glimt-jobber som ikke er ferdige. */
    fun followUp(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<Notify31Follow>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        runCatching { WorkManager.getInstance(ctx).enqueueUniqueWork(FOLLOW, ExistingWorkPolicy.REPLACE, req) }
    }

    /* ---------- Prøve-varsler ---------- */

    private fun trialPi(ctx: Context, code: Int, t: Trial31?, title: String, body: String, tId: String, url: String?): PendingIntent {
        val i = Intent(ctx, Trial31Receiver::class.java).setAction(ACT_FIRE)
            .putExtra("id", tId).putExtra("title", title).putExtra("body", body).putExtra("url", url).putExtra("service", t?.service)
        return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Planlegger alle kommende varsler for aktive prøver (de gamle fjernes først). */
    fun scheduleTrials(ctx: Context, trials: List<Trial31>) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val old = (sp(ctx).getString("alarms", "") ?: "").split(',').mapNotNull { it.toIntOrNull() }
        old.forEach { code -> am.cancel(PendingIntent.getBroadcast(ctx, code, Intent(ctx, Trial31Receiver::class.java).setAction(ACT_FIRE), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)) }
        val now = System.currentTimeMillis()
        val codes = ArrayList<Int>()
        for (t in trials.filter { it.status == "active" }) for ((at, tb) in trialTimes31(t)) {
            if (at <= now) continue
            val code = (t.id + "@" + at).hashCode()
            runCatching { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, trialPi(ctx, code, t, tb.first, tb.second, t.id, t.cancelUrl)) }
            codes += code
        }
        sp(ctx).edit().putString("alarms", codes.joinToString(",")).apply()
    }

    /** Minn meg i morgen kl. 09:00. */
    fun snoozeTrial(ctx: Context, id: String, title: String, body: String, url: String?) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val at = LocalDate.now(OSLO31).plusDays(1).atTime(LocalTime.of(9, 0)).atZone(OSLO31).toInstant().toEpochMilli()
        val code = (id + "@snooze").hashCode()
        runCatching { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, trialPi(ctx, code, null, title, body, id, url)) }
    }

    internal fun trialActions(ctx: Context, id: String, title: String, body: String, url: String?): List<Notification.Action> {
        val out = ArrayList<Notification.Action>()
        val cancelUrl = url ?: "finanshub://subs"
        val view = Intent(Intent.ACTION_VIEW, Uri.parse(cancelUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (cancelUrl.startsWith("finanshub://")) view.setPackage(ctx.packageName)
        out += Notification.Action.Builder(null, "Avslutt nå", PendingIntent.getActivity(ctx, (id + "c").hashCode(), view, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)).build()
        fun br(act: String, k: String) = PendingIntent.getBroadcast(ctx, (id + k).hashCode(),
            Intent(ctx, Trial31Receiver::class.java).setAction(act).putExtra("id", id).putExtra("title", title).putExtra("body", body).putExtra("url", url),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        out += Notification.Action.Builder(null, "Behold", br(ACT_KEEP, "k")).build()
        out += Notification.Action.Builder(null, "Minn meg i morgen", br(ACT_SNOOZE, "s")).build()
        return out
    }

    /** Aktiv konto og API (samme valg som widgetene). */
    internal fun api(ctx: Context): List<Api> {
        val store = AccountStore(ctx)
        val list = runCatching { store.load() }.getOrDefault(emptyList())
        val acc = list.firstOrNull { it.id == store.active() } ?: list.firstOrNull() ?: return emptyList()
        return listOf(acc.server, acc.local, acc.external).filter { it.isNotBlank() }.distinct().map { Api(it, acc.token) }
    }
}

/** Henter køen på serveren og planlegger prøve-varsler (hvert 15. minutt). */
class Notify31Worker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val apis = Notify31.api(ctx)
        for (api in apis) {
            try {
                if (!Notify31.sp(ctx).getBoolean("fg", false)) pending31(ctx, api)
                runCatching { Notify31.scheduleTrials(ctx, parseTrials31(api.get("/subscriptions/trials"))) }
                return Result.success()
            } catch (e: ApiException) {
                if (e.status == 401 || e.status == 404) return Result.success()
            } catch (_: Exception) {}
        }
        return Result.success()
    }
}

/** GET /api/notify/pending?since= → lokale varsler for det som kom mens appen var lukket. */
internal suspend fun pending31(ctx: Context, api: Api) {
    val sp = Notify31.sp(ctx)
    val since = sp.getLong("since", System.currentTimeMillis() - 3_600_000L)
    val raw = api.hlGet("/notify/pending?since=$since", timeout = 8000)
    val t = raw.trim()
    val o = if (t.startsWith("{")) JSONObject(t) else null
    val a = if (t.startsWith("[")) JSONArray(t) else o?.optJSONArray("items") ?: o?.optJSONArray("pending") ?: o?.optJSONArray("notifications") ?: JSONArray()
    var max = since
    val seen = Notify31.seen(ctx)
    for (i in 0 until a.length()) {
        val x = a.optJSONObject(i) ?: continue
        val ts = x.opt("ts").let { v -> when (v) { is Number -> v.toLong(); is String -> v.toLongOrNull() ?: runCatching { java.time.OffsetDateTime.parse(v).toInstant().toEpochMilli() }.getOrNull(); else -> null } }
            ?: x.optLong("created", 0L)
        if (ts > max) max = ts
        val cat = x.optString("category", "ai").ifBlank { "ai" }
        val ref = x.optString("jobId").ifBlank { x.optString("ref") }
        val tag = x.optString("tag").ifBlank { if (ref.isNotBlank()) "assist-$ref" else "pend-" + x.optString("id", ts.toString()) }
        // Prompt 51: «Ny enhet vil logge inn» (Sec51.kt), og varsler ntfy allerede har vist (Ntfy51.kt) vises ikke to ganger.
        if (runCatching { Sec51Notify.pending(ctx, x) }.getOrDefault(false)) { Notify31.markSeen(ctx, tag); continue }
        // Prompt 50: Sjekk inn (innsjekk, forespørsel, «Hent meg», svar, påminnelse) med handlinger og egen kanal (P50Fam.kt).
        // (Prompt 51: vises alltid, også når ntfy kom først – bare her finnes handlingene 👍 / Ring / Hent / Kart.)
        if (runCatching { pendingCheckin50(ctx, x, tag) }.getOrDefault(false)) continue
        if (runCatching { Ntfy51.seen(ctx, x) }.getOrDefault(false)) { Notify31.markSeen(ctx, tag); continue }
        if (tag in seen || (ref.isNotBlank() && ("assist-$ref" in seen || ref in seen))) continue
        val title = x.optString("title").ifBlank { "Glimt" }
        val body = plain31(x.optString("body").ifBlank { x.optString("text") })
        if (body.isBlank()) continue
        val url = x.optString("url").takeIf { it.isNotBlank() }?.let { u ->
            when {
                u.startsWith("finanshub://") -> u
                u.contains("/chat/") -> "finanshub://chat/" + u.substringAfterLast("/chat/").substringBefore('?')
                u.contains("system") || u.contains("oppdater") -> "finanshub://nordlys"
                u.contains("subscriptions") || u.contains("abo") -> "finanshub://subs"
                u.contains("kalender") -> "finanshub://kalender"
                else -> "finanshub://glimt"
            }
        }
        // Prompt 45: sonevarsler (category familie, data.kind zone) med soneikonet og egen kanal (ZoneNotify45).
        val data45 = x.optJSONObject("data")
        if (data45 != null && data45.optString("kind") == "zone") { ZoneNotify45.postPending(ctx, api, title, body, tag, data45); Notify31.markSeen(ctx, tag); continue }
        // Prompt 45: AI-svar med data.systemOnly vises bare som systemvarsel når appen ikke er åpen (aldri som banner ved retur).
        if (cat == "ai" && data45?.optBoolean("systemOnly") == true && Notify31.isForeground(ctx)) continue
        val trialId = x.optString("trialId").ifBlank { x.optJSONObject("data")?.optString("trialId").orEmpty() }
        val acts = if (cat == "trial" && trialId.isNotBlank()) Notify31.trialActions(ctx, trialId, title, body, x.optString("cancelUrl").takeIf { it.isNotBlank() }) else emptyList()
        Notify31.post(ctx, title, body, tag, url ?: "finanshub://glimt", if (cat == "trial") "trial" else if (cat == "ai") "ai" else "other", acts)
    }
    val now = o?.optLong("now", 0L)?.takeIf { it > 0 } ?: max
    sp.edit().putLong("since", maxOf(max, now)).apply()
}

/** Følger opp Glimt-jobber som ble startet like før appen ble lukket (opptil fire minutter). */
class Notify31Follow(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val api = Notify31.api(ctx).firstOrNull() ?: return Result.success()
        repeat(48) {
            if (Notify31.sp(ctx).getBoolean("fg", false)) return Result.success()
            val jobs = Notify31.jobs(ctx)
            val ids = jobs.keys().asSequence().toList()
            if (ids.isEmpty()) { runCatching { pending31(ctx, api) }; return Result.success() }
            for (id in ids) {
                val meta = jobs.optJSONObject(id) ?: continue
                if (System.currentTimeMillis() - meta.optLong("t") > 10 * 60_000L) { Notify31.forget(ctx, id); continue }
                val o = runCatching { JSONObject(api.hlGet("/assist/" + URLEncoder.encode(id, "UTF-8"), timeout = 6000)) }.getOrNull() ?: continue
                val r = o.optJSONObject("result") ?: o.optJSONObject("answer") ?: o
                val text = r.optString("text").ifBlank { r.optString("answer") }
                val st = o.optString("state", o.optString("status"))
                if (text.isBlank() && st != "failed") continue
                if (text.isNotBlank()) {
                    val chatId = (r.optJSONObject("chatContext") ?: o.optJSONObject("chatContext"))?.optString("chatId")?.takeIf { it.isNotBlank() }
                    val link = if (meta.optString("from") == "chat" && chatId != null) "finanshub://chat/$chatId" else "finanshub://glimt"
                    if ("assist-$id" !in Notify31.seen(ctx)) Notify31.post(ctx, "Glimt", plain31(text), "assist-$id", link, "ai")
                    // Banneret når appen åpnes igjen.
                    Notify31.sp(ctx).edit().putString("away", plain31(text)).apply()
                }
                Notify31.forget(ctx, id)
            }
            delay(5000)
        }
        return Result.success()
    }
}

/** Prøve-varselet (alarm) og handlingene Behold / Minn meg i morgen. */
class Trial31Receiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val title = intent.getStringExtra("title") ?: "Prøveperioden slutter snart"
        val body = intent.getStringExtra("body") ?: ""
        val url = intent.getStringExtra("url")
        val tag = "trial-$id"
        when (intent.action) {
            Notify31.ACT_FIRE -> Notify31.post(ctx, title, body, tag + "-" + title.hashCode(), url ?: "finanshub://subs", "trial", Notify31.trialActions(ctx, id, title, body, url))
            Notify31.ACT_KEEP, Notify31.ACT_SNOOZE -> {
                val keep = intent.action == Notify31.ACT_KEEP
                Notify31.cancel(ctx, tag + "-" + title.hashCode())
                if (!keep) Notify31.snoozeTrial(ctx, id, title, body, url)
                val pr = goAsync()
                Thread {
                    runCatching {
                        runBlocking {
                            for (api in Notify31.api(ctx)) {
                                val ok = runCatching {
                                    api.patch("/subscriptions/trials/" + URLEncoder.encode(id, "UTF-8"), if (keep) JSONObject().put("status", "kept") else JSONObject().put("snooze", "tomorrow"))
                                }.isSuccess
                                if (ok) break
                            }
                        }
                    }
                    pr.finish()
                }.start()
            }
        }
    }
}

/** Passordet for «Bruk fingeravtrykk» (System-siden): kryptert med Android Keystore, per konto. */
object Nordlys31Keys {
    private fun prefs(ctx: Context): SharedPreferences? = runCatching {
        EncryptedSharedPreferences.create("nordlys31", MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), ctx,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    }.getOrNull()
    fun has(ctx: Context, acct: String?): Boolean = acct != null && prefs(ctx)?.contains("pw_$acct") == true
    fun get(ctx: Context, acct: String?): String? = if (acct == null) null else prefs(ctx)?.getString("pw_$acct", null)
    fun save(ctx: Context, acct: String?, pw: String) { if (acct != null) prefs(ctx)?.edit()?.putString("pw_$acct", pw)?.apply() }
    fun clear(ctx: Context, acct: String?) { if (acct != null) prefs(ctx)?.edit()?.remove("pw_$acct")?.apply() }
}

/** Fingeravtrykk/ansikt med PIN som reserve (samme som låsen i MainActivity). Uten skjermlås: onFail (passord-arket). */
object Bio31 {
    fun confirm(ctx: Context, title: String, sub: String, onOk: () -> Unit, onFail: () -> Unit) {
        val act = ctx as? FragmentActivity ?: (ctx as? android.content.ContextWrapper)?.baseContext as? FragmentActivity
        if (act == null) { onFail(); return }
        val auth = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        if (BiometricManager.from(act).canAuthenticate(auth) != BiometricManager.BIOMETRIC_SUCCESS) { onFail(); return }
        val p = BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { Haptics.success(); onOk() }
            // Avbrutt av brukeren (5, 10, 13): ingenting skjer. Andre feil (låst ute, ingen sensor): passord-arket.
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { if (errorCode !in setOf(5, 10, 13)) onFail() }
        })
        p.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle(sub).setAllowedAuthenticators(auth).build())
    }
}
