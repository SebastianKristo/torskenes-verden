package no.kristo.kalender.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import no.kristo.kalender.KCal
import no.kristo.kalender.KTok
import no.kristo.kalender.KWx
import no.kristo.kalender.LocalK
import no.kristo.kalender.Manrope
import no.kristo.kalender.Newsreader
import no.kristo.kalender.PlexMono
import no.kristo.kalender.WXP
import no.kristo.kalender.wkd

/* Prompt 33: felles byggeklosser i Kalender-appen (knapper, piller, chips, brytere, SVG-ikoner). Mål i dp = px i fasiten. */

fun man(size: TextUnit, w: FontWeight = FontWeight.Medium, c: Color = Color.Unspecified, lh: TextUnit = TextUnit.Unspecified) =
    TextStyle(fontFamily = Manrope, fontSize = size, fontWeight = w, color = c, lineHeight = lh)
fun news(size: TextUnit, c: Color = Color.Unspecified, lh: TextUnit = TextUnit.Unspecified, w: FontWeight = FontWeight.Medium) =
    TextStyle(fontFamily = Newsreader, fontSize = size, fontWeight = w, color = c, lineHeight = lh, letterSpacing = (-0.01).em)
fun mono(size: TextUnit, c: Color = Color.Unspecified, ls: Float = 0f) =
    TextStyle(fontFamily = PlexMono, fontSize = size, fontWeight = FontWeight.SemiBold, color = c, letterSpacing = ls.em)

/** Prompt 35: ukenummer – IBM Plex Mono 800 i full tekstfarge (--ink), uten bakgrunn. */
fun monoX(size: TextUnit, c: Color, ls: Float = 0f) =
    TextStyle(fontFamily = no.kristo.kalender.PlexMonoX, fontSize = size, fontWeight = FontWeight.ExtraBold, color = c, letterSpacing = ls.em,
        fontSynthesis = androidx.compose.ui.text.font.FontSynthesis.Weight)

@Composable
fun Tx(text: String, style: TextStyle, modifier: Modifier = Modifier, maxLines: Int = 1) =
    Text(text, modifier, style = style, maxLines = maxLines, overflow = TextOverflow.Ellipsis, softWrap = maxLines > 1)

/** Trykk uten ripple, med haptikk lagt på av kalleren. */
@Composable
fun Modifier.tap(label: String? = null, role: Role = Role.Button, onClick: () -> Unit): Modifier =
    this.clickable(remember { MutableInteractionSource() }, indication = null, onClickLabel = label, role = role, onClick = onClick)

/** Kalenderfarger: tekst i chips og blokker (tx i lyst tema, lt i mørkt). */
fun KCal.fg(k: KTok): Color = Color(if (k.dark) lt else tx)
val KCal.col: Color get() = Color(c)

/** SVG-sti (viewBox 24) tegnet med strek. */
@Composable
fun Svg(path: String, size: Dp, color: Color, stroke: Float = 2f, modifier: Modifier = Modifier, fill: Boolean = false) {
    val p = remember(path) { PathParser().parsePathString(path).toPath() }
    Canvas(modifier.size(size)) {
        val k = this.size.minDimension / 24f
        scale(k, k, Offset.Zero) {
            if (fill) drawPath(p, color) else drawPath(p, color, style = Stroke(stroke, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

object Ic {
    const val MENU = "M4 7h16M4 12h10M4 17h16"
    const val PREV = "M15 5l-7 7 7 7"
    const val NEXT = "M9 5l7 7-7 7"
    const val SEARCH = "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20 20l-3.5-3.5"
    const val PLUS = "M12 5v14M5 12h14"
    const val UP = "M12 19V5M5 12l7-7 7 7"
    const val BACK = "M8 0v12L0 6z"
    /** Prompt 35: tannhjulet (Innstillinger nederst i sidemenyen). */
    const val GEAR = "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
}

/** Vær-ikonet (WXP) i fasitens farger: sol gul, regn blå, ellers dempet. */
@Composable
fun WxIcon(w: KWx, size: Dp) {
    val k = LocalK.current
    val kd = wkd(w.c)
    Svg(WXP.getValue(kd), size, when (kd) { "sol" -> Color(0xFFB8860B); "regn" -> Color(0xFF2B5D8A); else -> k.mut }, 2f)
}

/** 34 dp rund knapp (chip-farge) med 44 dp treffflate. */
@Composable
fun RoundBtn(label: String, path: String, onClick: () -> Unit, bg: Color? = null, size: Dp = 34.dp, icon: Dp = 15.dp, stroke: Float = 2.4f) {
    val k = LocalK.current
    Box(Modifier.size(44.dp).tap(label, onClick = onClick).semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Box(Modifier.size(size).clip(CircleShape).background(bg ?: k.chip), contentAlignment = Alignment.Center) { Svg(path, icon, k.ink, stroke) }
    }
}

/** Mørk pille (Ferdig, I dag, Legg til). Inverteres i mørkt tema: --ink som bakgrunn, --bg som tekst. */
@Composable
fun InkPill(text: String, onClick: () -> Unit, enabled: Boolean = true, h: Dp = 36.dp, padH: Dp = 18.dp, fs: TextUnit = 13.5.sp) {
    val k = LocalK.current
    Box(
        Modifier.height(maxOf(h, 36.dp)).clip(RoundedCornerShape(50)).background(if (enabled) k.ink else k.mut2).tap(text, onClick = onClick).padding(horizontal = padH),
        contentAlignment = Alignment.Center,
    ) { Tx(text, man(fs, FontWeight.Bold, k.bg)) }
}

/** Kantpille (Avbryt). */
@Composable
fun LinePill(text: String, onClick: () -> Unit, h: Dp = 36.dp) {
    val k = LocalK.current
    Box(Modifier.height(h).clip(RoundedCornerShape(50)).border(1.dp, k.line, RoundedCornerShape(50)).tap(text, onClick = onClick).padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
        Tx(text, man(13.5.sp, FontWeight.Bold, k.ink))
    }
}

/** Valg-chip (kalender, varsel, filter). on = blekk-fylt. dot = fargeprikk foran. */
@Composable
fun Chip(text: String, on: Boolean, onClick: () -> Unit, dot: Color? = null, h: Dp = 34.dp, bgOff: Color = Color.Transparent) {
    val k = LocalK.current
    Row(
        Modifier.height(h).clip(RoundedCornerShape(50)).background(if (on) k.ink else bgOff).border(1.dp, if (on) k.ink else k.line, RoundedCornerShape(50))
            .tap(text, Role.Checkbox, onClick).padding(horizontal = 13.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (dot != null) Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
        Tx(text, man(12.5.sp, FontWeight.Bold, if (on) k.bg else k.ink))
    }
}

/** Bryter 44 × 26 (grønn når på). */
@Composable
fun Toggle(on: Boolean) {
    val k = LocalK.current
    Box(Modifier.width(44.dp).height(26.dp).clip(RoundedCornerShape(13.dp)).background(if (on) Color(0xFF2F7A4F) else k.line)) {
        Box(Modifier.offset(x = if (on) 21.dp else 3.dp, y = 3.dp).size(20.dp).shadow(1.5.dp, CircleShape).clip(CircleShape).background(Color.White))
    }
}

/** Liten seksjonsetikett (KALENDER, VARSEL, VISNING …). */
@Composable
fun Label(text: String, modifier: Modifier = Modifier) {
    val k = LocalK.current
    Tx(text, mono(10.5.sp, k.mut2, .12f), modifier)
}

/** Dra-håndtaket øverst på arkene. */
@Composable
fun Grip() {
    val k = LocalK.current
    Box(Modifier.width(36.dp).height(5.dp).clip(RoundedCornerShape(3.dp)).background(k.line))
}

/** Tag-pille i listen (FRIST, BURSDAG, FORTS.). */
@Composable
fun RowScope.Tag(text: String, bg: Color, fg: Color) {
    Box(Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 6.dp, vertical = 1.dp)) { Tx(text, mono(9.5.sp, fg, .06f).copy(fontWeight = FontWeight.Bold)) }
}

