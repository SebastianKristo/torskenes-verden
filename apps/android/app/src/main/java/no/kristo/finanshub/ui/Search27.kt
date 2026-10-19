package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/*
 * Prompt 27 (ANDROID-B): felles søkefelt (claude-code-tom-sok.md, fasit «Tøm søket» i Mobil Papir App.dc.html).
 *  - Tomt felt: forstørrelsesglass (eller feltets eget ikon, f.eks. Google-G) til venstre.
 *  - Med tekst: ikonet byttes til ✕ på samme plass: 26 dp sirkel rgba(127,127,127,.22), 11 dp kryss.
 *    Trykkflaten utvides av Compose til minst 48 dp (minimumTouchTargetSize) uten å flytte teksten.
 *  - Trykk tømmer verdien og kaller onClear (avbryt ventende søk, lukk forslag og treff). Fokus og tastatur blir stående:
 *    clickable tar ikke fokus i berøringsmodus, og feltet får fokus tilbake hvis det hadde det.
 * SearchLead27 er selve venstre-ikonet, også for Material TextField (leadingIcon = { SearchLead27(...) }).
 */

/** Grå sirkel bak krysset (rgba(127,127,127,.22)). */
internal val CLEAR_BG27 = Color(0x387F7F7F)

/** Forstørrelsesglass (sirkel r 7 + skaft), tegnet som i designet. */
@Composable
internal fun MagGlass27(color: Color, size: Dp = 18.dp) {
    Canvas(Modifier.size(size)) {
        val k = this.size.width / 24f
        drawCircle(color, 7 * k, Offset(11 * k, 11 * k), style = Stroke(2.2f * k))
        drawLine(color, Offset(20 * k, 20 * k), Offset(16.4f * k, 16.4f * k), 2.2f * k, StrokeCap.Round)
    }
}

/** ✕ i 26 dp sirkel. */
@Composable
internal fun ClearX27(ink: Color, bg: Color = CLEAR_BG27, onClear: () -> Unit) {
    Box(
        Modifier.size(26.dp).clip(CircleShape).background(bg)
            .semantics { contentDescription = "Tøm søket" }
            .clickable(role = Role.Button, onClickLabel = "Tøm søket", onClick = onClear),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(11.dp)) {
            val w = 3.2f * this.size.width / 24f
            val a = this.size.width * 6f / 24f
            val b = this.size.width * 18f / 24f
            drawLine(ink, Offset(a, a), Offset(b, b), w, StrokeCap.Round)
            drawLine(ink, Offset(b, a), Offset(a, b), w, StrokeCap.Round)
        }
    }
}

/** Venstre-ikonet: idle (standard forstørrelsesglass) når tomt, ✕ når det står tekst. Fast bredde, så teksten ikke hopper. */
@Composable
internal fun SearchLead27(has: Boolean, ink: Color, mut: Color, bg: Color = CLEAR_BG27, idle: (@Composable () -> Unit)? = null, onClear: () -> Unit) {
    Box(Modifier.size(26.dp), contentAlignment = Alignment.Center) {
        if (has) ClearX27(ink, bg, onClear) else if (idle != null) idle() else MagGlass27(mut)
    }
}

/**
 * Hele søkefeltet: rad med venstre-ikon, BasicTextField og valgfritt innhold til høyre (✦ AI, Søk …).
 * modifier gir høyde, flate og innvendig marg (som feltene hadde før), så hvert sted beholder sitt utseende.
 */
@Composable
internal fun SearchField27(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier,
    ink: Color,
    mut: Color,
    clearBg: Color = CLEAR_BG27,
    fontSize: TextUnit = 15.sp,
    fontWeight: FontWeight = FontWeight.Medium,
    cursor: Color = ink,
    gap: Dp = 10.dp,
    idle: (@Composable () -> Unit)? = null,
    onClear: () -> Unit = {},
    imeAction: ImeAction = ImeAction.Search,
    onSearch: (() -> Unit)? = null,
    focusRequester: FocusRequester? = null,
    onFocus: ((Boolean) -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val fr = focusRequester ?: remember { FocusRequester() }
    var focused by remember { mutableStateOf(false) }
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(gap)) {
        SearchLead27(value.isNotEmpty(), ink, mut, clearBg, idle) {
            val had = focused
            onValueChange("")
            onClear()
            if (had) runCatching { fr.requestFocus() }
        }
        BasicTextField(
            value, onValueChange, singleLine = true,
            textStyle = TextStyle(color = ink, fontSize = fontSize, fontWeight = fontWeight, fontFamily = PaperFonts.sans),
            cursorBrush = SolidColor(cursor),
            keyboardOptions = KeyboardOptions(imeAction = imeAction),
            keyboardActions = KeyboardActions(onSearch = { onSearch?.invoke() }, onDone = { onSearch?.invoke() }, onGo = { onSearch?.invoke() }),
            modifier = Modifier.weight(1f).focusRequester(fr).onFocusChanged { focused = it.isFocused; onFocus?.invoke(it.isFocused) },
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) Text(placeholder, color = mut, fontSize = fontSize, fontWeight = fontWeight, fontFamily = PaperFonts.sans, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    inner()
                }
            },
        )
        trailing?.invoke(this)
    }
}
