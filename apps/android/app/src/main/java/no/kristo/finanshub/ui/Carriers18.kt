package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/*
 * Transportørmerker (prompt 18): tegnet etter serverens public/carriers/<id>.svg (64×64, radius 14), så appen viser
 * samme logo som web uten å laste ned SVG. Posthornet til Posten og taket til Helthjem er de samme stiene som i SVG-en.
 */

private class Mark(
    val bg: Long, val text: String, val fs: Float, val weight: FontWeight, val fg: Long, val baseline: Float,
    val x: Float = 32f, val italic: Boolean = false, val spacing: Float = 0f,
)

private val MARKS = mapOf(
    "posten" to Mark(0xFFE32D22, "", 0f, FontWeight.Bold, 0xFFFFFFFF, 0f),
    "bring" to Mark(0xFF7BC144, "bring", 17f, FontWeight.Bold, 0xFFFFFFFF, 38.5f, spacing = -0.6f),
    "postnord" to Mark(0xFF00A0D6, "postnord", 11.5f, FontWeight.Bold, 0xFFFFFFFF, 36.5f, spacing = -0.3f),
    "dhl" to Mark(0xFFFFCC00, "DHL", 20f, FontWeight.Black, 0xFFD40511, 40f, x = 38f, italic = true, spacing = -1f),
    "ups" to Mark(0xFF351C15, "UPS", 22f, FontWeight.ExtraBold, 0xFFFFB500, 39.9f, spacing = -0.5f),
    "fedex" to Mark(0xFF4D148C, "FedEx", 16f, FontWeight.ExtraBold, 0xFFFFFFFF, 37.8f, spacing = -0.5f),
    "gls" to Mark(0xFF172154, "GLS", 22f, FontWeight.ExtraBold, 0xFFFFD100, 39.9f, spacing = -0.5f),
    "schenker" to Mark(0xFFEC0016, "DB", 24f, FontWeight.ExtraBold, 0xFFFFFFFF, 40.6f, spacing = -0.5f),
    "helthjem" to Mark(0xFF1F2A44, "helthjem", 11.5f, FontWeight.Bold, 0xFFFFFFFF, 45f, spacing = -0.3f),
    "budbee" to Mark(0xFF2BCE96, "Budbee", 13f, FontWeight.ExtraBold, 0xFF05271B, 36.7f, spacing = -0.5f),
    "instabox" to Mark(0xFFFF4E00, "Instabox", 11f, FontWeight.ExtraBold, 0xFFFFFFFF, 36f, spacing = -0.5f),
    "other" to Mark(0xFF3A4252, "17", 24f, FontWeight.ExtraBold, 0xFFEEF0F4, 40.6f, spacing = -0.5f),
)

// Initialene serveren sender, til id (eldre data uten carrier-id).
private val BY_INI = mapOf("P" to "posten", "B" to "bring", "PN" to "postnord", "DHL" to "dhl", "UPS" to "ups", "FX" to "fedex",
    "GLS" to "gls", "DB" to "schenker", "HH" to "helthjem", "BB" to "budbee", "IB" to "instabox", "17" to "other")

private const val POSTEN_HORN_1 = "M17 33c0-8.3 6.7-15 15-15 6.4 0 11.9 4 14 9.7"
private const val POSTEN_HORN_2 = "M47 33c0 8.3-6.7 15-15 15-5.2 0-9.8-2.7-12.5-6.7"
private const val POSTEN_RING = "M26 33a6 6 0 1 0 12 0a6 6 0 1 0-12 0"
private const val POSTEN_TIP = "M44 24.5l6.5-3.2-1 7.3z"
private const val HELTHJEM_ROOF = "M32 13l13 11v5h-4v-3.2L32 18l-9 7.8V29h-4v-5z"

private fun svgPath(d: String): Path = PathParser().parsePathString(d).toPath()

/** Id-en for merket, eller null når transportøren er ukjent (da brukes initialer på merkefargen). */
internal fun carrierMarkId(id: String?, ini: String): String? {
    val k = id?.lowercase()?.trim()
    if (k != null && MARKS.containsKey(k)) return k
    return BY_INI[ini.uppercase()]
}

@Composable
internal fun CarrierMark(key: String, size: Int) {
    val m = MARKS[key] ?: return
    val u = size / 64f
    val shape = RoundedCornerShape((14f * u).dp)
    val paths = remember(key) {
        when (key) {
            "posten" -> listOf(svgPath(POSTEN_HORN_1), svgPath(POSTEN_HORN_2), svgPath(POSTEN_RING), svgPath(POSTEN_TIP))
            "helthjem" -> listOf(svgPath(HELTHJEM_ROOF))
            else -> emptyList()
        }
    }
    Box(Modifier.size(size.dp).clip(shape).background(Color(m.bg)), contentAlignment = Alignment.Center) {
        if (key == "posten" || key == "helthjem" || key == "postnord" || key == "dhl") {
            Canvas(Modifier.fillMaxSize()) {
                val k = this.size.width / 64f
                scale(k, k, pivot = Offset.Zero) {
                    when (key) {
                        "posten" -> {
                            val stroke = Stroke(width = 4.2f, cap = StrokeCap.Round)
                            for (i in 0..2) drawPath(paths[i], Color.White, style = stroke)
                            drawPath(paths[3], Color.White)
                        }
                        "helthjem" -> drawPath(paths[0], Color(0xFFFF6B4A))
                        "postnord" -> drawRoundRect(Color.White.copy(alpha = .85f), Offset(14f, 42f), Size(36f, 2.6f), androidx.compose.ui.geometry.CornerRadius(1.3f, 1.3f))
                        "dhl" -> {
                            val red = Color(0xFFD40511)
                            drawRect(red, Offset(7f, 25f), Size(10f, 2.4f))
                            drawRect(red, Offset(5f, 30f), Size(10f, 2.4f))
                            drawRect(red, Offset(3f, 35f), Size(10f, 2.4f))
                        }
                    }
                }
            }
        }
        if (m.text.isNotEmpty()) {
            val density = LocalDensity.current
            val fs = with(density) { (m.fs * u).dp.toSp() }
            // SVG-en plasserer teksten etter grunnlinjen; midten av bokstavene ligger ca. 0,35 × skriftstørrelsen over den.
            val dy = (m.baseline - 0.35f * m.fs - 32f) * u
            val dx = (m.x - 32f) * u
            Text(
                m.text, color = Color(m.fg), maxLines = 1, softWrap = false,
                style = TextStyle(
                    fontSize = fs, lineHeight = fs, fontWeight = m.weight, fontStyle = if (m.italic) FontStyle.Italic else FontStyle.Normal,
                    letterSpacing = with(density) { (m.spacing * u).dp.toSp() },
                ),
                modifier = Modifier.offset(x = dx.dp, y = dy.dp),
            )
        }
    }
}
