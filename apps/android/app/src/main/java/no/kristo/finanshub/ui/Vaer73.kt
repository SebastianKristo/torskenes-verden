package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import no.kristo.finanshub.Haptics

/*
 * Prompt 73 (VAER73, fasit Vaer.dc.html):
 *  - claude-code-vaer-fjern-posisjonskort-dagtrykk.md: trykk på en dag i dagslista åpner dagsarket (d.go → sh). Raden er én
 *    trykkflate. Vi lytter i Initial-passet og krever IKKE at ned-trykket er ukonsumert, så verken LazyColumn, hold-inne-rammen
 *    (VaerWrap41) eller andre lag kan «spise» trykket. Flytter fingeren seg mer enn 10 dp (scroll/fling), eller er slippet
 *    allerede konsumert av en scroll, er det ikke et trykk. Haptikk som ellers i Vær (Haptics.select).
 *  - claude-code-vaer-pille-strek-android.md: glansen i modus-pillen ligger inni pillen (klippet til radius = høyde/2),
 *    hvit 0,55 → 0 over de øverste 6 dp, hårfin kant rundt (hvit 25 %), ingen elevation/shadow og ingen egen strek.
 */

/** Trykk på en dag-rad: hele raden, terskel 10 dp, haptikk. Skjermleser får «Åpne <dag>» som klikk-handling. */
internal fun Modifier.wxDayTap73(label: String, onTap: () -> Unit): Modifier = this
    .semantics { role = Role.Button; onClick(label = "Åpne $label") { Haptics.select(); onTap(); true } }
    .pointerInput(Unit) {
        val slop = 10.dp.toPx()
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            var moved = false
            var tapped = false
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Final)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                if ((ch.position - down.position).getDistance() > slop || ev.changes.size > 1) moved = true
                // Hold inne ≥ 0,55 s er «Rediger kort» (VaerWrap41), ikke et trykk på dagen.
                if (!ch.pressed) { tapped = !moved && !ch.isConsumed && ch.uptimeMillis - down.uptimeMillis < 550; break }
            }
            if (tapped) { Haptics.select(); onTap() }
        }
    }

/** Glassdråpen i Forhold-bryteren: gradient 34 → 16 % hvit, glans inni langs toppkanten, hårfin kant. Ingen skygge. */
internal fun Modifier.vaerPillGlass73(): Modifier = this
    .clip(CircleShape)
    .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = .34f), Color.White.copy(alpha = .16f))))
    .drawWithContent {
        drawContent()
        val h = 6.dp.toPx().coerceAtMost(size.height)
        drawRect(Brush.verticalGradient(0f to Color.White.copy(alpha = .55f), 1f to Color.Transparent, startY = 0f, endY = h), Offset.Zero, Size(size.width, h))
    }
    .border(0.5.dp, Color.White.copy(alpha = .25f), CircleShape)
