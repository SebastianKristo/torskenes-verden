package no.kristo.finanshub.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

// Tonal palett fra grunnfargen #FF7A3D (Material 3 Expressive, mørkt tema), som i designet 1b.
object C {
    val bg = Color(0xFF19120E)
    val surface1 = Color(0xFF261E19)
    val surface2 = Color(0xFF31281F)
    val surface3 = Color(0xFF3D332C)
    val primary = Color(0xFFFFB68A)
    val onPrimary = Color(0xFF532200)
    val container = Color(0xFF5D4033)
    val onContainer = Color(0xFFFFDBC8)
    val text = Color(0xFFF0DFD7)
    val text2 = Color(0xFFD7C2B8)
    val outline = Color(0xFFA08D83)
    val positive = Color(0xFF9FE3C6)
    val positiveBg = Color(0xFF1F3A2F)
    val accent = Color(0xFFFF7A3D)
    val accentLight = Color(0xFFFFB08A)
    val paper = Color(0xFFECE8E0)
}

private val scheme = darkColorScheme(
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

@Composable
fun FinansTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = scheme, typography = type, shapes = shapes, content = content)

/* ---------- Formatering (norsk, minus som −) ---------- */

private val nb = Locale("nb", "NO")
fun n2(v: Double): String = NumberFormat.getNumberInstance(nb).apply { minimumFractionDigits = 2; maximumFractionDigits = 2 }.format(kotlin.math.abs(v)).replace(' ', ' ')
fun n0(v: Double): String = NumberFormat.getNumberInstance(nb).apply { maximumFractionDigits = 0 }.format(kotlin.math.abs(v)).replace(' ', ' ')
fun signed(v: Double) = (if (v < 0) "−" else "+") + n2(v)
fun neg0(v: Double) = (if (v < 0) "−" else "") + n0(v)
fun ddmm(d: String?) = if (d == null || d.length < 10) "–" else "${d.substring(8, 10)}.${d.substring(5, 7)}"
fun dayLabel(d: String): String = runCatching {
    LocalDate.parse(d).format(DateTimeFormatter.ofPattern("EEEE d. MMM", nb)).replaceFirstChar { it.uppercase() }
}.getOrDefault(d)
fun monthLabel(m: String): String = runCatching {
    LocalDate.parse("$m-15").format(DateTimeFormatter.ofPattern("LLLL", nb)).replaceFirstChar { it.uppercase() }
}.getOrDefault(m)
fun initial(s: String) = s.firstOrNull { it.isLetterOrDigit() }?.uppercase() ?: "•"
