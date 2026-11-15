package no.kristo.finanshub.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/* ======================= «Hvor er …» ======================= */

/** «Vis på kart ›» i svarboblen (åpner Familie med personen valgt). */
@Composable
internal fun WhereOpen37(vm: AppViewModel, person: String) {
    Box(Modifier.height(32.dp).clip(CircleShape).background(Color.White.copy(alpha = .14f)).clickable(role = Role.Button) { Haptics.select(); vm.openWhere37(person) }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) {
        Text("Vis på kart ›", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
    }
}

/* ---------------- AI-søk: fremdrift og Avbryt ---------------- */

/** «✦ Ollama tenker … 34 s av 60 s» med fremdriftslinje og Avbryt, mens AI-søket går som jobb. */
@Composable
internal fun AiJobCard25(vm: AppViewModel, modifier: Modifier = Modifier) {
    val p = PaperPal.current
    val j = vm.p25.job ?: return
    val frac = j.limitS?.let { (j.elapsedS.toFloat() / it).coerceIn(0f, 1f) }
    val shown by animateFloatAsState(frac ?: 0f, tween(900), label = "aiJob")
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp, 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(j.text, color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Box(
                Modifier.height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape)
                    .clickable(role = Role.Button, onClickLabel = "Avbryt AI-søket") { Haptics.select(); vm.cancelAiJob25() }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Avbryt", color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
        }
        Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(p.line)) {
            if (frac != null) Box(Modifier.fillMaxHeight().fillMaxWidth(shown).clip(RoundedCornerShape(2.dp)).background(p.lab))
            else Box(Modifier.fillMaxHeight().fillMaxWidth(.15f).clip(RoundedCornerShape(2.dp)).background(p.lab))
        }
    }
}
