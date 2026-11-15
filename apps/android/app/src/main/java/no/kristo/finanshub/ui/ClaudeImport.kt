package no.kristo.finanshub.ui

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import no.kristo.finanshub.*
import org.json.JSONObject

/*
 * Prompt 43 (claude-code-chat-claude-import.md, fasit Claude Import.dc.html): fanen «Importer» i AI-kontroll.
 * Steg 1: forklaring, «Velg ZIP eller conversations.json», minnetekst (ett punkt per linje), «Importer bare minnet».
 * Steg 2: forhåndsvisning (tall, periode, samtaler med søk og Alle/Ingen, «Importert før» er ikke valgt, minnepunkter, brytere).
 * Ferdig: «✓ N samtaler og M minnepunkter importert», Åpne Chat, Importer mer, Angre importen.
 * Fila sendes til hjemmeserveren (pakkes ut og leses der); ingenting går til skyen.
 */
@Composable
internal fun ClaudeImport43(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p43
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var memory by remember { mutableStateOf("") }
    var q by remember { mutableStateOf("") }
    var withConvs by remember { mutableStateOf(true) }
    var withMem by remember { mutableStateOf(true) }
    var skipOld by remember { mutableStateOf(true) }
    var shown by remember { mutableIntStateOf(60) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val (name, data) = withContext(Dispatchers.IO) {
                val n = runCatching { ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } }.getOrNull() ?: "export.zip"
                n to runCatching { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
            }
            if (data == null) { s.impErr = "Fikk ikke lest fila"; return@launch }
            val zip = data.size > 4 && data[0] == 'P'.code.toByte() && data[1] == 'K'.code.toByte()
            if (name.endsWith(".zip", true) && !zip) { s.impErr = "Fila er ikke en gyldig ZIP"; return@launch }
            vm.claudePreview43(name, if (zip) "application/zip" else "application/json", data, memory)
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card43 {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFFD97757)), contentAlignment = Alignment.Center) {
                    Text("✳", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                }
                Column(Modifier.weight(1f)) {
                    PSerif("Importer fra Claude", 20.sp, maxLines = 1)
                    Text("Samtaler havner i Chat i mappen «Claude». Minnet brukes av Chat og Glimt.", color = p.mut, fontSize = 12.5.sp)
                }
            }
        }
        s.impErr?.let { Text(it, color = p.lab, fontSize = 13.sp, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(14.dp)) }
        val pre = s.impPreview
        val done = s.impDone
        when {
            done != null -> Card43 {
                PSerif(done, 20.sp)
                Text("Samtalene ligger i mappen «Claude» i Chat. Minnet ligger under Chat → ⚙ → Minne.", color = p.mut, fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ImpBtn43("Åpne Chat", dark = true) { vm.closeAiCtl34(); vm.openChat() }
                    ImpBtn43("Importer mer") { s.impDone = null; s.impLastId = null }
                    if (s.impLastId != null) ImpBtn43("Angre importen") { vm.claudeUndo43() }
                }
            }
            pre != null -> {
                val items = objs34(pre.optJSONArray("items") ?: pre.optJSONArray("conversations"))
                val mem = pre.optJSONArray("memory")
                val nConv = pre.i43("conversations", "conversationCount") ?: items.size
                val range = pre.optJSONObject("range")?.let { r -> r.s43("text") ?: listOfNotNull(r.s43("from", "start"), r.s43("to", "end")).joinToString(" til ").let { "Fra $it" } } ?: pre.s43("range")
                val projects = (pre.optJSONArray("projectNames") ?: pre.optJSONArray("projects"))?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it)?.s43("name") ?: a.optString(it).takeIf { s -> s.isNotBlank() } } }
                val totalItems = pre.i43("total") ?: items.size
                Card43 {
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Stat43("$nConv", "samtaler"); Stat43("${pre.i43("messages", "messageCount") ?: 0}", "meldinger")
                        Stat43("${projects?.size ?: pre.i43("projects") ?: 0}", "prosjekter"); Stat43("${mem?.length() ?: 0}", "minne")
                    }
                    val line = listOfNotNull(range, projects?.takeIf { it.isNotEmpty() }?.let { "prosjekter: " + it.joinToString(", ") }).joinToString(" · ")
                    if (line.isNotBlank()) Text(line, color = p.mut, fontSize = 12.5.sp)
                }
                Toggle43i("Importer samtaler", withConvs) { withConvs = it }
                Toggle43i("Importer minne", withMem) { withMem = it }
                Toggle43i("Hopp over det som er importert før", skipOld) { skipOld = it; if (it) s.impPick = s.impPick - items.filter { x -> x.b43(false, "imported", "importedBefore") }.mapNotNull { x -> x.s43("id", "uuid") }.toSet() }
                if (withConvs) Card43 {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PLabel("Samtaler · ${s.impPick.size} valgt", modifier = Modifier.weight(1f))
                        Text("Alle", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, modifier = Modifier.clip(CircleShape).clickable { s.impPick = items.filter { !skipOld || !it.b43(false, "imported") }.mapNotNull { it.s43("id", "uuid") }.toSet() }.padding(10.dp, 6.dp))
                        Text("Ingen", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, modifier = Modifier.clip(CircleShape).clickable { s.impPick = emptySet() }.padding(10.dp, 6.dp))
                    }
                    Box(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp), contentAlignment = Alignment.CenterStart) {
                        if (q.isEmpty()) Text("Søk i titler …", color = p.mut, fontSize = 14.sp)
                        BasicTextField(q, { q = it }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 14.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab), modifier = Modifier.fillMaxWidth())
                    }
                    val list = items.filter { q.isBlank() || (it.s43("title", "name") ?: "").contains(q, true) }
                    list.take(shown).forEach { c ->
                        val id = c.s43("id", "uuid") ?: return@forEach
                        val before = c.b43(false, "imported", "importedBefore")
                        val on = id in s.impPick
                        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { s.impPick = if (on) s.impPick - id else s.impPick + id }, verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(on, { s.impPick = if (it) s.impPick + id else s.impPick - id }, colors = CheckboxDefaults.colors(checkedColor = p.ink, uncheckedColor = p.mut, checkmarkColor = p.bg))
                            Column(Modifier.weight(1f)) {
                                Text(c.s43("title", "name") ?: "Uten tittel", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(listOfNotNull((c.s43("date", "updated_at", "updatedAt"))?.take(10), c.i43("messages", "messageCount")?.let { "$it meldinger" }, if (before) "Importert før" else null).joinToString(" · "),
                                    color = if (before) p.lab else p.mut, fontSize = 12.sp)
                            }
                        }
                    }
                    if (list.size > shown) ImpBtn43("Vis ${minOf(60, list.size - shown)} til") { shown += 60 }
                    else if (q.isBlank() && items.size < totalItems) ImpBtn43("Vis ${minOf(60, totalItems - items.size)} til") { shown += 60; vm.claudeMore43() }
                }
                if (withMem && mem != null && mem.length() > 0) Card43 {
                    PLabel("Minne · ${s.impMemPick.size} valgt")
                    for (i in 0 until mem.length()) {
                        val t = mem.opt(i).let { if (it is JSONObject) it.s43("text", "t") ?: "" else it.toString() }
                        val on = i in s.impMemPick
                        Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable { s.impMemPick = if (on) s.impMemPick - i else s.impMemPick + i }, verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(on, { s.impMemPick = if (it) s.impMemPick + i else s.impMemPick - i }, colors = CheckboxDefaults.colors(checkedColor = p.ink, uncheckedColor = p.mut, checkmarkColor = p.bg))
                            Text(t, color = p.ink, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        }
                    }
                }
                val nc = if (withConvs) s.impPick.size else 0
                val nm = if (withMem) s.impMemPick.size else 0
                ImpBtn43(if (s.impBusy) "Importerer …" else "Importer $nc samtaler og $nm minnepunkter", dark = true, enabled = !s.impBusy && (nc + nm) > 0, modifier = Modifier.fillMaxWidth()) {
                    vm.claudeCommit43(withConvs, withMem)
                }
                ImpBtn43("Avbryt", modifier = Modifier.fillMaxWidth()) { s.impPreview = null }
            }
            else -> {
                Card43 {
                    PLabel("Slik eksporterer du fra Claude")
                    listOf(
                        "claude.ai → Innstillinger → Personvern → Eksporter data (mobil: profil → Innstillinger → Personvern).",
                        "Du får en e-post med lenke, gyldig i 24 timer. Last ned ZIP-fila.",
                        "Velg den her. Homelab leser conversations.json, projects.json og minnet hvis det ligger med. Alt lagres på hjemmeserveren.",
                        "Minne: Claude → Innstillinger → Minne → Vis og rediger → kopier teksten og lim den inn under hvis den ikke er i ZIP-fila.",
                    ).forEachIndexed { i, t ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.size(24.dp).clip(RoundedCornerShape(7.dp)).background(p.ink), contentAlignment = Alignment.Center) { Text("${i + 1}", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
                            Text(t, color = p.ink, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.weight(1f))
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().heightIn(min = 110.dp).clip(RoundedCornerShape(18.dp)).border(1.5.dp, p.ink.copy(alpha = .35f), RoundedCornerShape(18.dp)).background(p.card)
                    .clickable(enabled = !s.impBusy, role = Role.Button) { pick.launch(arrayOf("application/zip", "application/json", "application/octet-stream", "*/*")) }, contentAlignment = Alignment.Center) {
                    if (s.impBusy) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CircularProgressIndicator(color = p.ink, modifier = Modifier.size(22.dp), strokeWidth = 2.dp); Text("Leser eksporten …", color = p.ink, fontSize = 14.sp)
                    } else Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Velg ZIP eller conversations.json", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                        Text("Maks 200 MB", color = p.mut, fontSize = 12.sp)
                    }
                }
                PLabel("Minne (valgfritt)")
                Box(Modifier.fillMaxWidth().heightIn(min = 96.dp).clip(RoundedCornerShape(14.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(12.dp)) {
                    if (memory.isEmpty()) Text("Ett punkt per linje", color = p.mut, fontSize = 14.sp)
                    BasicTextField(memory, { memory = it }, textStyle = TextStyle(color = p.ink, fontSize = 14.sp, lineHeight = 20.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab), modifier = Modifier.fillMaxWidth())
                }
                ImpBtn43("Importer bare minnet", enabled = memory.isNotBlank() && !s.impBusy, modifier = Modifier.fillMaxWidth()) { vm.claudePreview43("", "", null, memory) }
                ImpBtn43("Prøv med en eksempel-eksport", enabled = !s.impBusy, modifier = Modifier.fillMaxWidth()) { vm.claudeSample43() }
            }
        }
    }
}

@Composable
private fun Card43(content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
}

@Composable
private fun RowScope.Stat43(n: String, label: String) {
    val p = PaperPal.current
    Column(Modifier.weight(1f)) { PSerif(n, 24.sp, maxLines = 1); Text(label, color = p.mut, fontSize = 12.sp, maxLines = 1) }
}

@Composable
private fun Toggle43i(title: String, on: Boolean, onChange: (Boolean) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(14.dp)).background(p.card).clickable { onChange(!on) }.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
        androidx.compose.material3.Switch(on, onChange, colors = androidx.compose.material3.SwitchDefaults.colors(checkedThumbColor = p.bg, checkedTrackColor = p.ink, uncheckedThumbColor = p.mut, uncheckedTrackColor = p.line, uncheckedBorderColor = p.line))
    }
}

@Composable
private fun ImpBtn43(text: String, dark: Boolean = false, enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(modifier.heightIn(min = 44.dp).clip(CircleShape).background(if (dark) p.ink.copy(alpha = if (enabled) 1f else .4f) else Color.Transparent).border(1.dp, if (dark) Color.Transparent else p.line, CircleShape)
        .clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
        Text(text, color = if (dark) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1)
    }
}
