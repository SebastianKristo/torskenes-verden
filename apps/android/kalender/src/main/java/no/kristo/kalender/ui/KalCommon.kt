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
import no.kristo.kalender.ui.designsystem.DsText
import no.kristo.kalender.KCal
import no.kristo.kalender.KTok
import no.kristo.kalender.KWx
import no.kristo.kalender.LocalK
import no.kristo.kalender.Manrope
import no.kristo.kalender.Newsreader
import no.kristo.kalender.PlexMono
import no.kristo.kalender.WXP
import no.kristo.kalender.wkd
import no.kristo.kalender.ui.designsystem.DsPalette
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.semantics.stateDescription

/* Prompt 33: felles byggeklosser i Kalender-appen (knapper, piller, chips, brytere, SVG-ikoner). Mål i dp = px i fasiten. */

/**
 * Typeskjemaet: størrelsene fra DsText (ui/designsystem/DesignTokens.kt, generert fra shared/design/tokens.json). Skjermene sender
 * disse til man (Manrope), news (Newsreader) og mono (IBM Plex Mono) i stedet for egne sp-verdier, så Papir-fontene beholdes og
 * størrelsene følger tokenene. Fet skrift settes med vekten, aldri med en ny størrelse.
 */
object KType {
    /** 11 sp: merker, ukedager, små etiketter. */
    val caption: TextUnit get() = DsText.caption.fontSize
    /** 12 sp: undertekst. */
    val footnote: TextUnit get() = DsText.footnote.fontSize
    /** 13 sp: sekundær tekst, chips og piller. */
    val subheadline: TextUnit get() = DsText.subheadline.fontSize
    /** 14 sp: brødtekst i lister og knapper. */
    val callout: TextUnit get() = DsText.callout.fontSize
    /** 16 sp: felt og hovedtekst. */
    val body: TextUnit get() = DsText.body.fontSize
    /** 18 sp: overskrift i kort og ark. */
    val headline: TextUnit get() = DsText.headline.fontSize
    /** 22 sp: arktitler. */
    val title3: TextUnit get() = DsText.title3.fontSize
    /** 28 sp: sidetitler og store tall. */
    val title2: TextUnit get() = DsText.title2.fontSize
    /** 44 sp: dagens dato i ikonene. */
    val largeTitle: TextUnit get() = DsText.largeTitle.fontSize
}

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
    /** Lukk / fjern (Material «close»-formen som strek). */
    const val CLOSE = "M6 6l12 12M18 6L6 18"
    /** Prompt 35: tannhjulet (Innstillinger nederst i sidemenyen). */
    const val GEAR = "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
}

/** Vær-ikonet (WXP) i fasitens farger: sol gul, regn blå, ellers dempet. */
@Composable
fun WxIcon(w: KWx, size: Dp) {
    val k = LocalK.current
    val kd = wkd(w.c)
    Svg(WXP.getValue(kd), size, when (kd) { "sol" -> DsPalette.Category.amber; "regn" -> DsPalette.Category.blue; else -> k.mut }, 2f)
}

/** 34 dp rund knapp (chip-farge) med 48 dp treffflate (minstemålet for trykkflater). */
@Composable
fun RoundBtn(label: String, path: String, onClick: () -> Unit, bg: Color? = null, size: Dp = 34.dp, icon: Dp = 15.dp, stroke: Float = 2.4f) {
    val k = LocalK.current
    Box(Modifier.size(48.dp).tap(label, onClick = onClick).semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Box(Modifier.size(size).clip(CircleShape).background(bg ?: k.chip), contentAlignment = Alignment.Center) { Svg(path, icon, k.ink, stroke) }
    }
}

/** Mørk pille (Ferdig, I dag, Legg til). Inverteres i mørkt tema: --ink som bakgrunn, --bg som tekst. */
@Composable
fun InkPill(text: String, onClick: () -> Unit, enabled: Boolean = true, h: Dp = 36.dp, padH: Dp = 18.dp, fs: TextUnit = KType.subheadline) {
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
        Tx(text, man(KType.subheadline, FontWeight.Bold, k.ink))
    }
}

/** Valg-chip (kalender, varsel, filter). on = blekk-fylt. dot = fargeprikk foran. */
@Composable
fun Chip(text: String, on: Boolean, onClick: () -> Unit, dot: Color? = null, h: Dp = 34.dp, bgOff: Color = Color.Transparent) {
    val k = LocalK.current
    Row(
        Modifier.height(h).clip(RoundedCornerShape(50)).background(if (on) k.ink else bgOff).border(1.dp, if (on) k.ink else k.line, RoundedCornerShape(50))
            .semantics { stateDescription = if (on) "Valgt" else "Ikke valgt" }.tap(text, Role.Checkbox, onClick).padding(horizontal = 13.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (dot != null) Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
        Tx(text, man(KType.footnote, FontWeight.Bold, if (on) k.bg else k.ink))
    }
}

/** Bryter 44 × 26 (grønn når på). Raden rundt har Role.Switch; tilstanden («På»/«Av») slås sammen med radens tekst for TalkBack. */
@Composable
fun Toggle(on: Boolean) {
    val k = LocalK.current
    Box(Modifier.semantics { stateDescription = if (on) "På" else "Av" }.width(44.dp).height(26.dp).clip(RoundedCornerShape(13.dp)).background(if (on) k.ds.success else k.line)) {
        Box(Modifier.offset(x = if (on) 21.dp else 3.dp, y = 3.dp).size(20.dp).shadow(1.5.dp, CircleShape).clip(CircleShape).background(Color.White))
    }
}

/** Pil til høyre i en rad som åpner en underside. Bare pynt: raden har selv rollen og teksten for TalkBack. */
@Composable
fun Chevron(color: Color, size: Dp = 14.dp) = Svg(Ic.NEXT, size, color, 2.2f)

/** «‹ Tilbake»-lenken: pil og tekst, minst 48 dp høy. */
@Composable
fun BackLink(text: String, color: Color, style: TextStyle, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier.heightIn(min = 48.dp).tap(text, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Svg(Ic.PREV, 12.dp, color, 2.6f)
        Tx(text, style)
    }
}

/** Liten seksjonsetikett (KALENDER, VARSEL, VISNING …). */
@Composable
fun Label(text: String, modifier: Modifier = Modifier) {
    val k = LocalK.current
    Tx(text, mono(KType.caption, k.mut2, .12f), modifier)
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
    Box(Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 6.dp, vertical = 1.dp)) { Tx(text, mono(KType.caption, fg, .06f).copy(fontWeight = FontWeight.Bold)) }
}

