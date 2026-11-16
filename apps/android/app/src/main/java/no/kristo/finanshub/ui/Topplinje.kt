package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.Haptics

/*
 * Prompt 50 (claude-code-media-topp-som-nyheter.md, claude-code-studie-topp-som-nyheter.md): felles topplinje som i Nyhetsleser.
 * Én rad (min. 44 dp, 10 dp mellomrom): pilleknappen «‹ Tilbake» (36 dp, 1 dp kant, gjennomsiktig, Manrope 600 13), kicker i
 * IBM Plex Mono 600 10,5 med sperring .12em i aksentfargen og tittelen i Newsreader 34 (linjehøyde 1,05) rett under, og runde
 * 40 dp-knapper med kant til høyre (✦ Glimt, ⋯). Brukes av Media og Studie, så toppene er like.
 */

/** Topplinja: «‹ Tilbake», kicker + tittel, og knappene i [actions] til høyre. */
@Composable
internal fun NewsTop50(kicker: String, title: String, modifier: Modifier = Modifier, onBack: () -> Unit, actions: @Composable RowScope.() -> Unit = {}) {
    val p = PaperPal.current
    Row(modifier.fillMaxWidth().heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        BackPill50(onBack)
        Column(Modifier.weight(1f)) {
            Text(
                kicker.uppercase(java.util.Locale("nb", "NO")), color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp,
                letterSpacing = 1.26.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Text(
                title, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 34.sp, lineHeight = 35.7.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        actions()
    }
}

/** «‹ Tilbake»: 36 dp høy pille, padding 0 14 0 10, 1 dp kant, gjennomsiktig (treffflate 44 dp). */
@Composable
internal fun BackPill50(onBack: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.heightIn(min = 44.dp).clickable(role = Role.Button, onClickLabel = "Tilbake") { Haptics.select(); onBack() }, contentAlignment = Alignment.Center) {
        Box(
            Modifier.height(36.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).padding(start = 10.dp, end = 14.dp),
            contentAlignment = Alignment.Center,
        ) { Text("‹ Tilbake", color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1) }
    }
}

/** Rund 40 dp-knapp med kort-bakgrunn og kant (som ⋯ i Nyheter). [on] = aktiv (rød, som Glimt-panelet når det er åpent). */
@Composable
internal fun RoundBtn50(icon: String, label: String, on: Boolean = false, onClick: () -> Unit) {
    val p = PaperPal.current
    val red = Color(0xFFB23A2A)
    Box(Modifier.size(44.dp).clickable(role = Role.Button, onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        Box(
            Modifier.size(40.dp).clip(CircleShape).background(if (on) red else p.card).border(1.dp, if (on) red else p.line, CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text(icon, color = if (on) Color.White else p.ink, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
    }
}
