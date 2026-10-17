package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.MapCountry
import kotlin.math.ln
import kotlin.math.max

/** Kartfargene fra domener-kart.html: logaritmisk skala fra mørk til lys rosa. */
private val MAP_LO = Color(0xFF4A2433)
private val MAP_HI = Color(0xFFFFB1C8)
private val MAP_EMPTY = Color(0xFF2E2328)
private val MAP_STROKE = Color(0xFF120C0F)

/** Ringene projisert til skjermen (plate carrée, 84° N til 58° S). Ringer over datolinjen rulles ut. */
private fun project(c: MapCountry, w: Float, h: Float): List<FloatArray> = c.rings.map { r ->
    var east = false; var west = false
    for (i in r.indices step 2) { if (r[i] > 170) east = true; if (r[i] < -170) west = true }
    val wraps = east && west
    FloatArray(r.size).also { out ->
        for (i in r.indices step 2) {
            val lon = if (wraps && r[i] < 0) r[i] + 360 else r[i]
            out[i] = ((lon + 180) / 360 * w).toFloat()
            out[i + 1] = ((84 - r[i + 1]) / 142 * h).toFloat()
        }
    }
}

/** Partall-regelen: punktet ligger i landet hvis en stråle krysser kanten et oddetall ganger. */
private fun inside(rings: List<FloatArray>, x: Float, y: Float): Boolean {
    var hit = false
    for (r in rings) {
        val n = r.size / 2
        var j = n - 1
        for (i in 0 until n) {
            val xi = r[i * 2]; val yi = r[i * 2 + 1]; val xj = r[j * 2]; val yj = r[j * 2 + 1]
            if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit
            j = i
        }
    }
    return hit
}

/** Verdenskart over besøk per land. Trykk på et land viser navn og antall besøk. values: ISO 3166-1 numerisk → (navn, besøk). */
@Composable
internal fun WorldMap(countries: List<MapCountry>, values: Map<Int, Pair<String, Double>>) {
    var size by remember { mutableStateOf(IntSize.Zero) }
    var picked by remember { mutableStateOf<Int?>(null) }
    val shapes = remember(countries, size) { countries.map { it to project(it, size.width.toFloat(), size.height.toFloat()) } }
    val maxV = max(2.0, values.values.maxOfOrNull { it.second } ?: 2.0)
    val top = values.values.sortedByDescending { it.second }.take(5).joinToString(", ") { "${it.first} ${count(it.second)}" }
    Box(Modifier.fillMaxWidth().aspectRatio(2.4f)) {
        Canvas(
            Modifier.fillMaxSize()
                .onSizeChanged { size = it }
                .pointerInput(shapes) {
                    detectTapGestures { o ->
                        val hit = shapes.lastOrNull { inside(it.second, o.x, o.y) }?.first?.id
                        picked = if (hit == picked) null else hit
                    }
                }
                .semantics { contentDescription = "Verdenskart med besøk per land" + if (top.isNotEmpty()) ": $top" else "" },
        ) {
            for ((c, rings) in shapes) {
                val p = Path()
                for (r in rings) {
                    if (r.size < 6) continue
                    p.moveTo(r[0], r[1])
                    for (i in 2 until r.size step 2) p.lineTo(r[i], r[i + 1])
                    p.close()
                }
                val v = values[c.id]?.second ?: 0.0
                val fill = if (v <= 0) MAP_EMPTY else lerp(MAP_LO, MAP_HI, (ln(max(1.0, v)) / ln(maxV)).coerceIn(0.0, 1.0).toFloat())
                drawPath(p, fill)
                drawPath(p, if (picked == c.id) Color.White else MAP_STROKE, style = Stroke(if (picked == c.id) 1.2.dp.toPx() else 0.4.dp.toPx()))
            }
        }
        val id = picked
        val c = id?.let { k -> countries.firstOrNull { it.id == k } }
        if (c != null) {
            val v = values[c.id]
            Column(Modifier.align(Alignment.TopStart).padding(6.dp).clip(RoundedCornerShape(14.dp)).background(Color(0xE6201619)).padding(12.dp, 8.dp)) {
                Text(v?.first?.takeIf { it.isNotBlank() } ?: c.name, color = Color(0xFFFFD9E2), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Text(v?.let { "${count(it.second)} besøk" } ?: "Ingen besøk", color = Color(0xFFFFD9E2).copy(alpha = .75f), fontSize = 12.sp)
            }
        }
    }
}
