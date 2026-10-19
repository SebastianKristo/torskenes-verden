package no.kristo.finanshub

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/*
 * Prompt 37 (ANDROID37): lokale varsler.
 *  - Gjøremål: «Viktig» ringer som en alarm (AlarmManager.setAlarmClock + fullskjerm-varsel på egen kanal med alarmlyd, også i Ikke forstyrr
 *    når brukeren tillater det), og «Tidlig påminnelse» (5 min … 1 uke før) som vanlig varsel. Planlegges på nytt når listen hentes.
 *  - Bibelvers: «Dagens vers er klart» kl. 07:00 når Daglig påminnelse er på (bare med modulen).
 */
object Alarms37 {
    private const val PREFS = "alarms37"
    private const val CH_ALARM = "gjoremal_alarm37"
    const val ACT_TASK = "no.kristo.finanshub.TASK37"
    const val ACT_BIBLE = "no.kristo.finanshub.BIBLE37"

    private fun sp(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun pi(ctx: Context, code: Int, i: Intent): PendingIntent =
        PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun openPi(ctx: Context, link: String, code: Int): PendingIntent =
        PendingIntent.getActivity(ctx, code, Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun exactOk(am: AlarmManager): Boolean = Build.VERSION.SDK_INT < 31 || runCatching { am.canScheduleExactAlarms() }.getOrDefault(false)

    /** Planlegger alarmer og tidlige påminnelser for åpne oppgaver med dato og tid (de gamle fjernes først). */
    fun schedule(ctx: Context, data: TasksData?) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val p = sp(ctx)
        (p.getString("codes", "") ?: "").split(',').mapNotNull { it.toIntOrNull() }.forEach { c -> runCatching { am.cancel(pi(ctx, c, Intent(ctx, Task37Receiver::class.java).setAction(ACT_TASK))) } }
        val codes = ArrayList<Int>()
        val now = System.currentTimeMillis()
        val zone = OSLO37
        for (t in data?.items ?: emptyList()) {
            if (t.done || t.due == null) continue
            val d = runCatching { LocalDate.parse(t.due.take(10)) }.getOrNull() ?: continue
            val tm = t.time?.let { runCatching { LocalTime.parse(it.padStart(5, '0')) }.getOrNull() } ?: if (t.urgent || t.early != null) LocalTime.of(9, 0) else continue
            val at = LocalDateTime.of(d, tm).atZone(zone).toInstant().toEpochMilli()
            val list = data?.lists?.firstOrNull { it.id == t.list }?.name
            fun put(whenMs: Long, alarm: Boolean, body: String) {
                if (whenMs <= now || whenMs - now > 40L * 86_400_000) return
                val code = (t.id + "@" + whenMs).hashCode()
                val i = Intent(ctx, Task37Receiver::class.java).setAction(ACT_TASK).putExtra("id", t.id).putExtra("title", t.title).putExtra("body", body).putExtra("alarm", alarm)
                runCatching {
                    if (alarm && exactOk(am)) am.setAlarmClock(AlarmManager.AlarmClockInfo(whenMs, openPi(ctx, "finanshub://huske", code)), pi(ctx, code, i))
                    else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, whenMs, pi(ctx, code, i))
                }
                codes += code
            }
            val hm = "%02d:%02d".format(tm.hour, tm.minute)
            if (t.urgent) put(at, true, "Viktig · kl. $hm" + (list?.let { " · $it" } ?: ""))
            earlyMin37(t.early)?.let { m -> put(at - m * 60_000, false, "Kl. $hm" + (list?.let { " · $it" } ?: "")) }
        }
        p.edit().putString("codes", codes.joinToString(",")).apply()
    }

    /** Daglig påminnelse kl. 07:00 («Dagens vers er klart»). */
    fun bible(ctx: Context, on: Boolean) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val i = pi(ctx, 3707, Intent(ctx, Task37Receiver::class.java).setAction(ACT_BIBLE))
        runCatching { am.cancel(i) }
        sp(ctx).edit().putBoolean("bible", on).apply()
        if (!on) return
        var at = LocalDate.now(OSLO37).atTime(7, 0)
        if (!at.atZone(OSLO37).toInstant().isAfter(java.time.Instant.now())) at = at.plusDays(1)
        runCatching { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.atZone(OSLO37).toInstant().toEpochMilli(), i) }
    }

    internal fun bibleOn(ctx: Context) = sp(ctx).getBoolean("bible", false)

    /** Alarmkanalen: høy viktighet, alarmlyd. */
    private fun alarmChannel(ctx: Context): String {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CH_ALARM) == null) {
            val ch = NotificationChannel(CH_ALARM, "Viktige gjøremål", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Viktige gjøremål ringer som en alarm"
                setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
                enableVibration(true)
                setBypassDnd(true)
            }
            nm.createNotificationChannel(ch)
        }
        return CH_ALARM
    }

    fun alarm(ctx: Context, id: String, title: String, body: String) {
        if (!Notify.allowed(ctx)) return
        val code = ("alarm37-$id").hashCode()
        val open = openPi(ctx, "finanshub://huske", code)
        val n = Notification.Builder(ctx, alarmChannel(ctx))
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title).setContentText(body)
            .setCategory(Notification.CATEGORY_ALARM)
            .setAutoCancel(true).setContentIntent(open)
            .setFullScreenIntent(open, true)
            .build()
        runCatching { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(code, n) }
    }
}

/** Alarmen / påminnelsen for en oppgave, og bibelvers-påminnelsen. */
class Task37Receiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            Alarms37.ACT_TASK -> {
                val id = intent.getStringExtra("id") ?: return
                val title = intent.getStringExtra("title") ?: "Gjøremål"
                val body = intent.getStringExtra("body") ?: ""
                if (intent.getBooleanExtra("alarm", false)) Alarms37.alarm(ctx, id, title, body)
                else Notify31.post(ctx, title, body, "task37-$id", "finanshub://huske", "reminder")
            }
            Alarms37.ACT_BIBLE -> {
                if (!Alarms37.bibleOn(ctx)) return
                val v = no.kristo.finanshub.widget.Bible37Store.current(ctx)
                if (v != null || no.kristo.finanshub.widget.Bible37Store.enabled(ctx)) {
                    Notify31.post(ctx, "Dagens vers er klart", v?.let { "«${it.text.take(90)}» ${it.ref}" } ?: "Les dagens vers i Homelab", "bible37-" + LocalDate.now(OSLO37), "finanshub://bibel", "reminder")
                }
                Alarms37.bible(ctx, true)
            }
        }
    }
}
