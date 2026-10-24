package no.kristo.finanshub.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 27 (ANDROID-A): arkene i Chat (Mobil Papir App.dc.html → chat: model, params, menu, guard, plus, kb, mods) og
 * gruppen CHAT i Innstillinger → AI og tolkning.
 */

@Composable
internal fun Ch27Sheets(vm: AppViewModel, v: ChatV27, wide: Boolean) {
    val s = vm.chat27
    // Velgerne må registreres hver gang (også når arket er lukket).
    val pickImg = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(6)) { l -> if (l.isNotEmpty()) vm.addChatImages27(l) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { b -> b?.let { vm.addChatPhoto27(it) } }
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { l -> if (l.isNotEmpty()) vm.addChatFiles27(l) }
    val upKb = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { l -> if (l.isNotEmpty()) vm.uploadKb27(l) }
    val close: () -> Unit = { s.sheet = null; s.delArm = false; s.modDel = null }
    when (s.sheet) {
        "model" -> Ch27Sheet(v, wide, close) { Ch27ModelSheet(vm, v) }
        "params" -> Ch27Sheet(v, wide, close) { Ch27ParamsSheet(vm, v) }
        "menu" -> {
            val row = (s.pinned + s.folders.flatMap { it.chats } + s.chats + (s.found ?: emptyList())).firstOrNull { it.id == s.menuId }
            if (row == null) LaunchedEffect(Unit) { s.sheet = null } else Ch27Sheet(v, wide, close) { Ch27MenuSheet(vm, v, row) }
        }
        "guard" -> s.guard?.let { g -> Ch27Sheet(v, wide, close) { Ch27GuardSheet(vm, v, g) } }
        // Prompt 28: nytt «Legg ved»-ark (ui/Ui28B.kt): grep-strek, tre fliser og kunnskapsbase-rad, høyde etter innhold.
        "plus" -> Ch27Sheet(v, wide, close, top = 8.dp, gap = 14.dp) {
            ChatAttach28(
                vm, v, close,
                camera = { camera.launch(null) },
                images = { pickImg.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                files = { pickFile.launch(arrayOf("*/*")) },
                kb = { vm.loadKb27(); s.sheet = "kb" },
            )
        }
        "kb" -> Ch27Sheet(v, wide, close) {
            LaunchedEffect(Unit) { if (s.kb == null) vm.loadKb27() }
            val kb = s.kb
            Ch27Head(v, "Kunnskapsbase", "Velg dokumenter chatten skal lese · ${s.att.count { it.kind == "doc" }} valgt", close)
            if (kb == null) Text("Henter …", color = v.mut, fontFamily = v.sans, fontSize = 14.sp)
            else if (kb.isEmpty()) Text("Ingen dokumenter ennå.", color = v.mut, fontFamily = v.sans, fontSize = 14.sp)
            else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(v.line), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                kb.forEach { d ->
                    val on = s.att.any { it.kind == "doc" && it.id == d.id }
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).background(v.card).press24 { vm.toggleKbDoc27(d) }.padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(22.dp).clip(RoundedCornerShape(6.dp)).border(1.5.dp, if (on) v.ink else v.line, RoundedCornerShape(6.dp)).background(if (on) v.ink else Color.Transparent),
                            contentAlignment = Alignment.Center) { if (on) Text("✓", color = v.bg, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                        Column(Modifier.weight(1f)) {
                            Text(d.name, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (d.sub.isNotBlank()) Text(d.sub, color = v.mut, fontFamily = v.sans, fontSize = 12.sp, maxLines = 1)
                        }
                    }
                }
            }
            Ch27Btn(v, "+ Last opp til kunnskapsbasen", false) { upKb.launch(arrayOf("*/*")) }
            Ch27Btn(v, "Ferdig", true, onClick = close)
        }
        "mods" -> Ch27Sheet(v, wide, close) { Ch27ModsSheet(vm, v) }
    }
}

/* ---------------- Felles ---------------- */

@Composable
private fun Ch27Sheet(v: ChatV27, wide: Boolean, onClose: () -> Unit, top: Dp = 18.dp, gap: Dp = 12.dp, content: @Composable ColumnScope.() -> Unit) {
    val shape = if (wide) RoundedCornerShape(24.dp) else RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp)
    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = .42f)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
        contentAlignment = if (wide) Alignment.Center else Alignment.BottomCenter,
    ) {
        Column(
            Modifier.then(if (wide) Modifier.widthIn(max = 460.dp).fillMaxWidth() else Modifier.fillMaxWidth()).fillMaxHeight(.9f)
                .wrapContentHeight(if (wide) Alignment.CenterVertically else Alignment.Bottom).imePadding().clip(shape).background(v.bg)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .verticalScroll(rememberScrollState()).navigationBarsPadding().padding(start = 16.dp, top = top, end = 16.dp, bottom = 22.dp),
            verticalArrangement = Arrangement.spacedBy(gap),
        ) { content() }
    }
}

@Composable
private fun Ch27Head(v: ChatV27, title: String, sub: String?, onClose: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            Text(title, color = v.ink, fontFamily = v.head, fontWeight = FontWeight.Medium, fontSize = 23.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            sub?.let { Text(it, color = v.mut, fontFamily = v.sans, fontSize = 12.5.sp) }
        }
        Box(Modifier.size(40.dp).clip(CircleShape).background(v.card).press24(onClick = onClose).ch27Label("Lukk"), contentAlignment = Alignment.Center) {
            Text("✕", color = v.ink, fontSize = 14.sp)
        }
    }
}

@Composable
private fun Ch27Label(v: ChatV27, t: String) = Ch27Mono(t, v.mut, modifier = Modifier.padding(start = 4.dp, top = 6.dp, end = 4.dp))

@Composable
private fun Ch27Btn(v: ChatV27, text: String, solid: Boolean, modifier: Modifier = Modifier, red: Boolean = false, height: Dp = 48.dp, onClick: () -> Unit) {
    val bg = when { red -> CH27_SKY; solid -> v.ink; else -> Color.Transparent }
    val fg = when { red -> Color.White; solid -> v.bg; else -> v.ink }
    Box(modifier.fillMaxWidth().height(height).clip(CircleShape).then(if (!solid && !red) Modifier.border(1.dp, v.line, CircleShape) else Modifier).background(bg).press24(onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) {
        Text(text, color = fg, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
    }
}

@Composable
private fun Ch27Pill(v: ChatV27, text: String, on: Boolean, onClick: () -> Unit) {
    Box(Modifier.height(36.dp).clip(CircleShape).background(if (on) v.ink else v.card).press24(onClick = onClick).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
        Text(text, color = if (on) v.bg else v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1)
    }
}

@Composable
private fun Ch27Input(v: ChatV27, value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, lines: Int = 1, onDone: (() -> Unit)? = null) {
    Box(modifier.heightIn(min = 46.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, v.line, RoundedCornerShape(16.dp)).background(v.card).padding(horizontal = 14.dp, vertical = 11.dp),
        contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Text(placeholder, color = v.mut, fontFamily = v.sans, fontSize = 14.5.sp)
        BasicTextField(value, onChange, singleLine = lines == 1, minLines = lines, textStyle = TextStyle(color = v.ink, fontSize = 14.5.sp, lineHeight = 20.sp, fontFamily = v.sans),
            cursorBrush = SolidColor(v.ink), keyboardOptions = KeyboardOptions(imeAction = if (lines == 1) ImeAction.Done else ImeAction.Default),
            keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }), modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun Ch27PlusRow(v: ChatV27, ic: String, t: String, sub: String, end: String = "", onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).background(v.card).press24(onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(v.bg), contentAlignment = Alignment.Center) { Text(ic, color = v.ink, fontSize = 16.sp) }
        Column(Modifier.weight(1f)) {
            Text(t, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text(sub, color = v.mut, fontFamily = v.sans, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (end.isNotEmpty()) Text(end, color = v.mut, fontSize = 18.sp)
    }
}

/* ---------------- Velg modell ---------------- */

@Composable
private fun Ch27ModelSheet(vm: AppViewModel, v: ChatV27) {
    val s = vm.chat27
    val cur = s.curModel27()?.id
    Ch27Head(v, "Velg modell", null) { s.sheet = null }
    @Composable
    fun rows(l: List<ChatModel27>) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(v.line), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            l.forEach { m ->
                Row(Modifier.fillMaxWidth().heightIn(min = 58.dp).background(v.card).press24 { vm.selectChatModel27(m.id) }.padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(m.label, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            Ch27Badge(m.sky)
                            if (m.vision) ChatVisionBadge50(v) // prompt 50: «Ser bilder»
                        }
                        val sub = if (m.sky) listOfNotNull(m.provider.replaceFirstChar { it.uppercase() } + " · sky", m.desc).joinToString(" · ")
                        else listOfNotNull(m.name.takeIf { it != m.id }, m.size, m.desc ?: if (m.vision) "Tekst og bilde" else null).joinToString(" · ")
                        if (sub.isNotBlank()) Text(sub, color = v.mut, fontFamily = v.sans, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    Text(if (m.id == cur) "✓" else "", color = v.ink, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.width(22.dp))
                }
            }
        }
    }
    val loc = s.models.filter { !it.sky && it.installed }
    val sky = s.models.filter { it.sky }
    if (s.models.isEmpty()) Text(if (s.unavailable) "Serveren har ikke Chat ennå. Oppdater Homelab-serveren." else s.error ?: "Henter modeller …", color = v.mut, fontFamily = v.sans, fontSize = 14.sp)
    if (loc.isNotEmpty()) { Ch27Label(v, "LOKALT · OLLAMA PÅ HJEMMESERVEREN"); rows(loc) }
    if (sky.isNotEmpty()) { Ch27Label(v, "SKY"); rows(sky) }
    Text("Sky-modeller merkes SKY. Før dine data eller vedlegg sendes dit, får du spørsmål om det.", color = v.mut, fontFamily = v.sans, fontSize = 12.5.sp, lineHeight = 18.sp,
        modifier = Modifier.padding(horizontal = 4.dp))
    Ch27Btn(v, "Administrer modeller ›", false) { s.sheet = null; vm.openAiCtl34("mod") } // prompt 34: AI-kontroll → Modeller
}

/* ---------------- Samtaleinnstillinger (⚙) ---------------- */

private fun ch27Num(d: Double): String = (Math.round(d * 100) / 100.0).toString().removeSuffix(".0").replace('.', ',')

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Ch27ParamsSheet(vm: AppViewModel, v: ChatV27) {
    val s = vm.chat27
    val p = s.settings
    val sliderC = SliderDefaults.colors(thumbColor = v.ink, activeTrackColor = v.ink, inactiveTrackColor = v.line, activeTickColor = Color.Transparent, inactiveTickColor = Color.Transparent)
    Ch27Head(v, "Samtaleinnstillinger", if (s.curId != null) "Gjelder denne samtalen" else "Gjelder nye samtaler") { s.sheet = null }
    Ch27Label(v, "PERSONA")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        CHAT27_PERSONAS.forEach { (k, n, _) -> Ch27Pill(v, n, p.persona == k) { vm.setChatSettings27(s.settings.copy(persona = k)) } }
    }
    Ch27Label(v, "SYSTEMPROMPT")
    Ch27Input(v, p.system, { vm.setChatSettings27(s.settings.copy(system = it)) }, "F.eks. «Svar alltid med maks tre setninger.»", Modifier.fillMaxWidth(), lines = 3)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(v.card).padding(horizontal = 14.dp, vertical = 10.dp)) {
        Row { Text("Temperatur", color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f)); Text(ch27Num(p.temperature), color = v.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp) }
        Slider(p.temperature.toFloat(), { vm.setChatSettings27(s.settings.copy(temperature = Math.round(it * 10) / 10.0)) }, valueRange = 0f..2f, steps = 19, colors = sliderC)
        Text("Lav gir faste svar, høy gir mer variasjon.", color = v.mut, fontFamily = v.sans, fontSize = 12.sp)
        Box(Modifier.padding(vertical = 10.dp).fillMaxWidth().height(1.dp).background(v.line))
        Row { Text("Top P", color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f)); Text(ch27Num(p.topP), color = v.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp) }
        Slider(p.topP.toFloat(), { vm.setChatSettings27(s.settings.copy(topP = Math.round(it * 20) / 20.0)) }, valueRange = .1f..1f, steps = 17, colors = sliderC)
    }
    Ch27Label(v, "KONTEKSTLENGDE")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        CHAT27_CTX.forEach { n -> Ch27Pill(v, "${n / 1024}k", p.numCtx == n) { vm.setChatSettings27(s.settings.copy(numCtx = n)) } }
    }
    Ch27Label(v, "TEMA")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("papir" to "Papir", "noytral" to "Nøytral").forEach { (k, n) -> Ch27Pill(v, n, s.theme == k) { vm.setChatTheme27(k) } }
    }
    // Prompt 34: «Full AI-kontroll ›» nederst åpner AI-kontroll på fanen Valg.
    Ch27Btn(v, "Full AI-kontroll ›", false) { s.sheet = null; vm.openAiCtl34("rt") }
    Ch27Btn(v, "Ferdig", true) { s.sheet = null }
}

/* ---------------- ⋯ på en samtale ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Ch27MenuSheet(vm: AppViewModel, v: ChatV27, r: ChatRow27) {
    val s = vm.chat27
    Ch27Head(v, r.title, null) { s.sheet = null }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Ch27Input(v, s.rn, { s.rn = it }, "Navn på samtalen", Modifier.weight(1f)) { vm.renameChat27(r.id, s.rn) }
        Box(Modifier.height(46.dp).clip(CircleShape).background(v.ink).press24 { vm.renameChat27(r.id, s.rn) }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
            Text("Gi nytt navn", color = v.bg, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1)
        }
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(v.line), verticalArrangement = Arrangement.spacedBy(1.dp)) {
        listOf(
            (if (r.pinned) "Løsne" else "Fest øverst") to { vm.pinChat27(r.id, !r.pinned) },
            "Eksporter som Markdown" to { vm.exportChat27(r.id, r.title) },
            "Del lenke" to { vm.shareChat27(r.id, r.title) },
        ).forEach { (t, go) ->
            Box(Modifier.fillMaxWidth().heightIn(min = 50.dp).background(v.card).press24(onClick = go).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
                Text(t, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
            }
        }
    }
    Ch27Label(v, "FLYTT TIL MAPPE")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Ch27Pill(v, "Ingen mappe", r.folderId.isNullOrBlank()) { vm.moveChat27(r.id, null) }
        s.folders.forEach { f -> Ch27Pill(v, f.name, r.folderId == f.id) { vm.moveChat27(r.id, f.id) } }
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Ch27Input(v, s.nf, { s.nf = it }, "Ny mappe", Modifier.weight(1f)) { vm.newFolderMove27(r.id, s.nf) }
        Box(Modifier.height(46.dp).clip(CircleShape).border(1.dp, v.line, CircleShape).press24 { vm.newFolderMove27(r.id, s.nf) }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
            Text("+ Lag og flytt", color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1)
        }
    }
    Ch27Btn(v, if (s.delArm) "Trykk igjen for å slette" else "Slett samtalen", false, red = s.delArm) { vm.deleteChat27(r.id) }
}

/* ---------------- Sende til sky? ---------------- */

@Composable
private fun Ch27GuardSheet(vm: AppViewModel, v: ChatV27, g: ChatGuard27) {
    val s = vm.chat27
    Ch27Head(v, "Sende til ${g.model}?", null) { s.sheet = null; s.guard = null }
    Text("Dette er en sky-modell. Dette forlater hjemmeserveren hvis du sender:", color = v.ink, fontFamily = v.sans, fontSize = 14.5.sp, lineHeight = 21.sp)
    val items = g.leaves.ifEmpty { listOfNotNull("Meldingen din", if (g.hasData) "Data fra Finans, Kalender og Gjøremål" else null) + s.att.map { "Vedlegg: " + it.name } }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(v.line), verticalArrangement = Arrangement.spacedBy(1.dp)) {
        items.forEach { n ->
            Row(Modifier.fillMaxWidth().heightIn(min = 46.dp).background(v.card).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("↗", color = CH27_SKY, fontSize = 14.5.sp)
                Text(n, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
            }
        }
    }
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).press24 { s.skipAsk = !s.skipAsk }.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(if (s.skipAsk) "☑" else "☐", color = v.ink, fontSize = 19.sp)
        Text("Ikke spør igjen i denne samtalen", color = v.ink, fontFamily = v.sans, fontSize = 14.sp)
    }
    Ch27Btn(v, "Send", true) { vm.guardChat27("send") }
    if (g.hasData) Ch27Btn(v, "Send uten mine data", false) { vm.guardChat27("nodata") }
    s.firstLocal27()?.let { l -> Ch27Btn(v, "Bruk lokal modell (${l.id})", false) { vm.guardChat27("local") } }
}

/* ---------------- Modeller ---------------- */

@Composable
private fun Ch27Progress(v: ChatV27, pct: Float) {
    Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(v.line)) {
        Box(Modifier.fillMaxHeight().fillMaxWidth((pct / 100f).coerceIn(0f, 1f)).background(CH27_LOCAL))
    }
}

@Composable
private fun Ch27ModsSheet(vm: AppViewModel, v: ChatV27) {
    val s = vm.chat27
    val inst = s.models.filter { !it.sky && it.installed }
    Ch27Head(v, "Modeller", "Ollama på hjemmeserveren · " + if (s.unavailable) "ikke satt opp" else if (s.models.isEmpty()) "henter …" else "tilkoblet") { s.sheet = null }
    Ch27Label(v, "INSTALLERT")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(v.line), verticalArrangement = Arrangement.spacedBy(1.dp)) {
        if (inst.isEmpty()) Box(Modifier.fillMaxWidth().background(v.card).padding(14.dp)) { Text("Ingen lokale modeller.", color = v.mut, fontFamily = v.sans, fontSize = 14.sp) }
        inst.forEach { m ->
            val arm = s.modDel == m.id
            Row(Modifier.fillMaxWidth().heightIn(min = 58.dp).background(v.card).padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(m.id, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(listOfNotNull(m.name.takeIf { it != m.id }, m.size).joinToString(" · ").ifBlank { "Lokal" }, color = v.mut, fontFamily = v.sans, fontSize = 12.5.sp, maxLines = 1)
                }
                Box(Modifier.height(36.dp).clip(CircleShape).then(if (arm) Modifier else Modifier.border(1.dp, v.line, CircleShape)).background(if (arm) CH27_SKY else Color.Transparent)
                    .press24 { vm.deleteChatModel27(m.id) }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                    Text(if (arm) "Bekreft" else "Slett", color = if (arm) Color.White else v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
        }
        s.pulls.filterKeys { k -> CHAT27_LIB.none { it.first == k } && s.models.none { it.id == k && !it.installed } }.forEach { (k, pct) ->
            Column(Modifier.fillMaxWidth().background(v.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row { Text(k, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f)); Text("${Math.round(pct)} %", color = v.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp) }
                Ch27Progress(v, pct)
            }
        }
    }
    // Katalogen fra serveren (installed:false), ellers designets liste.
    val srvLib = s.models.filter { !it.sky && !it.installed }.map { Triple(it.id, it.name, it.size ?: "") }
    val lib = srvLib.ifEmpty { CHAT27_LIB }.filter { l -> inst.none { it.id == l.first } }
    if (lib.isNotEmpty()) {
        Ch27Label(v, "HENT FRA OLLAMA.COM")
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(v.line), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            lib.forEach { (k, n, sz) ->
                val pct = s.pulls[k]
                Column(Modifier.fillMaxWidth().background(v.card).padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(k, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Text(listOf(n, sz).filter { it.isNotBlank() }.joinToString(" · "), color = v.mut, fontFamily = v.sans, fontSize = 12.5.sp)
                        }
                        if (pct == null) Box(Modifier.height(36.dp).clip(CircleShape).background(v.ink).press24 { vm.pullChatModel27(k) }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                            Text("Last ned", color = v.bg, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        } else Text("${Math.round(pct)} %", color = v.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp)
                    }
                    if (pct != null) Ch27Progress(v, pct)
                }
            }
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Ch27Input(v, s.pullName, { s.pullName = it }, "Modellnavn, f.eks. llama3.2:1b", Modifier.weight(1f)) { vm.pullChatModel27(s.pullName); s.pullName = "" }
        Box(Modifier.height(46.dp).clip(CircleShape).background(v.ink).press24 { vm.pullChatModel27(s.pullName); s.pullName = "" }.padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
            Text("Hent", color = v.bg, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
        }
    }
}

/* ---------------- Innstillinger → AI og tolkning → CHAT ---------------- */

@Composable
internal fun ChatSettings27(vm: AppViewModel) {
    val s = vm.chat27
    LaunchedEffect(vm.account?.id) {
        vm.loadChatCfg27()
        if (s.models.isEmpty()) vm.loadChatModels27()
    }
    var pick by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Chat", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PToggle("Chat kan lese mine data", "Finans, Kalender og Gjøremål når «Mine data» er på", s.myDataOn) { vm.setChatMyData27(it) }
            PToggle("Spør før sky-modeller får data", "Gemini og Groq må godkjennes per samtale", s.askCloud, top = true) { vm.setChatAskCloud27(it) }
            SetRow(vm, 1, Icons.Filled.Memory, "Standardmodell", "For nye samtaler", s.defModel?.let { s.modelLabel27(it) } ?: "Velg", top = true) { pick = !pick }
            if (pick) s.models.filter { it.sky || it.installed }.forEach { m ->
                Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).press24 { vm.selectChatModel27(m.id); pick = false }.padding(start = 56.dp, end = 16.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(m.label, color = PaperPal.current.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f, fill = false))
                    Ch27Badge(m.sky)
                    Spacer(Modifier.weight(1f))
                    if (m.id == s.defModel) Text("✓", color = PaperPal.current.ink, fontWeight = FontWeight.Bold)
                }
            }
            SetRow(vm, 2, Icons.Filled.AutoAwesome, "Åpne chat", "Historikk, modeller og kunnskapsbase", top = true) { vm.openChat() }
        }
    }
}
