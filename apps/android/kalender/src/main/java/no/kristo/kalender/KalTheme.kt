package no.kristo.kalender

import android.app.UiModeManager
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import java.lang.ref.WeakReference

/*
 * Prompt 33: Papir-tokens (fasit: THM.light / THM.dark i Kalender App.dc.html) og fontene Newsreader, Manrope og IBM Plex Mono.
 * «UTSEENDE: System · Lys · Mørk» (kalapp_th). System følger UI_MODE_NIGHT og bytter live. Android 12+: også
 * UiModeManager.setApplicationNightMode (plattformens versjon av AppCompatDelegate.setDefaultNightMode – appcompat er ikke en
 * avhengighet i prosjektet), så systemvinduer og vindusbakgrunnen følger valget.
 */

@Immutable
data class KTok(
    val bg: Color, val ink: Color, val card: Color, val chip: Color, val line: Color, val line2: Color,
    val mut: Color, val mut2: Color, val ink2: Color, val acc: Color, val glass: Color, val dim: Color, val dark: Boolean,
) {
    /** Søndag og i dag-tekst. */
    val sun: Color get() = if (dark) Color(0xFFEC7A64) else Color(0xFFB23A2A)
}

val KLight = KTok(
    bg = Color(0xFFF3EFE6), ink = Color(0xFF1B1A17), card = Color(0xFFFFFDF8), chip = Color(0xFFE9E2D3), line = Color(0xFFDDD5C5), line2 = Color(0xFFE6DFD1),
    mut = Color(0xFF6B665C), mut2 = Color(0xFFA39D90), ink2 = Color(0xFF3D3A33), acc = Color(0xFFB23A2A), glass = Color(0xD1FFFDF8), dim = Color(0x521B1A17), dark = false,
)
val KDark = KTok(
    bg = Color(0xFF161513), ink = Color(0xFFEFE9DE), card = Color(0xFF211F1B), chip = Color(0xFF2B2824), line = Color(0xFF3B3731), line2 = Color(0xFF2E2B26),
    mut = Color(0xFFA49D91), mut2 = Color(0xFF7A746A), ink2 = Color(0xFFD6CFC2), acc = Color(0xFFEC7A64), glass = Color(0xD6211F1B), dim = Color(0x8C000000), dark = true,
)

val LocalK = staticCompositionLocalOf { KLight }

/** Den røde aksenten som alltid er #b23a2a (pluss-knappen, i dag-sirkelen, nå-linjen). */
val Red = Color(0xFFB23A2A)
val Green = Color(0xFF2F7A4F)

val Newsreader = FontFamily(
    Font(no.kristo.kalender.R.font.newsreader_regular, FontWeight.Normal),
    Font(no.kristo.kalender.R.font.newsreader_medium, FontWeight.Medium),
)
val Manrope = FontFamily(
    Font(no.kristo.kalender.R.font.manrope_regular, FontWeight.Normal),
    Font(no.kristo.kalender.R.font.manrope_medium, FontWeight.Medium),
    Font(no.kristo.kalender.R.font.manrope_semibold, FontWeight.SemiBold),
    Font(no.kristo.kalender.R.font.manrope_bold, FontWeight.Bold),
    Font(no.kristo.kalender.R.font.manrope_bold, FontWeight.ExtraBold),
)
/**
 * Prompt 35: ukenummer i IBM Plex Mono 800. Appen har bare SemiBold-filen; den registreres som Normal her, så Compose
 * syntetiserer fet skrift (FontSynthesis.Weight) når 800 bes om – tydeligere enn 600 uten en ny fontfil.
 */
val PlexMonoX = FontFamily(Font(no.kristo.kalender.R.font.plexmono_semibold, FontWeight.Normal))
val PlexMono = FontFamily(Font(no.kristo.kalender.R.font.plexmono_semibold, FontWeight.SemiBold), Font(no.kristo.kalender.R.font.plexmono_semibold, FontWeight.Medium))

object KalTheme {
    /** Android 12+: appens nattmodus etter valget (system | light | dark). */
    fun apply(ctx: Context, th: String) {
        if (Build.VERSION.SDK_INT < 31) return
        runCatching {
            ctx.getSystemService(UiModeManager::class.java)?.setApplicationNightMode(
                when (th) { "light" -> UiModeManager.MODE_NIGHT_NO; "dark" -> UiModeManager.MODE_NIGHT_YES; else -> UiModeManager.MODE_NIGHT_AUTO },
            )
        }
    }
}

/** «Reduser bevegelse» / animasjoner av i systemet: bare fade. */
@Composable
fun reduceMotion(): Boolean {
    val ctx = LocalContext.current
    return remember { runCatching { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false) }
}

/**
 * Material-haptikk via vinduets rotvisning (følger «Vibrasjon og haptikk» i systemet): lett tikk ved alle bytter,
 * bekreftelse når noe er lagt til eller Glimt er ferdig.
 */
object Hap {
    private var view: WeakReference<View>? = null
    fun attach(v: View) { view = WeakReference(v) }
    private fun perform(c: Int) { view?.get()?.let { v -> v.post { v.performHapticFeedback(c) } } }
    fun tick() = perform(HapticFeedbackConstants.CLOCK_TICK)
    fun dismiss() = perform(HapticFeedbackConstants.CONTEXT_CLICK)
    fun done() = perform(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
    fun error() = perform(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS)
}
