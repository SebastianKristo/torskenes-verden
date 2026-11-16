package no.kristo.finanshub.ui

import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.ChoiceItem67
import no.kristo.finanshub.Choices67
import no.kristo.finanshub.Glimt67
import no.kristo.finanshub.vote67

/*
 * Prompt 67 (ANDCHAT67): felles biter for Glimt i Chat og Glimt-søket på Hjem (Stream67.kt):
 * statuslinja mens Glimt jobber («Sjekker kalenderen …»), valgknappene («Mener du A eller B?») og tommel opp/ned.
 * Fargene sendes inn, så de passer både den mørke boblen på Hjem og Chat (Papir/Nøytral).
 */

private const val UP67 = "M7 10v11H3V10h4zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7"
private const val DOWN67 = "M17 14V3h4v11h-4zM17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 3H17"

/** Statuslinja: pulserende prikk + siste status fra serveren. */
@Composable
internal fun GlimtStatus67(text: String, color: Color, font: FontFamily, modifier: Modifier = Modifier) {
    val tr = rememberInfiniteTransition(label = "st67")
    val a by tr.animateFloat(.25f, 1f, infiniteRepeatable(tween(550), RepeatMode.Reverse), label = "st67a")
    Row(modifier.heightIn(min = 24.dp).semantics { contentDescription = text }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(7.dp).graphicsLayer { alpha = a; clip = true }.clip(CircleShape).background(color)) // prompt 71: pulsen i laget
        Text(text, color = color, fontFamily = font, fontWeight = FontWeight.Medium, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Valgknappene (maks 5). fg/bg = tekst og flate på knappen, line = kant. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Choices67Row(ch: Choices67, fg: Color, bg: Color, line: Color, font: FontFamily, enabled: Boolean = true, onPick: (ChoiceItem67) -> Unit) {
    FlowRow(Modifier.semantics { contentDescription = "Velg" }, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ch.items.forEach { x ->
            Box(
                Modifier.heightIn(min = 38.dp).widthIn(max = 320.dp).clip(RoundedCornerShape(19.dp)).background(bg).border(1.dp, line, RoundedCornerShape(19.dp))
                    .press24(enabled) { onPick(x) }.semantics { role = Role.Button }.padding(horizontal = 14.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) { Text(x.label, color = fg, fontFamily = font, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
    }
}

/** Tommel opp/ned for et Glimt-svar med traceId (POST /api/glimt/recipes/feedback). Trykk på samme igjen angrer. */
@Composable
internal fun Thumbs67(vm: AppViewModel, traceId: String, fg: Color, on: Color, onBg: Color, font: FontFamily) {
    val v = Glimt67.votes[traceId]
    val msg = Glimt67.voteMsg[traceId].orEmpty()
    Row(Modifier.semantics { contentDescription = "Var svaret riktig?" }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        listOf(Triple("up", UP67, "Riktig svar – Glimt lærer av det"), Triple("down", DOWN67, "Feil svar")).forEach { (k, path, label) ->
            val sel = v == k
            Box(
                Modifier.size(34.dp).clip(CircleShape).background(if (sel) onBg else Color.Transparent).press24 { vm.vote67(traceId, k) }
                    .semantics { contentDescription = label; role = Role.Button; stateDescription = if (sel) "Valgt" else "Ikke valgt" },
                contentAlignment = Alignment.Center,
            ) { WxIcon(path, if (sel) on else fg, 15.dp, stroke = 2f) }
        }
        if (msg.isNotBlank()) Text(msg, color = fg, fontFamily = font, fontWeight = FontWeight.Medium, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 4.dp))
    }
}

/** «Ja, gjør det» / «Avbryt» (Chat) – samme tekster som web. */
@Composable
internal fun Confirm67Row(fg: Color, bg: Color, line: Color, font: FontFamily, onYes: () -> Unit, onNo: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.heightIn(min = 38.dp).clip(CircleShape).background(fg).press24(onClick = onYes).semantics { role = Role.Button }
            .padding(horizontal = 16.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
            Text("Ja, gjør det", color = bg, fontFamily = font, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(Modifier.heightIn(min = 38.dp).clip(CircleShape).border(1.dp, line, CircleShape).press24(onClick = onNo).semantics { role = Role.Button }
            .padding(horizontal = 16.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
            Text("Avbryt", color = fg, fontFamily = font, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        }
    }
}
