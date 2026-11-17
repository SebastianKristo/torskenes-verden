package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.Instant
import java.time.ZoneId
import no.kristo.finanshub.ui.designsystem.HomelabType
import no.kristo.finanshub.ui.designsystem.HomelabTheme
import no.kristo.finanshub.ui.designsystem.DsPalette
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable

/*
 * Huskeliste (prompt 22, fasit Huskeliste.dc.html + Mobil Papir App.dc.html): fylte chips når valgt, «Alle» uten prikk,
 * «Ny oppgave …» fast nederst ved siden av den runde +-knappen (følger tastaturet), og «SYNK MED HOME ASSISTANT» for admin.
 */

/** Frist og person: 32 dp, valgt = ink-bakgrunn og lys tekst, ellers kortflate med tynn kant. */
@Composable
internal fun TaskChip(text: String, on: Boolean, onClick: () -> Unit) {
    val p = HomelabTheme.colors
    Box(
        Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(if (on) p.textPrimary else p.surfaceRaised).border(1.dp, if (on) p.textPrimary else p.line, RoundedCornerShape(16.dp))
            .selectable(selected = on, role = Role.RadioButton) { Haptics.select(); onClick() }.padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (on) p.surface else p.textPrimary, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.footnote.fontSize, maxLines = 1) }
}

/** Listevelgeren: 38 dp, fargeprikk (ikke på «Alle») og antall åpne. */
@Composable
internal fun TaskListChip(text: String, color: Long?, on: Boolean, count: Int, onHold: (() -> Unit)? = null, onClick: () -> Unit) {
    val p = HomelabTheme.colors
    Row(
        Modifier.height(38.dp).clip(CircleShape).background(if (on) p.textPrimary else p.surfaceRaised).border(1.dp, if (on) p.textPrimary else Color.Transparent, CircleShape)
            // Prompt 43: hold inne → «Rekkefølge på lister» (ui/TasksTabs.kt).
            .then(if (onHold != null) Modifier.pressOrHold43(text, { Haptics.select(); onClick() }, onHold) else Modifier.clickable(role = Role.Button) { Haptics.select(); onClick() }).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (color != null) Box(Modifier.size(9.dp).clip(CircleShape).background(Color(color)))
        Text(text, color = if (on) p.surface else p.textPrimary, fontWeight = FontWeight.Bold, fontSize = HomelabType.subheadline.fontSize, maxLines = 1)
        Text("$count", color = (if (on) p.surface else p.textPrimary).copy(alpha = .6f), fontWeight = FontWeight.Bold, fontSize = HomelabType.subheadline.fontSize)
    }
}

/** Feltet «Ny oppgave …» (60 dp, radius 22) og +-knappen (60 × 60) fast nederst. Flytter seg opp med tastaturet. */
@Composable
internal fun TaskDock(title: String, setTitle: (String) -> Unit, focus: FocusRequester, modifier: Modifier, plus: () -> Unit) {
    val p = HomelabTheme.colors
    Row(
        modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(start = 16.dp, end = 16.dp, bottom = 18.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Box(
            Modifier.weight(1f).height(60.dp).shadow(14.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black.copy(alpha = .4f), spotColor = Color.Black.copy(alpha = .4f))
                .clip(RoundedCornerShape(22.dp)).background(p.surfaceRaised).padding(horizontal = 20.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            BasicTextField(
                title, setTitle, singleLine = true,
                textStyle = TextStyle(color = p.textPrimary, fontSize = HomelabType.body.fontSize, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
                cursorBrush = SolidColor(p.accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { plus() }),
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (title.isEmpty()) Text("Ny oppgave …", color = p.textTertiary, fontSize = HomelabType.body.fontSize, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans); inner() } },
            )
        }
        Box(
            Modifier.size(60.dp).shadow(14.dp, RoundedCornerShape(22.dp)).clip(RoundedCornerShape(22.dp)).background(p.accent).clickable(role = Role.Button, onClickLabel = "Ny oppgave") { Haptics.tap(); plus() },
            contentAlignment = Alignment.Center,
        ) { Text("+", color = p.onAccent, fontSize = HomelabType.title2.fontSize, fontWeight = FontWeight.Light) }
    }
}

private fun haTime(iso: String?): String = iso?.let { runCatching { Instant.parse(it).atZone(ZoneId.systemDefault()).toLocalTime().toString().take(5) }.getOrNull() } ?: ""

/** «SYNK MED HOME ASSISTANT»: bryter, én rad per liste (trykk for å velge todo.*-entitet) og «↻ Synk nå». */
@Composable
internal fun TasksHaSection(vm: AppViewModel, lists: List<TaskList>, pad: androidx.compose.ui.unit.Dp = 16.dp) {
    val p = HomelabTheme.colors
    val ha = vm.tasksHa ?: return
    var pick by remember { mutableStateOf<TaskList?>(null) }
    val st = when {
        !ha.enabled -> "Av"
        ha.status == "error" -> "Feil · prøv igjen"
        ha.status == "ok" && ha.syncedAt != null -> "Synket " + haTime(ha.syncedAt)
        ha.status == "ok" -> "Synket"
        else -> "Kobler til …"
    }
    Column(Modifier.padding(horizontal = pad).padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
            Text("SYNK MED HOME ASSISTANT", color = p.accent, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.caption.fontSize, letterSpacing = 1.26.sp, modifier = Modifier.weight(1f))
            Text(st, color = if (ha.status == "error" && ha.enabled) p.accent else p.textTertiary, fontSize = HomelabType.footnote.fontSize)
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.surfaceRaised).padding(horizontal = 14.dp, vertical = 2.dp)) {
            Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).toggleable(value = ha.enabled, role = Role.Switch) { vm.setTasksHaOn(!ha.enabled) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("Synkroniser lister", color = p.textPrimary, fontWeight = FontWeight.Bold, fontSize = HomelabType.callout.fontSize)
                    Text("To veier · Home Assistant To-do (todo.*)", color = p.textTertiary, fontSize = HomelabType.footnote.fontSize)
                }
                Box(Modifier.size(46.dp, 28.dp).clip(RoundedCornerShape(14.dp)).background(if (ha.enabled) DsPalette.PapirLys.success else p.line)) {
                    Box(Modifier.padding(start = if (ha.enabled) 21.dp else 3.dp, top = 3.dp).size(22.dp).shadow(2.dp, CircleShape).clip(CircleShape).background(Color.White))
                }
            }
            if (ha.enabled) {
                lists.forEach { l ->
                    val e = ha.maps[l.id]
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(role = Role.Button, onClickLabel = "Velg liste i Home Assistant") { pick = l }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(9.dp).clip(CircleShape).background(Color(l.color)))
                        Text(l.name, color = p.textPrimary, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.callout.fontSize, modifier = Modifier.weight(1f), maxLines = 1)
                        Text(e ?: "Ikke koblet", color = if (e != null) p.textPrimary else p.textTertiary, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.footnote.fontSize, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("›", color = p.textTertiary)
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Box(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button) { if (!vm.tasksHaBusy) vm.syncTasksHa() }, contentAlignment = Alignment.Center) {
                    Text(if (vm.tasksHaBusy) "Synker …" else "↻ Synk nå", color = p.accent, fontWeight = FontWeight.Bold, fontSize = HomelabType.callout.fontSize)
                }
            }
        }
        ha.error?.takeIf { ha.enabled && ha.status == "error" }?.let { Text(it, color = p.accent, fontSize = HomelabType.footnote.fontSize, modifier = Modifier.padding(horizontal = 4.dp)) }
        Text("Trykk på en liste for å velge hvilken HA-liste den skal kobles til. Endringer i appen og i Home Assistant (også fra Assist og stemmestyring) synkes begge veier.",
            color = p.textTertiary, fontSize = HomelabType.footnote.fontSize, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
    pick?.let { l -> HaPickSheet(vm, l, ha) { pick = null } }
}

/** Velger for én liste: alle todo.*-entiteter fra HA, «Ikke koblet» og «+ Lag ny liste i HA». */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HaPickSheet(vm: AppViewModel, l: TaskList, ha: TasksHa, close: () -> Unit) {
    val p = HomelabTheme.colors
    val cur = ha.maps[l.id]
    ModalBottomSheet(onDismissRequest = close, containerColor = p.surface, contentColor = p.textPrimary) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Koble «${l.name}»", 24.sp)
            Text("Velg To-do-listen i Home Assistant som skal holdes i synk med denne listen.", color = p.textTertiary, fontSize = HomelabType.subheadline.fontSize)
            PCard {
                if (ha.entities.isEmpty()) Text("Fant ingen todo.*-entiteter i Home Assistant.", color = p.textTertiary, fontSize = HomelabType.subheadline.fontSize, modifier = Modifier.padding(14.dp))
                ha.entities.forEachIndexed { i, e ->
                    PRow(e.name.ifBlank { e.id }, e.id, if (cur == e.id) "✓" else "", p.textPrimary, serif = false, top = i > 0) { vm.mapTasksHa(l.id, e.id); close() }
                }
                PRow("Ikke koblet", null, if (cur == null) "✓" else "", p.textPrimary, serif = false, top = true) { vm.mapTasksHa(l.id, null); close() }
                PRow("+ Lag ny liste i HA", "Lager «${l.name}» i Home Assistant og kobler den", "", p.accent, serif = false, top = true) { vm.createTasksHaList(l.id, l.name); close() }
            }
        }
    }
}
