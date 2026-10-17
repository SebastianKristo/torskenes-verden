package no.kristo.finanshub

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/**
 * Haptikk (Innstillinger → App → Haptikk): hovedbryter, styrke og egne brytere per type.
 * Bruker view.performHapticFeedback uten FLAG_IGNORE_GLOBAL_SETTING, så «Vibrasjon og haptikk» i Android-innstillingene gjelder.
 */
object Haptics {
    const val ON = "haptics"
    const val STRENGTH = "haptic_strength"   // light | medium | heavy
    const val TAP = "haptic_tap"
    const val DONE = "haptic_done"
    const val ERROR = "haptic_error"
    const val PKG = "haptic_pkg"

    private var view: WeakReference<View>? = null
    private var prefs: AppPrefs? = null

    fun attach(v: View, p: AppPrefs) { view = WeakReference(v); prefs = p }

    private fun on(k: String): Boolean { val p = prefs ?: return true; return p.bool(ON, true) && p.bool(k, true) }
    private val strength get() = prefs?.str(STRENGTH, "medium") ?: "medium"

    private fun perform(c: Int) { view?.get()?.let { v -> v.post { v.performHapticFeedback(c) } } }

    private val confirm get() = if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
    private val reject get() = if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
    private val impact get() = when (strength) {
        "light" -> HapticFeedbackConstants.CLOCK_TICK
        "heavy" -> HapticFeedbackConstants.LONG_PRESS
        else -> HapticFeedbackConstants.VIRTUAL_KEY
    }

    /** Trykk på en knapp. */
    fun tap() { if (on(TAP)) perform(impact) }
    /** Fanebytte, chips og valg. */
    fun select() { if (on(TAP)) perform(HapticFeedbackConstants.CLOCK_TICK) }
    fun success() { if (on(DONE)) perform(confirm) }
    fun error() { if (on(ERROR)) perform(reject) }
    /** Ny pakkestatus (klar for henting, levert …). */
    fun pkg() { if (on(PKG)) perform(confirm) }
    /** Testknappen: trykk, tikk og bekreftelse etter hverandre (følger hovedbryteren). */
    fun test() {
        if (prefs?.bool(ON, true) == false) return
        val v = view?.get() ?: return
        v.performHapticFeedback(impact)
        v.postDelayed({ v.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) }, 260)
        v.postDelayed({ v.performHapticFeedback(confirm) }, 520)
    }
}

/** Lokale varsler (Sporing). Ekte push fra serveren er ikke bygget; varslene kommer når appen henter status. */
object Notify {
    private const val CHANNEL = "tracking"

    fun allowed(ctx: Context) = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    fun post(ctx: Context, title: String, text: String, id: String) {
        if (!allowed(ctx)) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Sporing", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Klar for henting, levert og andre pakkevarsler" })
        }
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP }
        val pi = open?.let { android.app.PendingIntent.getActivity(ctx, id.hashCode(), it, android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT) }
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(title).setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .apply { if (pi != null) setContentIntent(pi) }
            .build()
        try { NotificationManagerCompat.from(ctx).notify(id.hashCode(), n) } catch (_: SecurityException) {}
    }
}
