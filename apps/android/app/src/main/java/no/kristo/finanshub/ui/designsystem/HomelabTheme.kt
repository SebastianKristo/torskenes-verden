package no.kristo.finanshub.ui.designsystem

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import no.kristo.finanshub.ui.PaperFonts
import no.kristo.finanshub.ui.PaperPal

/*
 * Fase 5: grunnmuren for tema og typografi i Homelab-appen, bygd på de genererte tokenene (DesignTokens.kt, rediger aldri den).
 *
 * Skjermene skal lese farger, tekststiler og avstander herfra i stedet for C.*, P.*, PaperPal.current, tc()/Tone.map() og
 * `fontSize = N.sp`. De gamle API-ene virker fortsatt (tynne adaptere i ui/Theme.kt) til hver skjerm er flyttet (bølge 2).
 * Se docs/utvikling.md «API for bølge 2».
 *
 *   val c = HomelabTheme.colors            // DsColors: surface, surfaceRaised, textPrimary, accent, success, line …
 *   Text("Tittel", style = HomelabTheme.type.titleLarge)   // MaterialTheme.typography (fra tokenene)
 *   Text("13 sp", style = HomelabType.subheadline)          // stilene uten M3-rolle
 *   Modifier.padding(HomelabTheme.space.lg)
 *
 * Tema = stil (Papir, Glass) × modus (lys, mørk), Q13–Q15. Glass har bare mørk modus. Dynamic color brukes ikke (Q16).
 */

/** Stilen for appvalget paperMode («lys», «mork», «auto», «glass»). */
fun dsStil(paperMode: String): DsStil = if (paperMode == "glass") DsStil.Glass else DsStil.Papir

/** Mørk modus for appvalget paperMode (glass er alltid mørk, Q13). */
fun dsDark(paperMode: String, systemDark: Boolean): Boolean = when (paperMode) { "mork", "glass" -> true; "lys" -> false; else -> systemDark }

/**
 * Tekststilene fra tokenene (shared/design/tokens.json textStyle: 11/12/13/14/16/18/22/28/44 sp, linjehøyde og vekt) med
 * Papir-fontene: Manrope i brødtekst og etiketter, Newsreader i titler. Størrelsene er i sp, så fontskalering virker.
 * Bruk disse for de 42 ulike `fontSize = N.sp`; se tabellen i docs/utvikling.md (f.eks. 12.5 sp → footnote/subheadline).
 */
object HomelabType {
    private val sans: FontFamily get() = PaperFonts.sans
    private val serif: FontFamily get() = PaperFonts.serif

    private fun TextStyle.med(f: FontFamily, w: FontWeight? = null): TextStyle = copy(fontFamily = f, fontWeight = w ?: fontWeight)

    /** 11 sp, medium. Små etiketter, brikker. */
    val caption: TextStyle by lazy { DsText.caption.med(sans, FontWeight.SemiBold) }
    /** 12 sp. Hjelpetekst, metadata. */
    val footnote: TextStyle by lazy { DsText.footnote.med(sans) }
    /** 13 sp. Undertekst i rader (ingen M3-rolle). */
    val subheadline: TextStyle by lazy { DsText.subheadline.med(sans) }
    /** 14 sp. Vanlig brødtekst i lister og kort. */
    val callout: TextStyle by lazy { DsText.callout.med(sans) }
    /** 16 sp. Hovedtekst. */
    val body: TextStyle by lazy { DsText.body.med(sans) }
    /** 18 sp, semibold. Radtitler, korttitler. */
    val headline: TextStyle by lazy { DsText.headline.med(sans) }
    /** 22 sp. Seksjonstitler (Newsreader). */
    val title3: TextStyle by lazy { DsText.title3.med(serif, FontWeight.Medium) }
    /** 28 sp. Sidetitler (Newsreader). */
    val title2: TextStyle by lazy { DsText.title2.med(serif, FontWeight.Medium) }
    /** 44 sp. Store tall og forsidetitler (Newsreader). */
    val largeTitle: TextStyle by lazy { DsText.largeTitle.med(serif, FontWeight.Medium) }

    /** Etikett på knapper og faner: 14 sp semibold (som Papir har hatt). */
    val label: TextStyle by lazy { DsText.callout.med(sans, FontWeight.SemiBold) }
    /** Liten etikett: 12 sp semibold. */
    val labelSmall: TextStyle by lazy { DsText.footnote.med(sans, FontWeight.SemiBold) }
    /** Beløp og tall i tabeller: monospace med tabelltall (IBM Plex Mono). */
    val mono: TextStyle by lazy { DsText.callout.copy(fontFamily = PaperFonts.mono) }
}

/**
 * MaterialTheme.typography for Homelab: M3-rollene får tokenstilene (samme tilordning som DsTypography i DesignTokens.kt),
 * med Papir-fontene. Etikettene er semibold, som før.
 */
val HomelabTypography: Typography by lazy {
    Typography(
        labelSmall = HomelabType.caption,
        bodySmall = HomelabType.footnote,
        labelMedium = HomelabType.labelSmall,
        bodyMedium = HomelabType.callout,
        labelLarge = HomelabType.label,
        bodyLarge = HomelabType.body,
        titleSmall = HomelabType.body.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = HomelabType.headline,
        titleLarge = HomelabType.title3,
        headlineSmall = HomelabType.title3,
        headlineMedium = HomelabType.title2,
        headlineLarge = HomelabType.title2,
        displaySmall = HomelabType.largeTitle,
        displayMedium = HomelabType.largeTitle,
        displayLarge = HomelabType.largeTitle,
    )
}

/** Gjeldende stil (Papir/Glass). Settes av FinansTheme. */
val LocalDsStil = staticCompositionLocalOf { DsStil.Papir }

/** Den gamle Papir-paletten via CompositionLocal (adapter for PaperPal.current, som leses fra global tilstand). */
val LocalPaperPal = staticCompositionLocalOf { PaperPal.LIGHT }

/** Inngangen for skjermene: farger, tekst, avstander og radier fra tokenene. Settes av FinansTheme. */
object HomelabTheme {
    /** Tokenfargene for gjeldende stil og modus (LocalDsColors). */
    val colors: DsColors
        @Composable @ReadOnlyComposable get() = LocalDsColors.current

    /** M3-typografien fra tokenene (HomelabTypography). */
    val type: Typography
        @Composable @ReadOnlyComposable get() = MaterialTheme.typography

    /** Papir-paletten (adapter): bruk [colors] i ny kode. */
    val paper: PaperPal
        @Composable @ReadOnlyComposable get() = LocalPaperPal.current

    /** Glass-stilen er på. */
    val isGlass: Boolean
        @Composable @ReadOnlyComposable get() = LocalDsStil.current == DsStil.Glass

    val space: DsSpace get() = DsSpace
    val radius: DsRadius get() = DsRadius

    /** Minste trykkflate (M3/HIG). */
    val minTouch: Dp get() = 48.dp
}
