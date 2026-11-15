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
import no.kristo.kalender.ui.designsystem.DsColors
import no.kristo.kalender.ui.designsystem.DsPalette
import java.lang.ref.WeakReference

/*
 * Prompt 33: Papir-tokens (fasit: THM.light / THM.dark i Kalender App.dc.html) og fontene Newsreader, Manrope og IBM Plex Mono.
 * «UTSEENDE: System · Lys · Mørk» (kalapp_th). System følger UI_MODE_NIGHT og bytter live. Android 12+: også
 * UiModeManager.setApplicationNightMode (plattformens versjon av AppCompatDelegate.setDefaultNightMode – appcompat er ikke en
 * avhengighet i prosjektet), så systemvinduer og vindusbakgrunnen følger valget.
 */

/**
 * Fargerollene i Kalender-appen. Verdiene kommer fra designtokenene (shared/design/tokens.json → ui/designsystem/DesignTokens.kt,
 * Papir lys/mørk); KTok gir bare de gamle kortnavnene som skjermene bruker. Direkte tilgang til alle roller: [ds].
 *
 * | KTok | token |                          | KTok  | token |
 * |------|-------|                          |-------|-------|
 * | bg   | surface                  |       | mut   | textSecondary |
 * | card | surfaceRaised            |       | mut2  | textTertiary |
 * | chip | surfaceChip              |       | ink   | textPrimary |
 * | line | line                     |       | ink2  | textPrimary 85 % |
 * | line2| lineSubtle               |       | acc / sun | accent |
 * | glass| surfaceRaised 82–84 %    |       | dim   | scrim |
 */
@Immutable
data class KTok(val ds: DsColors) {
    val dark: Boolean get() = ds.isDark
    val bg: Color get() = ds.surface
    val ink: Color get() = ds.textPrimary
    val card: Color get() = ds.surfaceRaised
    val chip: Color get() = ds.surfaceChip
    val line: Color get() = ds.line
    val line2: Color get() = ds.lineSubtle
    val mut: Color get() = ds.textSecondary
    val mut2: Color get() = ds.textTertiary
    val ink2: Color get() = ds.textPrimary.copy(alpha = .85f)
    val acc: Color get() = ds.accent
    val glass: Color get() = ds.surfaceRaised.copy(alpha = if (ds.isDark) .84f else .82f)
    val dim: Color get() = ds.scrim
    /** Søndag og i dag-tekst. */
    val sun: Color get() = ds.accent
}

val KLight = KTok(DsPalette.PapirLys)
val KDark = KTok(DsPalette.PapirMork)

val LocalK = staticCompositionLocalOf { KLight }

/** Den røde aksenten som alltid er Papir lys-aksenten (pluss-knappen, i dag-sirkelen, nå-linjen), også i mørk modus. */
val Red: Color = DsPalette.PapirLys.accent
val Green: Color = DsPalette.Category.green

/**
 * Illustrasjonsfarger som ikke finnes i tokensettet ennå: Glimt-stjernen og -ringen, konfettien og festhatten på bursdagskortet.
 * De er samlet her i stedet for spredt i skjermene. Når tokens.json får en Glimt-gradient, byttes de ut (meldt i Fase 5-rapporten).
 */
object Illustrasjon {
    val glimtOransje = Color(0xFFE8794A)
    val glimtLilla = Color(0xFF7A5AD6)
    val glimtGronn = Color(0xFF3FBF9A)
    val glimtGul = Color(0xFFF2C14E)
    val stjerneLys = Color(0xFFFFB38A)
    val stjerneMork = Color(0xFFFF5A3C)
    val gnist = Color(0xFFFFD9C2)
    val konfettiBla = Color(0xFFA8D4FB)
    val konfettiRosa = Color(0xFFFFD2C2)
}

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
