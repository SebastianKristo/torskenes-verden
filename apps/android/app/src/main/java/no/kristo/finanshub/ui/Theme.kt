package no.kristo.finanshub.ui

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
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
 * Farger: designet (1b) er tegnet i én mørk tonal palett fra #FF7A3D. Hver designfarge har en fast rolle
 * (flate, kort, tekst, primær, container …). Med «Følg systemet» (Android 12+) hentes rollene rett fra
 * dynamicDarkColorScheme / dynamicLightColorScheme. De andre frøfargene lager rollene i OKLCH: bare kulørtonen
 * byttes, og hver rolle har egen lyshet og metning i lys og mørk modus (ikke invertering). Statusfarger
 * (grønn, rød, gul) og Domener-rosa følger ikke aksentfargen.
 */

/** Frøfarger i Innstillinger → Utseende → Farger. «system» = dynamiske farger fra bakgrunnsbildet (Android 12+). */
val SEEDS: List<Triple<String, String, Long>> = listOf(
    Triple("system", "Følg systemet", 0xFFFFB68A),
    Triple("orange", "Oransje", 0xFFFFB68A),
    Triple("blue", "Blå", 0xFFA8C7FA),
    Triple("green", "Grønn", 0xFF8CD5B0),
    Triple("purple", "Lilla", 0xFFD0BCFF),
    Triple("pink", "Rosa", 0xFFFFB1C8),
    Triple("yellow", "Gul", 0xFFE9C46A),
)
val MODES: List<Pair<String, String>> = listOf("system" to "Følg systemet", "light" to "Lys", "dark" to "Mørk")

private const val BASE_SEED = 0xFFFFB68A
/** Statusfarger og Domener-rosa: samme kulør uansett frøfarge (lys modus får egne toner). */
private val FIXED = setOf(
    0xFF9FE3C6, 0xFF7BE3A0, 0xFF1F3A2F, 0xFFC9E4D8, 0xFF07301F, 0xFFFF8A80, 0xFFF2B56B, 0xFFF2C14E, 0xFFE60000, 0xFF4285F4,
    0xFF7B2949, 0xFFFFD9E2, 0xFFFFB1C8, 0xFF2A2024, 0xFF3A2C31, 0xFFD5C2C6, 0xFF3A0B07, 0xFF4A1F25,
)

/** Rollene i paletten: (lyshet, metning) i OKLCH for mørk og lys modus, og kulørforskyvning (tertiær). */
private enum class Role(val dl: Double, val dc: Double, val ll: Double, val lc: Double, val dh: Double = 0.0) {
    SURFACE(.17, .012, .985, .006), SURFACE_LOW(.205, .013, .97, .008), SURFACE1(.24, .015, .955, .009),
    SURFACE2(.285, .017, .935, .011), SURFACE3(.33, .018, .915, .013),
    PRIMARY(.84, .105, .50, .13), ON_PRIMARY(.32, .08, .995, .0),
    PRIMARY_CONTAINER(.42, .10, .92, .05), ON_PRIMARY_CONTAINER(.93, .045, .30, .08),
    SECONDARY_CONTAINER(.42, .04, .92, .03), ON_SECONDARY_CONTAINER(.93, .03, .28, .04),
    TERTIARY_CONTAINER(.40, .04, .92, .04, 60.0), ON_TERTIARY_CONTAINER(.92, .05, .28, .05, 60.0),
    ON_SURFACE(.92, .012, .22, .01), ON_SURFACE_VARIANT(.83, .02, .42, .02), OUTLINE(.66, .02, .56, .02),
    ACCENT(.71, .17, .58, .17),
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

/** Gjeldende tone (frøfarge, lys/mørk og eventuelt systemets dynamiske skjema). Leses i komposisjonen. */
object Tone {
    var seed by mutableStateOf(BASE_SEED)
    var light by mutableStateOf(false)
    var dynamic by mutableStateOf<ColorScheme?>(null)
    private val cache = HashMap<Long, Color>()
    private var cacheKey: Any? = null

    fun map(c: Long): Color {
        val s = seed; val l = light; val d = dynamic
        if (s == BASE_SEED && !l && d == null) return Color(c)
        val key = Triple(s, l, d)
        if (key != cacheKey) { cache.clear(); cacheKey = key }
        return cache.getOrPut(c) { resolve(c, s, l, d) }
    }

    private fun resolve(c: Long, seed: Long, light: Boolean, d: ColorScheme?): Color {
        val argb = 0xFF000000 or (c and 0xFFFFFF)
        val alpha = (c shr 24) and 0xFF
        val role = if (argb in FIXED) null else ROLE_OF[argb]
        if (role != null) {
            if (d != null) return fromScheme(role, d).copy(alpha = alpha / 255f)
            val sh = Ok.lch(seed)
            val k = (sh[1] / 0.10).coerceIn(0.5, 1.4) // svake frøfarger gir roligere toner
            val L = if (light) role.ll else role.dl
            val C = (if (light) role.lc else role.dc) * k
            return Color(Ok.color(L, C, sh[2] + role.dh, alpha))
        }
        // Øvrige designfarger: behold lyshet og metning, flytt kulør (unntatt faste), og egne toner i lys modus.
        val o = Ok.lch(argb)
        val fixed = argb in FIXED
        val h = if (fixed || o[1] < 0.02) o[2] else o[2] + (Ok.lch(seed)[2] - Ok.lch(BASE_SEED)[2])
        val L = if (!light) o[0] else if (o[0] < 0.5) 0.98 - o[0] * 0.25 else (1.17 - o[0]).coerceIn(0.22, 0.6)
        return Color(Ok.color(L, o[1], h, alpha))
    }

    private fun fromScheme(r: Role, s: ColorScheme): Color = when (r) {
        Role.SURFACE -> s.surface
        Role.SURFACE_LOW -> s.surfaceContainerLow
        Role.SURFACE1 -> s.surfaceContainer
        Role.SURFACE2 -> s.surfaceContainerHigh
        Role.SURFACE3 -> s.surfaceContainerHighest
        Role.PRIMARY, Role.ACCENT -> s.primary
        Role.ON_PRIMARY -> s.onPrimary
        Role.PRIMARY_CONTAINER -> s.primaryContainer
        Role.ON_PRIMARY_CONTAINER -> s.onPrimaryContainer
        Role.SECONDARY_CONTAINER -> s.secondaryContainer
        Role.ON_SECONDARY_CONTAINER -> s.onSecondaryContainer
        Role.TERTIARY_CONTAINER -> s.tertiaryContainer
        Role.ON_TERTIARY_CONTAINER -> s.onTertiaryContainer
        Role.ON_SURFACE -> s.onSurface
        Role.ON_SURFACE_VARIANT -> s.onSurfaceVariant
        Role.OUTLINE -> s.outline
    }
}

/** Farge fra designet, oversatt til gjeldende tone. Bruk denne i stedet for Color(0xFF…) i grensesnittet. */
fun tc(c: Long): Color = Tone.map(c)

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

// Domener: rosa tonal palett (designet 1b, Cloudflare-statistikk).
object P {
    val hero: Color get() = tc(0xFF7B2949)
    val onHero: Color get() = tc(0xFFFFD9E2)
    val accent: Color get() = tc(0xFFFFB1C8)
    val card: Color get() = tc(0xFF2A2024)
    val card2: Color get() = tc(0xFF3A2C31)
    val text2: Color get() = tc(0xFFD5C2C6)
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

private val type = Typography(
    displaySmall = TextStyle(fontSize = 36.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp),
    headlineMedium = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
)

// Uttrykksfulle former: ulik rundingsgrad på hjørnene, som i M3 Expressive.
private val shapes = Shapes(
    small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(20.dp), large = RoundedCornerShape(28.dp), extraLarge = RoundedCornerShape(32.dp),
)

/**
 * color: system | orange | blue | green | purple | pink | yellow. mode: system | light | dark (standard mørk).
 * «Følg systemet» bruker dynamiske farger (Android 12+) direkte: både Compose-skjemaet og designets egne flater
 * hentes fra rollene i dynamicDark/LightColorScheme. Eldre Android faller tilbake til oransje.
 */
@Composable
fun FinansTheme(color: String = "system", mode: String = "dark", content: @Composable () -> Unit) {
    val ctx = LocalContext.current
    val light = when (mode) { "light" -> true; "system" -> !isSystemInDarkTheme(); else -> false }
    val dynamic = color == "system" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    // Systemets skjema: lages på nytt når bakgrunnsbildet (og dermed aksentfargen) byttes, fordi aktiviteten da får ny konfigurasjon.
    val dyn = remember(dynamic, light, ctx) {
        when {
            dynamic && light -> dynamicLightColorScheme(ctx)
            dynamic -> dynamicDarkColorScheme(ctx)
            else -> null
        }
    }
    val seed = when {
        dyn != null -> 0xFF000000 or (dyn.primary.toArgb().toLong() and 0xFFFFFF)
        else -> SEEDS.firstOrNull { it.first == color }?.third ?: BASE_SEED
    }
    if (Tone.seed != seed) Tone.seed = seed
    if (Tone.light != light) Tone.light = light
    if (Tone.dynamic != dyn) Tone.dynamic = dyn
    val scheme = dyn ?: schemeFromPalette(light)
    val view = LocalView.current
    if (!view.isInEditMode) SideEffect {
        (view.context as? Activity)?.window?.let { w ->
            val c = WindowCompat.getInsetsController(w, view)
            c.isAppearanceLightStatusBars = light
            c.isAppearanceLightNavigationBars = light
        }
    }
    MaterialTheme(colorScheme = scheme, typography = type, shapes = shapes, content = content)
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
