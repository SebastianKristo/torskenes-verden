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
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
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
 * Farger: designet (1b) er tegnet i én mørk tonal palett fra #FF7A3D. Material You («Følg systemet»)
 * og de andre fargene lages ved å flytte fargetonen på hele paletten, og lys modus speiler lysheten.
 * Semantisk grønn, rød og gul flyttes ikke. Samme regel som prototypen (m3Map).
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
private val FIXED = setOf(0xFF9FE3C6, 0xFF7BE3A0, 0xFF1F3A2F, 0xFFC9E4D8, 0xFF07301F, 0xFFFF8A80, 0xFFF2B56B, 0xFFF2C14E)

/** Gjeldende tone (frøfarge og lys/mørk). Leses i komposisjonen, så alt tegnes på nytt når den endres. */
object Tone {
    var seed by mutableStateOf(BASE_SEED)
    var light by mutableStateOf(false)
    private val cache = HashMap<Long, Color>()
    private var cacheSeed = BASE_SEED
    private var cacheLight = false

    fun map(c: Long): Color {
        val s = seed
        val l = light
        if (s == BASE_SEED && !l) return Color(c)
        if (s != cacheSeed || l != cacheLight) { cache.clear(); cacheSeed = s; cacheLight = l }
        return cache.getOrPut(c) { Color(transform(c, s, l)) }
    }

    private fun hsl(c: Long): FloatArray {
        val r = ((c shr 16) and 0xFF) / 255f
        val g = ((c shr 8) and 0xFF) / 255f
        val b = (c and 0xFF) / 255f
        val mx = max(r, max(g, b))
        val mn = min(r, min(g, b))
        val l = (mx + mn) / 2
        var h = 0f
        var s = 0f
        if (mx != mn) {
            val d = mx - mn
            s = if (l > .5f) d / (2 - mx - mn) else d / (mx + mn)
            h = when (mx) {
                r -> (g - b) / d + (if (g < b) 6 else 0)
                g -> (b - r) / d + 2
                else -> (r - g) / d + 4
            } * 60
        }
        return floatArrayOf(h, s, l)
    }

    private fun fromHsl(h0: Float, s: Float, l: Float): Long {
        val h = ((h0 % 360) + 360) % 360
        val a = s * min(l, 1 - l)
        fun f(n: Int): Float {
            val k = (n + h / 30) % 12
            return l - a * max(-1f, min(min(k - 3, 9 - k), 1f))
        }
        fun ch(v: Float) = (v * 255).roundToInt().coerceIn(0, 255).toLong()
        return 0xFF000000 or (ch(f(0)) shl 16) or (ch(f(8)) shl 8) or ch(f(4))
    }

    private fun transform(c: Long, seed: Long, light: Boolean): Long {
        val rgb = c and 0xFFFFFF
        val fix = (0xFF000000 or rgb) in FIXED
        val dh = hsl(seed)[0] - hsl(BASE_SEED)[0]
        val hs = hsl(c)
        var h = hs[0]
        val s = hs[1]
        var l = hs[2]
        if (!fix && s > .12f) h += dh
        if (light) {
            l = when {
                s > .5f && l > .55f -> .36f
                s > .15f && l > .13f && l < .46f -> .92f - (l - .13f) * .3f
                else -> (1 - l).coerceIn(.04f, .985f)
            }
            if (fix && l < .5f) l = min(l, .32f)
        }
        return (c and 0xFF000000) or (fromHsl(h, s, l) and 0xFFFFFF)
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
 * «Følg systemet» bruker dynamiske farger (Android 12+): Compose-skjemaet fra dynamicDark/LightColorScheme,
 * og designets egne flater tones etter systemets aksentfarge.
 */
@Composable
fun FinansTheme(color: String = "system", mode: String = "dark", content: @Composable () -> Unit) {
    val ctx = LocalContext.current
    val light = when (mode) { "light" -> true; "system" -> !isSystemInDarkTheme(); else -> false }
    val dynamic = color == "system" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val seed = when {
        dynamic -> runCatching { 0xFF000000 or (ctx.getColor(android.R.color.system_accent1_200).toLong() and 0xFFFFFF) }.getOrDefault(BASE_SEED)
        else -> SEEDS.firstOrNull { it.first == color }?.third ?: BASE_SEED
    }
    if (Tone.seed != seed) Tone.seed = seed
    if (Tone.light != light) Tone.light = light
    val scheme = when {
        dynamic && light -> dynamicLightColorScheme(ctx)
        dynamic -> dynamicDarkColorScheme(ctx)
        else -> schemeFromPalette(light)
    }
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
