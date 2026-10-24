package no.kristo.finanshub.ui

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import no.kristo.finanshub.R
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * Farger: skjermene er tegnet med designfargene fra den gamle mørke paletten (#FF7A3D). Hver designfarge har en fast rolle
 * (flate, kort, tekst, primær, container …), og i Papir får rollene papirfargene (PaperPal). Øvrige designfarger legges på
 * blekkrødt i OKLCH. Prompt 42: Material You-«Klassisk» (dynamiske farger, frøfarger og egne sidefarger) er slettet.
 */

/** Statusfarger og Domener-rosa: samme kulør uansett frøfarge (lys modus får egne toner). */
private val FIXED = setOf(
    0xFF9FE3C6, 0xFF7BE3A0, 0xFF1F3A2F, 0xFFC9E4D8, 0xFF07301F, 0xFFFF8A80, 0xFFF2B56B, 0xFFF2C14E, 0xFFE60000, 0xFF4285F4,
    0xFF7B2949, 0xFFFFD9E2, 0xFFFFB1C8, 0xFF2A2024, 0xFF3A2C31, 0xFFD5C2C6, 0xFF3A0B07, 0xFF4A1F25,
)

/** Rollene i paletten. */
private enum class Role {
    SURFACE, SURFACE_LOW, SURFACE1, SURFACE2, SURFACE3, PRIMARY, ON_PRIMARY, PRIMARY_CONTAINER, ON_PRIMARY_CONTAINER,
    SECONDARY_CONTAINER, ON_SECONDARY_CONTAINER, TERTIARY_CONTAINER, ON_TERTIARY_CONTAINER, ON_SURFACE, ON_SURFACE_VARIANT, OUTLINE, ACCENT,
}

/** Designfargene og rollene deres. */
private val ROLE_OF: Map<Long, Role> = mapOf(
    0xFF19120E to Role.SURFACE, 0xFF1E1712 to Role.SURFACE_LOW, 0xFF261E19 to Role.SURFACE1, 0xFF31281F to Role.SURFACE2, 0xFF3D332C to Role.SURFACE3,
    0xFFFFB68A to Role.PRIMARY, 0xFFFFB08A to Role.PRIMARY, 0xFF532200 to Role.ON_PRIMARY, 0xFF1A0C04 to Role.ON_PRIMARY,
    0xFF763300 to Role.PRIMARY_CONTAINER, 0xFF5D4033 to Role.SECONDARY_CONTAINER, 0xFFFFDBC8 to Role.ON_SECONDARY_CONTAINER,
    0xFF45462A to Role.TERTIARY_CONTAINER, 0xFFE6E6AE to Role.ON_TERTIARY_CONTAINER,
    0xFFF0DFD7 to Role.ON_SURFACE, 0xFFD7C2B8 to Role.ON_SURFACE_VARIANT, 0xFFA08D83 to Role.OUTLINE, 0xFFFF7A3D to Role.ACCENT,
)

/** OKLab/OKLCH ↔ sRGB (Björn Ottosson). */
private object Ok {
    private fun lin(c: Double) = if (c <= 0.04045) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
    private fun gam(c: Double) = if (c <= 0.0031308) 12.92 * c else 1.055 * Math.pow(c, 1 / 2.4) - 0.055

    /** sRGB (0xAARRGGBB) → (L, C, h°). */
    fun lch(c: Long): DoubleArray {
        val r = lin(((c shr 16) and 0xFF) / 255.0); val g = lin(((c shr 8) and 0xFF) / 255.0); val b = lin((c and 0xFF) / 255.0)
        val l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        val m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        val s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        val L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
        val A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
        val B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
        val h = Math.toDegrees(Math.atan2(B, A))
        return doubleArrayOf(L, Math.hypot(A, B), if (h < 0) h + 360 else h)
    }

    private fun rgb(L: Double, C: Double, h: Double): DoubleArray {
        val a = C * Math.cos(Math.toRadians(h)); val b = C * Math.sin(Math.toRadians(h))
        val l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3.0)
        val m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3.0)
        val s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3.0)
        return doubleArrayOf(
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
        )
    }

    /** (L, C, h°) → sRGB. Metningen senkes til fargen kan vises (gamut). */
    fun color(L0: Double, C0: Double, h: Double, alpha: Long = 0xFF): Long {
        val L = L0.coerceIn(0.0, 1.0)
        var lo = 0.0; var hi = C0.coerceAtLeast(0.0)
        fun ok(c: Double) = rgb(L, c, h).all { it >= -0.0005 && it <= 1.0005 }
        if (!ok(hi)) { repeat(18) { val mid = (lo + hi) / 2; if (ok(mid)) lo = mid else hi = mid }; hi = lo }
        val v = rgb(L, hi, h)
        fun ch(x: Double) = (gam(x.coerceIn(0.0, 1.0)) * 255).roundToInt().coerceIn(0, 255).toLong()
        return (alpha shl 24) or (ch(v[0]) shl 16) or (ch(v[1]) shl 8) or ch(v[2])
    }
}

/** Gjeldende tone: lys eller mørk papir. Leses i komposisjonen. */
object Tone {
    /** Lys papir (= !paperDark). */
    var light by mutableStateOf(true)
    /** Kveldspapir. */
    var paperDark by mutableStateOf(false)
    /** Prompt 50: Liquid Glass (mørkt glass med fargeskyer, ui/Glass50.kt). paperDark er også true. */
    var glass by mutableStateOf(false)
    private val cache = HashMap<Long, Color>()
    private var cacheKey: Any? = null

    fun map(c: Long): Color {
        val pd = paperDark
        if (pd != cacheKey) { cache.clear(); cacheKey = pd }
        return cache.getOrPut(c) { paperResolve(c, pd) }
    }

    /** Papir: rollene får papirfargene; øvrige designfarger legges på blekkrødt (som «Samme overalt»). */
    private fun paperResolve(c: Long, dark: Boolean): Color {
        val argb = 0xFF000000 or (c and 0xFFFFFF)
        val alpha = ((c shr 24) and 0xFF) / 255f
        val pal = if (dark) PaperPal.DARK else PaperPal.LIGHT
        val fixed: Color? = when (argb) {
            0xFF9FE3C6, 0xFF7BE3A0 -> pal.pos
            0xFF1F3A2F -> pal.posSoft
            0xFFFF8A80 -> pal.lab
            else -> null
        }
        if (fixed != null) return fixed.copy(alpha = alpha)
        val role = if (argb in FIXED) null else ROLE_OF[argb]
        val r: Color = when (role) {
            Role.SURFACE, Role.SURFACE_LOW -> pal.bg
            Role.SURFACE1 -> pal.card
            Role.SURFACE2 -> pal.surf2
            Role.SURFACE3 -> pal.line
            Role.PRIMARY, Role.ON_PRIMARY_CONTAINER, Role.ON_SECONDARY_CONTAINER, Role.ON_TERTIARY_CONTAINER, Role.ON_SURFACE -> pal.ink
            Role.ON_PRIMARY -> pal.bg
            Role.PRIMARY_CONTAINER, Role.SECONDARY_CONTAINER -> pal.container
            Role.TERTIARY_CONTAINER -> pal.tertiary
            Role.ON_SURFACE_VARIANT -> pal.sub
            Role.OUTLINE -> pal.mut
            Role.ACCENT -> pal.lab
            null -> return resolve(c, 0xFF000000 or (pal.lab.toArgb().toLong() and 0xFFFFFF), !dark)
        }
        return r.copy(alpha = alpha)
    }

    /** Øvrige designfarger: behold lyshet og metning, flytt kuløren til blekkrødt (unntatt faste og grå), og egne toner på lyst papir. */
    private fun resolve(c: Long, seed: Long, light: Boolean): Color {
        val argb = 0xFF000000 or (c and 0xFFFFFF)
        val alpha = (c shr 24) and 0xFF
        val o = Ok.lch(argb)
        val h = if (argb in FIXED || o[1] < 0.02) o[2] else Ok.lch(seed)[2]
        val L = if (!light) o[0] else if (o[0] < 0.5) 0.98 - o[0] * 0.25 else (1.17 - o[0]).coerceIn(0.22, 0.6)
        return Color(Ok.color(L, o[1], h, alpha))
    }
}

/** Farge fra designet, oversatt til gjeldende tone. Bruk denne i stedet for Color(0xFF…) i grensesnittet. */
fun tc(c: Long): Color = Tone.map(c)

/** Papir-paletten fra «Mobil Papir App» (lys og mørk). Mørk er rettet i prompt 14 (kontrast ≥ 4,5:1 for dempet tekst). */
class PaperPal(
    val ink: Color, val bg: Color, val card: Color, val line: Color, val lab: Color, val mut: Color, val pos: Color, val sub: Color,
    val surf2: Color, val container: Color, val tertiary: Color, val posSoft: Color, val nav: Color, val navInk: Color, val navAct: Color, val navActInk: Color,
    /** Tekst og ikon på aksentfargen (+-knappen), og flatene i egne rullegardiner (bakgrunnsvelgeren). */
    val onLab: Color = Color.White, val pop: Color = Color(0xFFF3EFE6), val popSel: Color = Color(0xFFE6E0D2),
) {
    companion object {
        val LIGHT = PaperPal(
            Color(0xFF1B1A17), Color(0xFFF3EFE6), Color(0xFFFFFFFF), Color(0xFFD8D1C2), Color(0xFFB23A2A), Color(0xFF7A7468), Color(0xFF2F7A4F), Color(0xFF6B665C),
            Color(0xFFEBE6DA), Color(0xFFE6E0D2), Color(0xFFEBE4C8), Color(0xFFDFE9E1), Color(0xFF1B1A17), Color(0xFFB3ADA1), Color(0xFFF3EFE6), Color(0xFF1B1A17),
            onLab = Color.White, pop = Color(0xFFF3EFE6), popSel = Color(0xFFE6E0D2),
        )
        val DARK = PaperPal(
            Color(0xFFECE7DC), Color(0xFF14130F), Color(0xFF211F19), Color(0xFF3A372E), Color(0xFFF08A76), Color(0xFFA39D90), Color(0xFF8FD9A8), Color(0xFFA39D90),
            Color(0xFF2A2821), Color(0xFF2E2B23), Color(0xFF2F2C1D), Color(0xFF17271E), Color(0xFF2A2821), Color(0xFFA39D90), Color(0xFFECE7DC), Color(0xFF14130F),
            onLab = Color(0xFF1B1A17), pop = Color(0xFF2A2821), popSel = Color(0xFF3A372E),
        )
        val current: PaperPal get() = if (Tone.glass) GLASS_PAL50 else if (Tone.paperDark) DARK else LIGHT
    }
}

/** Fontene i Papir (lagt i res/font fra Fontsource, SIL OFL): Newsreader, Manrope og IBM Plex Mono. */
object PaperFonts {
    val serif = FontFamily(
        Font(R.font.newsreader_regular, FontWeight.Normal), Font(R.font.newsreader_italic, FontWeight.Normal, FontStyle.Italic),
        Font(R.font.newsreader_medium, FontWeight.Medium),
    )
    val sans = FontFamily(
        Font(R.font.manrope_regular, FontWeight.Normal), Font(R.font.manrope_medium, FontWeight.Medium),
        Font(R.font.manrope_semibold, FontWeight.SemiBold), Font(R.font.manrope_bold, FontWeight.Bold), Font(R.font.manrope_bold, FontWeight.ExtraBold),
    )
    val mono = FontFamily(Font(R.font.plexmono_regular, FontWeight.Normal), Font(R.font.plexmono_semibold, FontWeight.SemiBold))
}

// Tonal palett fra grunnfargen #FF7A3D (Material 3 Expressive, mørkt tema), som i designet 1b.
object C {
    val bg: Color get() = tc(0xFF19120E)
    val surface1: Color get() = tc(0xFF261E19)
    val surface2: Color get() = tc(0xFF31281F)
    val surface3: Color get() = tc(0xFF3D332C)
    val primary: Color get() = tc(0xFFFFB68A)
    val onPrimary: Color get() = tc(0xFF532200)
    val container: Color get() = tc(0xFF5D4033)
    val onContainer: Color get() = tc(0xFFFFDBC8)
    val heroAi: Color get() = tc(0xFF763300)
    val text: Color get() = tc(0xFFF0DFD7)
    val text2: Color get() = tc(0xFFD7C2B8)
    val outline: Color get() = tc(0xFFA08D83)
    val positive: Color get() = tc(0xFF9FE3C6)
    val positiveBg: Color get() = tc(0xFF1F3A2F)
    val accent: Color get() = tc(0xFFFF7A3D)
    val accentLight: Color get() = tc(0xFFFFB08A)
    val paper = Color(0xFFECE8E0)
    val ink = Color(0xFF3A362E)
    val red: Color get() = tc(0xFFFF8A80)
}

// Domener: samme roller som resten av appen (Papir).
object P {
    val hero: Color get() = C.heroAi
    val onHero: Color get() = C.onContainer
    val accent: Color get() = C.primary
    val card: Color get() = C.surface1
    val card2: Color get() = C.surface3
    val text2: Color get() = C.text2
    val red: Color get() = tc(0xFFFF8A80)
}

/** «Skjul beløp til jeg trykker»: formaterte beløp vises som prikker mens dette er på. */
object Privacy {
    var hidden by mutableStateOf(false)
}

private fun schemeFromPalette(light: Boolean): ColorScheme = if (light) lightColorScheme(
    primary = C.primary, onPrimary = C.onPrimary, primaryContainer = C.container, onPrimaryContainer = C.onContainer,
    secondaryContainer = C.container, onSecondaryContainer = C.onContainer,
    background = C.bg, onBackground = C.text, surface = C.bg, onSurface = C.text, onSurfaceVariant = C.text2,
    surfaceContainer = C.surface1, surfaceContainerHigh = C.surface2, surfaceContainerHighest = C.surface3, surfaceContainerLow = C.surface1,
    outline = C.outline, outlineVariant = C.surface3,
) else darkColorScheme(
    primary = C.primary, onPrimary = C.onPrimary, primaryContainer = C.container, onPrimaryContainer = C.onContainer,
    secondaryContainer = C.container, onSecondaryContainer = C.onContainer,
    background = C.bg, onBackground = C.text, surface = C.bg, onSurface = C.text, onSurfaceVariant = C.text2,
    surfaceContainer = C.surface1, surfaceContainerHigh = C.surface2, surfaceContainerHighest = C.surface3, surfaceContainerLow = C.surface1,
    outline = C.outline, outlineVariant = C.surface3,
)

val Mono = FontFamily.Monospace

/** Papir: Manrope i brødtekst, Newsreader i titler. */
private val paperType = Typography(
    displaySmall = TextStyle(fontFamily = PaperFonts.serif, fontSize = 40.sp, fontWeight = FontWeight.Medium),
    headlineMedium = TextStyle(fontFamily = PaperFonts.serif, fontSize = 30.sp, fontWeight = FontWeight.Medium),
    titleLarge = TextStyle(fontFamily = PaperFonts.serif, fontSize = 24.sp, fontWeight = FontWeight.Medium),
    titleMedium = TextStyle(fontFamily = PaperFonts.sans, fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontFamily = PaperFonts.sans, fontSize = 16.sp),
    bodyMedium = TextStyle(fontFamily = PaperFonts.sans, fontSize = 14.sp),
    bodySmall = TextStyle(fontFamily = PaperFonts.sans, fontSize = 12.sp),
    labelLarge = TextStyle(fontFamily = PaperFonts.sans, fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontFamily = PaperFonts.sans, fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
    labelSmall = TextStyle(fontFamily = PaperFonts.sans, fontSize = 11.sp, fontWeight = FontWeight.SemiBold),
)

// Uttrykksfulle former: ulik rundingsgrad på hjørnene, som i M3 Expressive.
private val shapes = Shapes(
    small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(20.dp), large = RoundedCornerShape(28.dp), extraLarge = RoundedCornerShape(32.dp),
)

/** Papir · lys, Papir · mørk, Liquid Glass (prompt 50) eller «auto» (følger systemet). Prompt 42: det eneste temaet (Material You-«Klassisk» er slettet). */
@Composable
fun FinansTheme(paperMode: String, content: @Composable () -> Unit) {
    val sysDark = isSystemInDarkTheme()
    val paperDark = when (paperMode) { "mork", "glass" -> true; "lys" -> false; else -> sysDark }
    if (Tone.paperDark != paperDark) Tone.paperDark = paperDark
    if (Tone.glass != (paperMode == "glass")) Tone.glass = paperMode == "glass" // prompt 50: Liquid Glass
    if (Tone.light != !paperDark) Tone.light = !paperDark
    val scheme = schemeFromPalette(!paperDark)
    val view = LocalView.current
    if (!view.isInEditMode) SideEffect {
        (view.context as? Activity)?.window?.let { w ->
            val c = WindowCompat.getInsetsController(w, view)
            // Papir har fotovinduet øverst: lyse ikoner i statuslinjen.
            c.isAppearanceLightStatusBars = false
            c.isAppearanceLightNavigationBars = !paperDark
        }
    }
    MaterialTheme(colorScheme = scheme, typography = paperType, shapes = shapes, content = content)
}

/* ---------- Formatering (norsk, minus som −) ---------- */

private val nb = Locale("nb", "NO")
private const val MASK = "•••"
fun n2(v: Double): String = if (Privacy.hidden) MASK else NumberFormat.getNumberInstance(nb).apply { minimumFractionDigits = 2; maximumFractionDigits = 2 }.format(abs(v)).replace(' ', ' ')
fun n0(v: Double): String = if (Privacy.hidden) MASK else NumberFormat.getNumberInstance(nb).apply { maximumFractionDigits = 0 }.format(abs(v)).replace(' ', ' ')
fun signed(v: Double) = if (Privacy.hidden) MASK else (if (v < 0) "−" else "+") + n2(v)
/** Tall som ikke er beløp (besøk, forespørsler) skjules aldri. */
fun count(v: Double): String = when {
    v >= 1_000_000 -> String.format(nb, "%.1f mill.", v / 1_000_000)
    v >= 10_000 -> String.format(nb, "%.1f k", v / 1000)
    else -> NumberFormat.getNumberInstance(nb).apply { maximumFractionDigits = 0 }.format(v).replace(' ', ' ').replace(' ', ' ')
}
fun pct(v: Double) = String.format(nb, "%.1f %%", v)
fun neg0(v: Double) = if (Privacy.hidden) MASK else (if (v < 0) "−" else "") + n0(v)
fun ddmm(d: String?) = if (d == null || d.length < 10) "–" else "${d.substring(8, 10)}.${d.substring(5, 7)}"
fun ddmmyyyy(d: String?) = if (d == null || d.length < 10) "–" else "${d.substring(8, 10)}.${d.substring(5, 7)}.${d.substring(0, 4)}"
fun dayLabel(d: String): String = runCatching {
    LocalDate.parse(d).format(DateTimeFormatter.ofPattern("EEEE d. MMM", nb)).replaceFirstChar { it.uppercase() }
}.getOrDefault(d)
fun monthLabel(m: String): String = runCatching {
    LocalDate.parse("$m-15").format(DateTimeFormatter.ofPattern("LLLL", nb)).replaceFirstChar { it.uppercase() }
}.getOrDefault(m)
fun longDate(d: LocalDate = LocalDate.now()): String = d.format(DateTimeFormatter.ofPattern("EEEE d. MMMM", nb)).replaceFirstChar { it.uppercase() }
fun initial(s: String) = s.firstOrNull { it.isLetterOrDigit() }?.uppercase() ?: "•"
/** Beløp skrevet med komma, mellomrom eller punktum som desimaltegn. */
fun parseAmount(s: String): Double? = s.replace(" ", "").replace(" ", "").replace("−", "-").replace(',', '.').toDoubleOrNull()
