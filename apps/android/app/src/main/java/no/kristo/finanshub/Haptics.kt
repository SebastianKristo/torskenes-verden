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
    /** Fanebytte, chips og valg. Ikke rett etter en tilbake-impuls (ett trykk = én impuls). */
    fun select() { if (on(TAP) && android.os.SystemClock.uptimeMillis() - lastBack > 120) perform(HapticFeedbackConstants.CLOCK_TICK) }

    @Volatile private var lastBack = 0L
    /**
     * Prompt 34 (claude-code-haptikk-tilbake.md): lett impuls på alle tilbake-knapper, sveip tilbake (når siden lukkes),
     * systemets tilbake, Hjem fra en annen side, Ferdig/✕ i fullskjermsider. Debounce 120 ms; følger Haptikk-bryteren.
     */
    fun back() {
        val now = android.os.SystemClock.uptimeMillis()
        if (now - lastBack < 120) return
        lastBack = now
        if (on(TAP)) perform(HapticFeedbackConstants.KEYBOARD_TAP)
    }
    /** Prompt 30: lett tikk når et ark, en popup eller en meny lukkes (CONTEXT_CLICK). */
    fun dismiss() { if (on(TAP)) perform(HapticFeedbackConstants.CONTEXT_CLICK) }
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

/**
 * Lokale varsler. Ekte push fra serveren er ikke bygget; varslene kommer når appen henter status (og fra Familie-tjenesten).
 * Innstillinger → Varsler: hovedbryter, stille timer, lyd (fem innebygde, egen lyd eller stille), volum og grupper.
 * Android låser lyden til kanalen, så hver lyd har sin egen kanal («varsel39_<lyd>», prompt 39). Egen lyd spilles av appen selv.
 */
object Notify {
    private const val PREFS = "notify_prefs"

    fun allowed(ctx: Context) = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Lagrer valgene lokalt, så tjenester i bakgrunnen (Familie) følger dem uten å spørre serveren. */
    fun applyPrefs(ctx: Context, n: NotifyPrefs) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("on", n.on).putBoolean("quiet", n.quiet).putString("from", n.quietFrom).putString("to", n.quietTo)
            .putString("sound", n.sound).putInt("volume", n.volume)
            .apply { n.groups.forEach { (k, v) -> putBoolean("g_$k", v) } }
            .apply()
    }

    private fun quietNow(sp: android.content.SharedPreferences): Boolean {
        if (!sp.getBoolean("quiet", true)) return false
        fun mins(t: String?) = t?.split(':')?.let { (it.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (it.getOrNull(1)?.toIntOrNull() ?: 0) }
        val from = mins(sp.getString("from", "22:00")) ?: return false
        val to = mins(sp.getString("to", "07:00")) ?: return false
        val now = java.time.LocalTime.now().let { it.hour * 60 + it.minute }
        return if (from <= to) now in from until to else now >= from || now < to
    }

    /** Prompt 39: kanalene og lyden ligger i Sound39 (nye kanal-ID-er med myk lyd, de gamle slettes). */
    private fun channel(ctx: Context, sound: String): String = Sound39.soundChannel(ctx, sound)

    /** Spiller egen lyd (eller en innebygd ved forhåndslytting) via SoundPool, dempet og bare når telefonen ikke er på lydløs. */
    private fun play(ctx: Context, sound: String, volume: Int) = Sound39.play(ctx, sound, volume, if (sound == "egen") customFile(ctx) else null)

    @SuppressLint("MissingPermission")
    fun post(ctx: Context, title: String, text: String, id: String, group: String = "pakker") {
        if (!allowed(ctx)) return
        val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!sp.getBoolean("on", true) || !sp.getBoolean("g_$group", true)) return
        val quiet = quietNow(sp)
        val sound = if (quiet) "stille" else sp.getString("sound", Sound39.DEFAULT) ?: Sound39.DEFAULT
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP }
        val pi = open?.let { android.app.PendingIntent.getActivity(ctx, id.hashCode(), it, android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT) }
        // Finans og hjem: egen kanal uten lyd (IMPORTANCE_LOW). Én lyd per varsel: kanalens lyd, aldri i tillegg fra appen.
        val ch = if (group == "finans") Sound39.finansChannel(ctx) else channel(ctx, sound)
        val n = NotificationCompat.Builder(ctx, ch)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(title).setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setSilent(quiet)
            .apply { if (pi != null) setContentIntent(pi) }
            .build()
        try { NotificationManagerCompat.from(ctx).notify(id.hashCode(), n) } catch (_: SecurityException) {}
        if (!quiet && sound == "egen" && group != "finans") play(ctx, "egen", sp.getInt("volume", Sound39.DEFAULT_VOLUME))
    }

    /** «Test varsel»: viser et varsel med valgt lyd (stille timer gjelder ikke for testen). */
    @SuppressLint("MissingPermission")
    fun test(ctx: Context, p: NotifyPrefs) {
        applyPrefs(ctx, p)
        val sound = p.sound
        val n = NotificationCompat.Builder(ctx, channel(ctx, sound))
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle("Test varsel")
            .setContentText(when (sound) { "stille" -> "Varsler kommer uten lyd."; "egen" -> "Slik høres din egen lyd ut."; else -> "Slik høres og kjennes varslene ut." })
            .setAutoCancel(true)
            .build()
        try { NotificationManagerCompat.from(ctx).notify("test-varsel".hashCode(), n) } catch (_: SecurityException) {}
        if (sound == "egen") play(ctx, "egen", p.volume)
    }

    /** Forhåndslytt på en lyd i listen. */
    fun preview(ctx: Context, sound: String, volume: Int) { if (sound != "stille") play(ctx, sound, volume) }

    private fun customFile(ctx: Context): java.io.File? =
        java.io.File(ctx.filesDir, "sounds").listFiles()?.firstOrNull { it.name.startsWith("egen.") }

    fun saveCustomSound(ctx: Context, data: ByteArray, ext: String) {
        val dir = java.io.File(ctx.filesDir, "sounds").apply { mkdirs() }
        dir.listFiles()?.forEach { if (it.name.startsWith("egen.")) it.delete() }
        java.io.File(dir, "egen.$ext").writeBytes(data)
    }
    fun deleteCustomSound(ctx: Context) { java.io.File(ctx.filesDir, "sounds").listFiles()?.forEach { if (it.name.startsWith("egen.")) it.delete() } }
}
