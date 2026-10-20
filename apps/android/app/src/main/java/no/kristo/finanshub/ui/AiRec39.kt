package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 39 (ANDROID39) – claude-code-ai-glimt-anbefaler-modeller.md, fasit AI Kontroll.dc.html:
 *  - Modeller: kortet «✦ GLIMT ANBEFALER · <maskin> · <minne>» over «Last ned fra Ollama» (én rad per oppgave med PASSER/TRANGT,
 *    hvorfor + alternativ, I bruk / Bruk / Last ned · x GB / Laster …), «Last ned det som mangler», «Bruk alle anbefalinger» og
 *    «Spør Glimt». I biblioteket: «Brukes til: …» og «✦ Glimt anbefaler til …».
 *  - Valg: «✦ La Glimt velge modeller» med «Fyll ut» (bare admin) og Angre i 5 s.
 * Tåler at serveren mangler /api/ai/recommend (kortet vises ikke).
 */

private fun gb39(v: Double?): String = v?.let { String.format(java.util.Locale("nb", "NO"), "%.1f GB", it) } ?: ""

@Composable
internal fun AcRecommend39(vm: AppViewModel, T: AcT34) {
    LaunchedEffect(Unit) { vm.loadRec39() }
    val s = vm.p39
    val r = s.rec ?: return
    val p34 = vm.p34
    AcHead34(T, r.title)
    AcCard34(T) {
        r.items.forEachIndexed { i, it ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(it.taskName, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
                    Text(it.model, color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    val fc = if (it.fit == "PASSER") T.ok else if (it.fit == "FOR STOR") T.bad else T.warn
                    Text(it.fit, color = fc, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp,
                        modifier = Modifier.clip(CircleShape).background(fc.copy(alpha = .16f)).padding(horizontal = 6.dp, vertical = 1.dp))
                }
                Text(it.why + (it.alt?.let { a -> " Alternativ: $a." } ?: ""), color = T.mut, fontSize = 12.sp, lineHeight = 16.sp)
                val pulling = it.model in p34.aiPulls
                Row {
                    when {
                        it.inUse -> AcPill34(T, "I bruk", enabled = false) {}
                        pulling -> AcPill34(T, "Laster …", enabled = false) {}
                        it.installed -> AcPill34(T, "Bruk", solid = true, enabled = vm.userIsAdmin) { vm.applyRec39(listOf(it.task)) }
                        else -> AcPill34(T, "Last ned" + (it.sizeGb?.let { g -> " · " + gb39(g) } ?: "")) { vm.pullModel34(it.model) }
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (r.missing.isNotEmpty()) AcPill34(T, "Last ned det som mangler · " + gb39(r.missingGb)) { r.missing.forEach { (m, _) -> if (m !in p34.aiPulls) vm.pullModel34(m) } }
            val n = r.items.count { it.installed && !it.inUse }
            if (n > 0 && vm.userIsAdmin) AcPill34(T, "Bruk alle anbefalinger ($n)", solid = true) { vm.applyRec39(null) }
        }
        // Spør Glimt: «Hva vil du bruke AI til?»
        Row(Modifier.fillMaxWidth().height(44.dp).clip(CircleShape).background(T.fld).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (s.recAsk.isEmpty()) Text("Spør Glimt: hva vil du bruke AI til?", color = T.mut, fontSize = 14.sp, maxLines = 1)
                BasicTextField(s.recAsk, { s.recAsk = it }, singleLine = true, textStyle = TextStyle(color = T.ink, fontSize = 14.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(T.ink),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { vm.askRec39() }), modifier = Modifier.fillMaxWidth())
            }
            Text(if (s.recBusy) "…" else "✦", color = T.acc, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.padding(start = 8.dp))
        }
        s.recAnswer?.let { a ->
            Text(a.text, color = T.ink, fontSize = 13.sp, lineHeight = 18.sp)
            val m = a.model
            if (a.label != null && m != null) AcPill34(T, a.label, solid = true) {
                if (a.kind == "use") vm.applyRec39(a.tasks.ifEmpty { null }) else vm.pullModel34(m)
            }
        }
    }
}

/** «Brukes til: …» og «✦ Glimt anbefaler til …» under en modell i biblioteket. */
@Composable
internal fun RecUse39(vm: AppViewModel, T: AcT34, model: String) {
    val r = vm.p39.rec ?: return
    val (used, first) = r.byModel[model] ?: (r.items.filter { it.model == model }.map { it.taskName }.let { l -> emptyList<String>() to l })
    if (used.isNotEmpty()) Text("Brukes til: " + used.joinToString(" · "), color = T.mut, fontSize = 11.5.sp, maxLines = 2)
    if (first.isNotEmpty()) Text("✦ Glimt anbefaler til " + first.joinToString(", ").lowercase(), color = T.acc, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
}

/** Valg: «✦ La Glimt velge modeller» – fyller ut hovedmodellen for hver oppgave med beste installerte. */
@Composable
internal fun AcGlimtFill39(vm: AppViewModel, T: AcT34) {
    LaunchedEffect(Unit) { vm.loadRec39() }
    val s = vm.p39
    val r = s.rec ?: return
    val fill = r.planFill.takeIf { it > 0 } ?: r.items.count { it.installed && !it.inUse }
    val done = r.planDone || fill == 0
    val missing = r.items.count { !it.installed }
    AcCard34(T) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("✦ La Glimt velge modeller", color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                Text(r.planText ?: ("Fyller ut $fill oppgaver med beste installerte modell" + if (missing > 0) " · $missing mangler (se Modeller)" else ""),
                    color = T.mut, fontSize = 12.sp, lineHeight = 16.sp)
            }
            if (s.recUndo != null) AcPill34(T, "Angre") { vm.undoRec39() }
            else if (done) AcPill34(T, "✓ Ferdig", enabled = false) {}
            else AcPill34(T, "Fyll ut", solid = true, enabled = vm.userIsAdmin) { vm.applyRec39(null) }
        }
    }
}
