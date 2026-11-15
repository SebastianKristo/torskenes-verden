package no.kristo.finanshub.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import no.kristo.finanshub.*

internal const val IC_PLUS28 = "M12 5v14M5 12h14"

internal const val IC_MINUS28 = "M5 12h14"

internal const val IC_CHECK28 = "M5 12.5l4.5 4.5L19 7"

internal const val IC_RESET28 = "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"

internal const val IC_PEN28 = "M4 20h4L19 9l-4-4L4 16v4z"

internal const val IC_X28 = "M6 6l12 12M18 6L6 18"

private const val IC_LOCK28 = "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3"

internal const val IC_GRIP28 = "M4 8h16M4 12h16M4 16h16"

internal const val IC_CHEV28 = "M9 6l6 6-6 6"

private const val IC_BACK28 = "M15 18l-6-6 6-6"

/** Tekst på et linjemerke: mørk på lys linjefarge (relativ luminans > 0,4), ellers hvit. */
internal fun lineInk28(c: Long): Color = if (Color(0xFF000000 or (c and 0xFFFFFF)).luminance() > 0.4f) Color(0xFF1B1A17) else Color.White

internal const val IC_DL30 = "M12 4v11M7 10l5 5 5-5M5 20h14"

internal const val IC_CHECK30 = "M5 12.5l4.5 4.5L19 7"

internal const val IC_X30 = "M6 6l12 12M18 6L6 18"

internal const val IC_BACK30 = "M15 18l-6-6 6-6"

internal const val IC_PLUS30 = "M12 5v14M5 12h14"

internal const val IC_MINUS30 = "M5 12h14"

internal const val IC_LOCK30 = "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3"

/** Animasjonen fra fasiten: cubic-bezier(.2,.8,.2,1). */
internal val EASE30 = CubicBezierEasing(.2f, .8f, .2f, 1f)

/** Fargene på ikonene i Innstillinger, samme som web (Innstillinger Web.dc.html). Null = fargetemaet. */
internal fun setColor30(title: String): Long? = when (title) {
    "Kontoer og brukere", "Konto" -> 0xFF2B5D8A
    "Utseende og fanelinje", "Utseende", "Tilpass" -> 0xFF7A5AD6 // prompt 39: Tilpass
    "Moduler", "Startside" -> 0xFF3F7A6E
    "Domener" -> 0xFFC0562A
    "Varsler og haptikk", "Varsler", "Logg ut" -> 0xFFB23A2A
    "Navn på appen", "App-ikon", "Fanelinje-stil", "Fanelinje i Hjem", "App" -> 0xFF5B6470
    "Integrasjoner" -> 0xFF4A5BBF
    "Kalendere" -> 0xFF2F7D4F
    "AI og tolkning", "AI" -> 0xFF7A3B6B
    "API-tokens", "Brukere" -> 0xFFA8661A
    "Sikkerhet", "Innlogging" -> 0xFF1F6F78
    "Oppdatering", "Server og synk", "System" -> 0xFF6B6558
    "Backup", "Backup og data" -> 0xFF2F6B45
    else -> null
}

/** Lås-merke i samme stil som minus-merket (Innstillinger kan ikke skjules). */
@Composable
internal fun LockDot30(modifier: Modifier = Modifier) {
    val p = PaperPal.current
    Box(
        modifier.offset((-9).dp, (-9).dp).size(28.dp)
            .shadow(5.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).semantics { contentDescription = "Kan ikke skjules" },
        contentAlignment = Alignment.Center,
    ) { WxIcon(IC_LOCK30, p.mut, 12.dp, stroke = 2.4f) }
}

/** ＋-merke på skjulte kort (trykk = vis igjen). */
@Composable
internal fun PlusDot30(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        modifier.offset((-9).dp, (-9).dp).size(28.dp)
            .shadow(5.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
            .clickable(role = Role.Button, onClickLabel = label) { onClick() }.semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { WxIcon(IC_PLUS30, p.ink, 12.dp, stroke = 3.2f) }
}
