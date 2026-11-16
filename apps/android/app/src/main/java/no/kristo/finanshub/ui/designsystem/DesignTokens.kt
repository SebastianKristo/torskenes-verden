// GENERERT av scripts/design-tokens.mjs fra shared/design/tokens.json – ikke rediger.
// Designtokens for Compose. Se docs/designsystem.md.
package no.kristo.finanshub.ui.designsystem

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Visuell stil. Glass har bare mørk modus (Q13): i lys modus gir glass samme farger som papir. */
enum class DsStil { Papir, Glass }

/** Kategorifarger (fyll). Tekst og ikon oppå bruker onCategory (≥ 4.5:1). Like i alle stiler og moduser. */
@Immutable
data class DsCategoryColors(
    val onCategory: Color,
    val onCategoryLight: Color,
    val blue: Color,
    val red: Color,
    val purple: Color,
    val green: Color,
    val teal: Color,
    val pink: Color,
    val amber: Color,
    val brown: Color,
    val neutral: Color,
)

/** Alle semantiske farger for én stil og modus (også de som ikke finnes i Material 3). Alfa er beholdt. */
@Immutable
data class DsColors(
    val isDark: Boolean,
    val surface: Color,
    val surfaceRaised: Color,
    val surfaceSunken: Color,
    val line: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val accent: Color,
    val onAccent: Color,
    val success: Color,
    val onSuccess: Color,
    val warning: Color,
    val onWarning: Color,
    val danger: Color,
    val onDanger: Color,
    val focus: Color,
    val scrim: Color,
    val surfaceField: Color,
    val surfaceChip: Color,
    val surfaceOverlay: Color,
    val lineSubtle: Color,
    val info: Color,
    val onInfo: Color,
    val successSoft: Color,
    val warningSoft: Color,
    val dangerSoft: Color,
    val category: DsCategoryColors,
)

object DsPalette {
    val Category = DsCategoryColors(
        onCategory = Color(0xFFFFFFFF),
        onCategoryLight = Color(0xFF000000),
        blue = Color(0xFF2B5D8A),
        red = Color(0xFFD4231B),
        purple = Color(0xFF6B4FA0),
        green = Color(0xFF2F7A4F),
        teal = Color(0xFF1F7A6E),
        pink = Color(0xFFC2477A),
        amber = Color(0xFFA8661A),
        brown = Color(0xFF8A6A3A),
        neutral = Color(0xFF55524D),
    )

    val PapirLys = DsColors(
        isDark = false,
        surface = Color(0xFFF3EFE6),
        surfaceRaised = Color(0xFFFFFDF8),
        surfaceSunken = Color(0xFFEBE5D8),
        line = Color(0xFFD8D1C2),
        textPrimary = Color(0xFF1B1A17),
        textSecondary = Color(0xFF5C5850),
        textTertiary = Color(0xFF8F897C),
        accent = Color(0xFFB23A2A),
        onAccent = Color(0xFFFFFFFF),
        success = Color(0xFF2F7A4F),
        onSuccess = Color(0xFFFFFFFF),
        warning = Color(0xFFA8661A),
        onWarning = Color(0xFFFFFFFF),
        danger = Color(0xFFB23A2A),
        onDanger = Color(0xFFFFFFFF),
        focus = Color(0xFF1B1A17),
        scrim = Color(0x59000000),
        surfaceField = Color(0xFFFFFFFF),
        surfaceChip = Color(0xFFECE6DA),
        surfaceOverlay = Color(0xFFFFFDF8),
        lineSubtle = Color(0xFFE3DDCF),
        info = Color(0xFF2B5D8A),
        onInfo = Color(0xFFFFFFFF),
        successSoft = Color(0xFFE3EEE5),
        warningSoft = Color(0xFFF4E8CF),
        dangerSoft = Color(0xFFF6DFD8),
        category = Category,
    )

    val PapirMork = DsColors(
        isDark = true,
        surface = Color(0xFF16140F),
        surfaceRaised = Color(0xFF211E18),
        surfaceSunken = Color(0xFF1B1A17),
        line = Color(0xFF3A352C),
        textPrimary = Color(0xFFF3EFE6),
        textSecondary = Color(0xFFA39D90),
        textTertiary = Color(0xFF8A8478),
        accent = Color(0xFFEC7A64),
        onAccent = Color(0xFF1B1A17),
        success = Color(0xFF6FBF8F),
        onSuccess = Color(0xFF1B1A17),
        warning = Color(0xFFE0A24A),
        onWarning = Color(0xFF1B1A17),
        danger = Color(0xFFF59A8F),
        onDanger = Color(0xFF1B1A17),
        focus = Color(0xFFEC7A64),
        scrim = Color(0x80000000),
        surfaceField = Color(0xFF1C1A15),
        surfaceChip = Color(0xFF2A261F),
        surfaceOverlay = Color(0xFF211E18),
        lineSubtle = Color(0xFF3A352C),
        info = Color(0xFFA8D4FB),
        onInfo = Color(0xFF1B1A17),
        successSoft = Color(0x296FBF8F),
        warningSoft = Color(0x29E0A85A),
        dangerSoft = Color(0x29EC7A64),
        category = Category,
    )

    /** Peker til papir.lys (Q13). */
    val GlassLys: DsColors get() = PapirLys

    val GlassMork = DsColors(
        isDark = true,
        surface = Color(0xFF07080B),
        surfaceRaised = Color(0x8C282C34),
        surfaceSunken = Color(0x0FFFFFFF),
        line = Color(0x1FFFFFFF),
        textPrimary = Color(0xFFEEF0F4),
        textSecondary = Color(0xFF8A93A6),
        textTertiary = Color(0xFF6E6E78),
        accent = Color(0xFFFF7A3D),
        onAccent = Color(0xFF1B1A17),
        success = Color(0xFF6FBF8F),
        onSuccess = Color(0xFF1B1A17),
        warning = Color(0xFFE0A24A),
        onWarning = Color(0xFF1B1A17),
        danger = Color(0xFFF59A8F),
        onDanger = Color(0xFF1B1A17),
        focus = Color(0xFFA8D4FB),
        scrim = Color(0x80000000),
        surfaceField = Color(0xFF0B0E15),
        surfaceChip = Color(0x14FFFFFF),
        surfaceOverlay = Color(0xDB121926),
        lineSubtle = Color(0xFF1F2736),
        info = Color(0xFFA8D4FB),
        onInfo = Color(0xFF1B1A17),
        successSoft = Color(0x296FBF8F),
        warningSoft = Color(0x29E0A85A),
        dangerSoft = Color(0x29EC7A64),
        category = Category,
    )

    fun colors(stil: DsStil, dark: Boolean): DsColors = when (stil) {
        DsStil.Papir -> if (dark) PapirMork else PapirLys
        DsStil.Glass -> if (dark) GlassMork else GlassLys
    }
}

/** Gjeldende DsColors. Settes av DsTheme. */
val LocalDsColors = staticCompositionLocalOf { DsPalette.PapirLys }

object DsSpace {
    val xs: Dp = 4.dp
    val sm: Dp = 8.dp
    val md: Dp = 12.dp
    val lg: Dp = 16.dp
    val xl: Dp = 24.dp
    val xxl: Dp = 32.dp
}

object DsRadius {
    val sm: Dp = 8.dp
    val md: Dp = 12.dp
    val lg: Dp = 16.dp
    val xl: Dp = 20.dp
    val full: Dp = 999.dp
}

/** Skygger som elevation. */
object DsElevation {
    val low: Dp = 1.dp
    val mid: Dp = 3.dp
    val high: Dp = 8.dp
}

/** Lag (Modifier.zIndex). */
object DsZ {
    const val BASE: Float = 0.0f
    const val RAISED: Float = 10.0f
    const val STICKY: Float = 100.0f
    const val NAV: Float = 200.0f
    const val SHEET: Float = 300.0f
    const val TOAST: Float = 400.0f
}

/** Bevegelse. Varigheter i ms; duration(…, reduced = true) gir 0 når animasjoner er slått av. */
object DsMotion {
    const val FAST: Int = 150
    const val NORMAL: Int = 250
    const val SLOW: Int = 400
    const val REDUCED: Int = 0
    val StandardEasing: Easing = CubicBezierEasing(0.2f, 0.0f, 0.0f, 1.0f)
    val EnterEasing: Easing = CubicBezierEasing(0.0f, 0.0f, 0.2f, 1.0f)
    val ExitEasing: Easing = CubicBezierEasing(0.4f, 0.0f, 1.0f, 1.0f)

    fun duration(ms: Int, reduced: Boolean): Int = if (reduced) REDUCED else ms
}

/** Tokenstilene som TextStyle (systemfont). size/lineHeight i sp. */
object DsText {
    val caption = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 14.sp)
    val footnote = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp)
    val subheadline = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp)
    val callout = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp)
    val body = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp)
    val headline = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp)
    val title3 = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp)
    val title2 = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp)
    val largeTitle = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Bold, fontSize = 44.sp, lineHeight = 52.sp)
}

/**
 * Material 3-fargeskjema fra tokenene. Flater med alfa (glass) er lagt over surface, så ark og menyer blir ugjennomsiktige.
 * Dynamic color brukes ikke (Q16: fast designspråk).
 */
object DsSchemes {
    val PapirLys: ColorScheme = lightColorScheme(
        primary = Color(0xFFB23A2A),
        onPrimary = Color(0xFFFFFFFF),
        primaryContainer = Color(0xFFEBE5D8),
        onPrimaryContainer = Color(0xFF1B1A17),
        secondary = Color(0xFF5C5850),
        onSecondary = Color(0xFFF3EFE6),
        secondaryContainer = Color(0xFFEBE5D8),
        onSecondaryContainer = Color(0xFF1B1A17),
        tertiary = Color(0xFF2F7A4F),
        onTertiary = Color(0xFFFFFFFF),
        background = Color(0xFFF3EFE6),
        onBackground = Color(0xFF1B1A17),
        surface = Color(0xFFF3EFE6),
        onSurface = Color(0xFF1B1A17),
        surfaceVariant = Color(0xFFEBE5D8),
        onSurfaceVariant = Color(0xFF5C5850),
        surfaceTint = Color(0xFFF3EFE6),
        inverseSurface = Color(0xFF1B1A17),
        inverseOnSurface = Color(0xFFF3EFE6),
        error = Color(0xFFB23A2A),
        onError = Color(0xFFFFFFFF),
        errorContainer = Color(0xFFEBE5D8),
        onErrorContainer = Color(0xFFB23A2A),
        outline = Color(0xFFD8D1C2),
        outlineVariant = Color(0xFFD8D1C2),
        scrim = Color(0x59000000),
        surfaceBright = Color(0xFFFFFDF8),
        surfaceDim = Color(0xFFEBE5D8),
        surfaceContainer = Color(0xFFFFFDF8),
        surfaceContainerHigh = Color(0xFFFFFDF8),
        surfaceContainerHighest = Color(0xFFEBE5D8),
        surfaceContainerLow = Color(0xFFFFFDF8),
        surfaceContainerLowest = Color(0xFFFFFDF8),
    )

    val PapirMork: ColorScheme = darkColorScheme(
        primary = Color(0xFFEC7A64),
        onPrimary = Color(0xFF1B1A17),
        primaryContainer = Color(0xFF1B1A17),
        onPrimaryContainer = Color(0xFFF3EFE6),
        secondary = Color(0xFFA39D90),
        onSecondary = Color(0xFF16140F),
        secondaryContainer = Color(0xFF1B1A17),
        onSecondaryContainer = Color(0xFFF3EFE6),
        tertiary = Color(0xFF6FBF8F),
        onTertiary = Color(0xFF1B1A17),
        background = Color(0xFF16140F),
        onBackground = Color(0xFFF3EFE6),
        surface = Color(0xFF16140F),
        onSurface = Color(0xFFF3EFE6),
        surfaceVariant = Color(0xFF1B1A17),
        onSurfaceVariant = Color(0xFFA39D90),
        surfaceTint = Color(0xFF16140F),
        inverseSurface = Color(0xFFF3EFE6),
        inverseOnSurface = Color(0xFF16140F),
        error = Color(0xFFF59A8F),
        onError = Color(0xFF1B1A17),
        errorContainer = Color(0xFF1B1A17),
        onErrorContainer = Color(0xFFF59A8F),
        outline = Color(0xFF3A352C),
        outlineVariant = Color(0xFF3A352C),
        scrim = Color(0x80000000),
        surfaceBright = Color(0xFF211E18),
        surfaceDim = Color(0xFF1B1A17),
        surfaceContainer = Color(0xFF211E18),
        surfaceContainerHigh = Color(0xFF211E18),
        surfaceContainerHighest = Color(0xFF1B1A17),
        surfaceContainerLow = Color(0xFF211E18),
        surfaceContainerLowest = Color(0xFF211E18),
    )

    /** Peker til papir.lys (Q13). */
    val GlassLys: ColorScheme get() = PapirLys

    val GlassMork: ColorScheme = darkColorScheme(
        primary = Color(0xFFFF7A3D),
        onPrimary = Color(0xFF1B1A17),
        primaryContainer = Color(0xFF16171A),
        onPrimaryContainer = Color(0xFFEEF0F4),
        secondary = Color(0xFF8A93A6),
        onSecondary = Color(0xFF07080B),
        secondaryContainer = Color(0xFF16171A),
        onSecondaryContainer = Color(0xFFEEF0F4),
        tertiary = Color(0xFF6FBF8F),
        onTertiary = Color(0xFF1B1A17),
        background = Color(0xFF07080B),
        onBackground = Color(0xFFEEF0F4),
        surface = Color(0xFF07080B),
        onSurface = Color(0xFFEEF0F4),
        surfaceVariant = Color(0xFF16171A),
        onSurfaceVariant = Color(0xFF8A93A6),
        surfaceTint = Color(0xFF07080B),
        inverseSurface = Color(0xFFEEF0F4),
        inverseOnSurface = Color(0xFF07080B),
        error = Color(0xFFF59A8F),
        onError = Color(0xFF1B1A17),
        errorContainer = Color(0xFF16171A),
        onErrorContainer = Color(0xFFF59A8F),
        outline = Color(0xFF252628),
        outlineVariant = Color(0xFF252628),
        scrim = Color(0x80000000),
        surfaceBright = Color(0xFF191C22),
        surfaceDim = Color(0xFF16171A),
        surfaceContainer = Color(0xFF191C22),
        surfaceContainerHigh = Color(0xFF191C22),
        surfaceContainerHighest = Color(0xFF16171A),
        surfaceContainerLow = Color(0xFF191C22),
        surfaceContainerLowest = Color(0xFF191C22),
    )

    fun scheme(stil: DsStil, dark: Boolean): ColorScheme = when (stil) {
        DsStil.Papir -> if (dark) PapirMork else PapirLys
        DsStil.Glass -> if (dark) GlassMork else GlassLys
    }
}

/** Material 3-typografi fra tokenstilene (systemfont). */
val DsTypography = Typography(
    labelSmall = DsText.caption,
    bodySmall = DsText.footnote,
    labelMedium = DsText.footnote,
    bodyMedium = DsText.callout,
    labelLarge = DsText.callout,
    bodyLarge = DsText.body,
    titleSmall = DsText.body,
    titleMedium = DsText.headline,
    titleLarge = DsText.title3,
    headlineSmall = DsText.title3,
    headlineMedium = DsText.title2,
    headlineLarge = DsText.title2,
    displaySmall = DsText.largeTitle,
    displayMedium = DsText.largeTitle,
    displayLarge = DsText.largeTitle,
)

/** Material 3-former fra radiene. */
val DsShapes = Shapes(
    extraSmall = RoundedCornerShape(DsRadius.sm),
    small = RoundedCornerShape(DsRadius.sm),
    medium = RoundedCornerShape(DsRadius.md),
    large = RoundedCornerShape(DsRadius.lg),
    extraLarge = RoundedCornerShape(DsRadius.xl),
)

/**
 * Tema fra tokenene: MaterialTheme + LocalDsColors. Stil er et appvalg; dark følger systemet som standard.
 * (Ikke tatt i bruk ennå – Fase 5.)
 */
@Composable
fun DsTheme(stil: DsStil, dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalDsColors provides DsPalette.colors(stil, dark)) {
        MaterialTheme(colorScheme = DsSchemes.scheme(stil, dark), typography = DsTypography, shapes = DsShapes, content = content)
    }
}
