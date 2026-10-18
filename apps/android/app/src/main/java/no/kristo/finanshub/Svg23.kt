package no.kristo.finanshub

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Liten SVG-tolker for ikonene fra Iconify (prompt 23): path, circle, ellipse, rect, line, polyline og polygon,
 * med fill/stroke arvet fra <g>. currentColor tegnes svart, så ikonet kan farges med tint (tekstfargen).
 * Fargesett (emoji) beholder egne farger. Gradienter og masker hoppes over (fylles med en nøytral farge).
 */
object Svg23 {
    private val TAG = Regex("<(/?)([a-zA-Z][\\w:-]*)((?:\\s+[\\w:-]+\\s*=\\s*(?:\"[^\"]*\"|'[^']*'))*)\\s*(/?)>")
    private val ATTR = Regex("([\\w:-]+)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')")
    private val SKIP = setOf("defs", "mask", "clipPath", "linearGradient", "radialGradient", "symbol", "title", "desc", "style", "metadata", "pattern", "filter")
    private val INHERIT = setOf("fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-rule", "opacity", "fill-opacity", "stroke-opacity")

    private fun attrs(s: String): Map<String, String> {
        val m = HashMap<String, String>()
        ATTR.findAll(s).forEach { r -> m[r.groupValues[1]] = r.groupValues[2].ifEmpty { r.groupValues[3] } }
        m["style"]?.split(';')?.forEach { kv -> val k = kv.substringBefore(':').trim(); val v = kv.substringAfter(':', "").trim(); if (k.isNotEmpty() && v.isNotEmpty()) m[k] = v }
        return m
    }

    private fun color(v: String?): Color? {
        val s = v?.trim()?.lowercase() ?: return null
        return when {
            s == "none" || s == "transparent" -> null
            s == "currentcolor" || s == "black" -> Color.Black
            s == "white" -> Color.White
            s.startsWith("url(") -> Color(0xFF8A8A8A)
            s.startsWith("#") && s.length == 4 -> s.drop(1).map { "$it$it" }.joinToString("").toLongOrNull(16)?.let { Color(0xFF000000 or it) }
            s.startsWith("#") && s.length == 7 -> s.drop(1).toLongOrNull(16)?.let { Color(0xFF000000 or it) }
            s.startsWith("#") && s.length == 9 -> s.drop(1).toLongOrNull(16)?.let { Color(((it and 0xFF) shl 24) or (it shr 8)) }
            s.startsWith("rgb") -> s.substringAfter('(').substringBefore(')').split(',').mapNotNull { it.trim().toFloatOrNull() }.takeIf { it.size >= 3 }
                ?.let { Color(it[0] / 255f, it[1] / 255f, it[2] / 255f, it.getOrElse(3) { 1f }.coerceIn(0f, 1f)) }
            else -> Color.Black
        }
    }

    private fun f(m: Map<String, String>, k: String, d: Float = 0f) = m[k]?.trim()?.removeSuffix("px")?.toFloatOrNull() ?: d
    private fun n(v: Float): String = if (v == v.toLong().toFloat()) v.toLong().toString() else v.toString()

    private fun shapeD(tag: String, m: Map<String, String>): String? = when (tag) {
        "path" -> m["d"]
        "circle" -> { val cx = f(m, "cx"); val cy = f(m, "cy"); val r = f(m, "r"); if (r <= 0f) null else "M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z" }
        "ellipse" -> { val cx = f(m, "cx"); val cy = f(m, "cy"); val rx = f(m, "rx"); val ry = f(m, "ry"); if (rx <= 0f || ry <= 0f) null else "M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z" }
        "line" -> "M${n(f(m, "x1"))} ${n(f(m, "y1"))}L${n(f(m, "x2"))} ${n(f(m, "y2"))}"
        "polyline", "polygon" -> m["points"]?.trim()?.split(Regex("[\\s,]+"))?.mapNotNull { it.toFloatOrNull() }?.chunked(2)?.filter { it.size == 2 }?.takeIf { it.isNotEmpty() }
            ?.mapIndexed { i, p -> (if (i == 0) "M" else "L") + "${n(p[0])} ${n(p[1])}" }?.joinToString("")?.plus(if (tag == "polygon") "Z" else "")
        "rect" -> {
            val x = f(m, "x"); val y = f(m, "y"); val w = f(m, "width"); val h = f(m, "height")
            var rx = f(m, "rx", -1f); var ry = f(m, "ry", -1f)
            if (rx < 0f) rx = if (ry < 0f) 0f else ry
            if (ry < 0f) ry = rx
            rx = rx.coerceAtMost(w / 2); ry = ry.coerceAtMost(h / 2)
            if (w <= 0f || h <= 0f) null
            else if (rx <= 0f) "M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z"
            else "M${n(x + rx)} ${n(y)}h${n(w - 2 * rx)}a${n(rx)} ${n(ry)} 0 0 1 ${n(rx)} ${n(ry)}v${n(h - 2 * ry)}a${n(rx)} ${n(ry)} 0 0 1 ${n(-rx)} ${n(ry)}" +
                "h${n(-(w - 2 * rx))}a${n(rx)} ${n(ry)} 0 0 1 ${n(-rx)} ${n(-ry)}v${n(-(h - 2 * ry))}a${n(rx)} ${n(ry)} 0 0 1 ${n(rx)} ${n(-ry)}Z"
        }
        else -> null
    }

    /** Tolker SVG-teksten til en ImageVector (24 dp). null hvis ingenting kunne tegnes. */
    fun parse(svg: String): ImageVector? = runCatching {
        val root = TAG.find(svg)?.takeIf { it.groupValues[2] == "svg" } ?: return null
        val ra = attrs(root.groupValues[3])
        val vb = ra["viewBox"]?.trim()?.split(Regex("[\\s,]+"))?.mapNotNull { it.toFloatOrNull() }?.takeIf { it.size == 4 }
            ?: listOf(0f, 0f, f(ra, "width", 24f), f(ra, "height", 24f))
        val b = ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = vb[2].coerceAtLeast(1f), viewportHeight = vb[3].coerceAtLeast(1f))
        b.addGroup(translationX = -vb[0], translationY = -vb[1])
        val stack = ArrayList<Map<String, String>>()
        stack.add(ra.filterKeys { it in INHERIT })
        var skip = 0
        var groups = 0
        var paths = 0
        TAG.findAll(svg, root.range.last + 1).forEach { t ->
            val closing = t.groupValues[1] == "/"
            val tag = t.groupValues[2]
            val self = t.groupValues[4] == "/"
            if (tag in SKIP) { if (closing) skip = (skip - 1).coerceAtLeast(0) else if (!self) skip++; return@forEach }
            if (skip > 0) return@forEach
            if (tag == "g") {
                if (closing) {
                    if (stack.size > 1) { stack.removeAt(stack.size - 1); b.clearGroup(); groups-- }
                } else if (!self) {
                    val a = attrs(t.groupValues[3])
                    stack.add(stack.last() + a.filterKeys { it in INHERIT })
                    val tr = a["transform"]?.trim()
                    var tx = 0f; var ty = 0f; var sx = 1f; var sy = 1f
                    tr?.let { s ->
                        Regex("translate\\(([^)]*)\\)").find(s)?.groupValues?.get(1)?.split(Regex("[\\s,]+"))?.mapNotNull { it.toFloatOrNull() }?.let { v -> tx = v.getOrElse(0) { 0f }; ty = v.getOrElse(1) { 0f } }
                        Regex("scale\\(([^)]*)\\)").find(s)?.groupValues?.get(1)?.split(Regex("[\\s,]+"))?.mapNotNull { it.toFloatOrNull() }?.let { v -> sx = v.getOrElse(0) { 1f }; sy = v.getOrElse(1) { sx } }
                    }
                    b.addGroup(translationX = tx, translationY = ty, scaleX = sx, scaleY = sy)
                    groups++
                }
                return@forEach
            }
            if (closing) return@forEach
            val own = attrs(t.groupValues[3])
            val m = stack.last() + own
            val d = shapeD(tag, m) ?: return@forEach
            val nodes = runCatching { addPathNodes(d) }.getOrNull()?.takeIf { it.isNotEmpty() } ?: return@forEach
            val op = f(m, "opacity", 1f)
            val fill = color(m["fill"] ?: if (tag == "line") "none" else "black")
            val stroke = color(m["stroke"])
            if (fill == null && stroke == null) return@forEach
            b.addPath(
                pathData = nodes,
                pathFillType = if (m["fill-rule"] == "evenodd" || m["clip-rule"] == "evenodd") PathFillType.EvenOdd else PathFillType.NonZero,
                fill = fill?.let { SolidColor(it) }, fillAlpha = (f(m, "fill-opacity", 1f) * op).coerceIn(0f, 1f),
                stroke = stroke?.let { SolidColor(it) }, strokeAlpha = (f(m, "stroke-opacity", 1f) * op).coerceIn(0f, 1f),
                strokeLineWidth = if (stroke != null) f(m, "stroke-width", 1f) else 0f,
                strokeLineCap = when (m["stroke-linecap"]) { "round" -> StrokeCap.Round; "square" -> StrokeCap.Square; else -> StrokeCap.Butt },
                strokeLineJoin = when (m["stroke-linejoin"]) { "round" -> StrokeJoin.Round; "bevel" -> StrokeJoin.Bevel; else -> StrokeJoin.Miter },
            )
            paths++
        }
        repeat(groups) { b.clearGroup() }
        b.clearGroup()
        if (paths == 0) null else b.build()
    }.getOrNull()
}
