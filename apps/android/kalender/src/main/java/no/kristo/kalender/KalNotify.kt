package no.kristo.kalender

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.time.LocalDateTime
import java.time.LocalTime

/*
 * Prompt 33: lokale varsler i Kalender-appen (AlarmManager + kanalen «Hendelser»).
 *  - Hendelser med varsel (rem): «Nina frisør · om 1 t · 14:30–15:30 · Frisør Nina, Grünerløkka», handlinger Utsett 10 min og Vis vei.
 *  - Bursdager kl. 09:00 samme dag. Studiefrister kl. 09:00 tre dager og én dag før.
 *  - Planlegges på nytt etter hver synk (14 dager frem), ved omstart og når appen oppdateres. Eksakte alarmer når telefonen
 *    tillater det (USE_EXACT_ALARM for kalender-apper), ellers setAndAllowWhileIdle (kan komme noen minutter for sent).
 *  - Trykk åpner kalender://hendelse?id=…&date=… (riktig dag med arket oppe).
 */

object KalNotify {
    const val CH_EVENTS = "hendelser"
    const val CH_GLIMT = "glimt"
    private const val PREF = "kalender_alarms"
    const val ACT_FIRE = "no.kristo.kalender.ALARM"
    const val ACT_SNOOZE = "no.kristo.kalender.SNOOZE"

    fun channels(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(NotificationChannel(CH_EVENTS, "Hendelser", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Varsler før hendelser, bursdager kl. 09 og studiefrister"
        })
        nm.createNotificationChannel(NotificationChannel(CH_GLIMT, "Glimt", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Svar fra Glimt og hendelser lagt til i bakgrunnen"
        })
    }

    fun canPost(ctx: Context): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Ett varsel: id (unik per hendelse og type), tidspunkt og innhold. */
    private data class Plan(val key: String, val at: LocalDateTime, val ev: KEv, val kind: String)

    private fun plans(evs: List<KEv>, now: LocalDateTime, bd: Boolean = true, fr: Boolean = true, abDays: (KEv) -> List<Int> = { emptyList() }): List<Plan> {
        val out = ArrayList<Plan>()
        val until = now.plusDays(14)
        evs.forEach { e ->
            if (e.pending && e.id.startsWith("x")) return@forEach
            val start = e.d.atTime(e.s?.let { LocalTime.of(it / 60 % 24, it % 60) } ?: LocalTime.of(9, 0))
            // Prompt 42: trekk fra Abonnementer (Innstillinger → Varsler → Abonnementer) – kl. 09:00 N dager før.
            if (e.ab != null) {
                abDays(e).forEach { n -> out += Plan("ab$n|${e.id}", e.d.minusDays(n.toLong()).atTime(9, 0), e, "ab$n") }
                return@forEach
            }
            when {
                e.kind == "bursdag" || (e.cal == "b" && e.all) -> if (bd) out += Plan("b|${e.id}|${e.d}", e.d.atTime(9, 0), e, "bursdag")
                e.kind == "frist" -> {
                    // Prompt 35: Innstillinger → Varsler → Studiefrister (3 d / 1 d) kan slås av.
                    if (fr) out += Plan("f3|${e.id}", e.d.minusDays(3).atTime(9, 0), e, "frist3")
                    if (fr) out += Plan("f1|${e.id}", e.d.minusDays(1).atTime(9, 0), e, "frist1")
                    if (!e.all && e.rem != null) out += Plan("r|${e.id}", start.minusMinutes(e.rem.toLong()), e, "rem")
                }
                !e.all && e.rem != null -> out += Plan("r|${e.id}", start.minusMinutes(e.rem.toLong()), e, "rem")
            }
        }
        return out.filter { it.at.isAfter(now) && it.at.isBefore(until) }.sortedBy { it.at }.take(120)
    }

    private fun rc(key: String) = key.hashCode() and 0x7fffffff

    private fun fireIntent(ctx: Context, p: Plan): PendingIntent {
        val i = Intent(ctx, KalAlarmReceiver::class.java).setAction(ACT_FIRE)
            .putExtra("key", p.key).putExtra("kind", p.kind).putExtra("ev", p.ev.toJson().toString())
        return PendingIntent.getBroadcast(ctx, rc(p.key), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** Planlegger alle varslene på nytt ut fra cachen (avlyser dem som ikke lenger finnes). */
    fun reschedule(ctx: Context) {
        val app = ctx.applicationContext
        val am = app.getSystemService(AlarmManager::class.java) ?: return
        val evs = KalStore.current(app).withOverrides(app)
        // Prompt 39: Rediger → Varsel av for en kalender gir ingen varsler derfra.
        val hidden = hiddenAll35(app) + Kal39.notifyOff(KalStore.current(app).cals)
        val ps = plans(evs.filter { it.cal !in hidden }, LocalDateTime.now(OSLO), Kal35Prefs.notifyBirthdays(app), Kal35Prefs.notifyDeadlines(app)) { Ab42.notifyDays(app, it) }
        val sp = app.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val old = sp.getStringSet("keys", emptySet()) ?: emptySet()
        val now = ps.map { it.key }.toSet()
        (old - now).forEach { k ->
            val i = Intent(app, KalAlarmReceiver::class.java).setAction(ACT_FIRE)
            PendingIntent.getBroadcast(app, rc(k), i, PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)?.let { am.cancel(it); it.cancel() }
        }
        ps.forEach { p -> set(app, am, p.at, fireIntent(app, p)) }
        sp.edit().putStringSet("keys", now).apply()
    }

    private fun set(ctx: Context, am: AlarmManager, at: LocalDateTime, pi: PendingIntent) {
        val ms = at.atZone(OSLO).toInstant().toEpochMilli()
        val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        runCatching {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi) else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi)
        }.onFailure { runCatching { am.set(AlarmManager.RTC_WAKEUP, ms, pi) } }
    }

    /** kalender://hendelse?id=…&date=…&t=…&s=…&e=… (samme lenke som widgetene og Homelab bruker). */
    fun eventLink(e: KEv): String = "kalender://hendelse?id=" + Uri.encode(e.id) + "&date=" + e.d + "&t=" + Uri.encode(e.t) +
        (e.s?.let { "&s=" + hm(it) } ?: "") + (e.e?.let { "&e=" + hm(it) } ?: "")

    fun openIntent(ctx: Context, link: String, req: Int): PendingIntent = PendingIntent.getActivity(
        ctx, req, Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    /** «om 1 t» / «om 10 min» / «i dag» / «om 3 dager». */
    private fun inText(e: KEv, kind: String): String = when (kind) {
        "bursdag" -> "i dag"
        "frist3" -> "om 3 dager"
        "frist1" -> "i morgen"
        else -> {
            val mins = (e.rem ?: 0)
            if (mins >= 1440) "i morgen" else if (mins >= 60) "om ${mins / 60} t" else "om $mins min"
        }
    }

    fun show(ctx: Context, e: KEv, kind: String, key: String, snoozed: Boolean = false) {
        if (!canPost(ctx)) return
        channels(ctx)
        val time = if (e.all) "Hele dagen" else hm(e.s ?: 0) + "–" + hm(e.e ?: ((e.s ?: 0) + 60))
        val title = when {
            kind.startsWith("ab") -> Ab42.short(e)
            else -> when (kind) {
            "bursdag" -> "🎂 " + e.t
            "frist3", "frist1" -> "Frist " + inText(e, kind) + ": " + e.t.replace(Regex("^Frist: "), "")
            else -> e.t
        } }
        val body = if (kind.startsWith("ab")) Ab42.notifyText(e, kind.removePrefix("ab").toIntOrNull() ?: 1)
            else listOfNotNull(if (kind == "rem") (if (snoozed) "om 10 min" else inText(e, kind)) else null, time, e.loc).joinToString(" · ")
        val id = rc(key)
        val b = NotificationCompat.Builder(ctx, CH_EVENTS)
            .setSmallIcon(no.kristo.kalender.R.drawable.ic_kal_notif)
            .setColor(0xFFB23A2A.toInt())
            .setContentTitle(if (kind == "rem") e.t + " · " + (if (snoozed) "om 10 min" else inText(e, kind)) else title)
            .setContentText(if (kind == "rem") listOfNotNull(time, e.loc).joinToString(" · ") else body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(if (kind == "rem") listOfNotNull(time, e.loc).joinToString(" · ") else body))
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(openIntent(ctx, eventLink(e), id))
        if (kind == "rem") {
            val sn = Intent(ctx, KalAlarmReceiver::class.java).setAction(ACT_SNOOZE).putExtra("key", key).putExtra("kind", kind).putExtra("ev", e.toJson().toString())
            b.addAction(0, "Utsett 10 min", PendingIntent.getBroadcast(ctx, id xor 0x5A5A, sn, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        e.loc?.takeIf { it.isNotBlank() }?.let { loc ->
            val nav = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(loc))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            b.addAction(0, "Vis vei", PendingIntent.getActivity(ctx, id xor 0x3C3C, nav, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        runCatching { NotificationManagerCompat.from(ctx).notify(key, 1, b.build()) }
    }

    fun snooze(ctx: Context, e: KEv, key: String) {
        runCatching { NotificationManagerCompat.from(ctx).cancel(key, 1) }
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val i = Intent(ctx, KalAlarmReceiver::class.java).setAction(ACT_FIRE).putExtra("key", key).putExtra("kind", "rem").putExtra("snoozed", true).putExtra("ev", e.toJson().toString())
        set(ctx, am, LocalDateTime.now(OSLO).plusMinutes(10), PendingIntent.getBroadcast(ctx, rc(key + "|s"), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }

    /** Glimt svarte mens appen var i bakgrunnen, eller en innlimt melding ble lagt inn. */
    fun glimt(ctx: Context, title: String, text: String, link: String = "kalender://liste") {
        if (!canPost(ctx)) return
        channels(ctx)
        val id = (title + text).hashCode() and 0x7fffffff
        val n = NotificationCompat.Builder(ctx, CH_GLIMT).setSmallIcon(no.kristo.kalender.R.drawable.ic_kal_notif).setColor(0xFFB23A2A.toInt())
            .setContentTitle(title).setContentText(text).setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true).setContentIntent(openIntent(ctx, link, id)).build()
        runCatching { NotificationManagerCompat.from(ctx).notify("glimt", id, n) }
    }
}

class KalAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val ev = intent.getStringExtra("ev")?.let { runCatching { KEv.fromJson(org.json.JSONObject(it)) }.getOrNull() } ?: return
        val key = intent.getStringExtra("key") ?: return
        when (intent.action) {
            KalNotify.ACT_SNOOZE -> KalNotify.snooze(context, ev, key)
            else -> {
                // Slettet eller flyttet siden alarmen ble satt: ikke varsle.
                val cur = KalStore.current(context).events.firstOrNull { it.id == ev.id }
                if (cur != null && (cur.d != ev.d || cur.s != ev.s) && intent.getBooleanExtra("snoozed", false).not()) return
                KalNotify.show(context, cur?.copy(rem = ev.rem) ?: ev, intent.getStringExtra("kind") ?: "rem", key, intent.getBooleanExtra("snoozed", false))
            }
        }
    }
}

/** Etter omstart og oppdatering: varslene og widget-hentingen settes opp på nytt. */
class KalBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        runCatching { KalNotify.reschedule(context) }
        runCatching { no.kristo.kalender.widget.KalSync.schedule(context) }
    }
}
