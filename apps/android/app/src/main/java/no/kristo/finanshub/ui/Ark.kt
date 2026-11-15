package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.Haptics

/** Lett haptikk når noe lukkes (sentral dismiss-hook): kall med «er åpen», tikker på overgangen åpen → lukket. */
@Composable
internal fun DismissHaptic30(open: Boolean) {
    var was by remember { mutableStateOf(open) }
    LaunchedEffect(open) {
        if (was && !open) Haptics.dismiss()
        was = open
    }
}

/**
 * Felles pille øverst i ark og fullskjerm: primary (Ferdig: ink/bg), secondary (Lukk · Avbryt: ink 8 %, mørk 10 %),
 * back (‹ Tilbake). 36 høy, radius 18, 700 14 sp; treffflaten er minst 44 × 44. dark = mørk flate (Vær, Subscription OS):
 * primary blir hvit med mørk tekst.
 */
@Composable
internal fun SheetButton30(label: String, kind: String = "primary", modifier: Modifier = Modifier, dark: Boolean? = null, onClick: () -> Unit) {
    val p = PaperPal.current
    val isDark: Boolean = dark ?: (p.bg.luminance() < .5f)
    val onDarkSurface: Boolean = dark == true
    val bg: Color = when {
        kind == "primary" && onDarkSurface -> Color.White
        kind == "primary" -> p.ink
        onDarkSurface || isDark -> Color.White.copy(alpha = .1f)
        else -> Color(0x141B1A17)
    }
    val fg: Color = when {
        kind == "primary" && onDarkSurface -> Color(0xFF17191E)
        kind == "primary" -> p.bg
        onDarkSurface -> Color.White
        else -> p.ink
    }
    Box(
        modifier.sizeIn(minWidth = 44.dp, minHeight = 44.dp)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClickLabel = label) {
                if (kind == "back") Haptics.select() else Haptics.dismiss()
                onClick()
            }.semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(bg)
                .padding(start = if (kind == "back") 10.dp else 16.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            if (kind == "back") WxIcon(IC_BACK30, fg, 16.dp, stroke = 2.2f)
            Text(label, color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
        }
    }
}
