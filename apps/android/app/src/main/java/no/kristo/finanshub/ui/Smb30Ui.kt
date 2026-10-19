package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import no.kristo.finanshub.*

/*
 * Prompt 30 (ANDROID30): arket «Sett opp nettverksdisk» i fullskjerm (Papir-stil, rette kanter, store trykkflater).
 * Åpnes fra Innstillinger → Backup → Hvor (Backup29Ui.kt). Logikken ligger i Smb30.kt.
 */

/** Radene under HVOR i Backup-siden. */
@Composable
internal fun Smb30Rows(vm: AppViewModel, st: Bk29Settings) {
    val p = PaperPal.current
    if (st.smbShare.isBlank()) {
        PRow("SMB / nettverksdisk", "Kopier hver backup til en NAS på hjemmenettet", "Sett opp ›", valueColor = p.lab, serif = false, top = true) { vm.openSmb30(finans = false, system = true) }
        return
    }
    val sub = listOf(st.smbLabel, st.smbStatus.ifBlank { if (st.smbOn) "kopieres etter hver backup" else "" }).filter { it.isNotBlank() }.joinToString(" · ")
    PToggle("Kopi til nettverksdisk", sub, st.smbOn, top = true) { vm.setBkSmb30(it) }
    PRow("Sett opp nettverksdisk", "Bytt server, bruker eller mappe", "Veiviser ›", valueColor = p.lab, serif = false, top = true) { vm.openSmb30(finans = false, system = true) }
    if (st.smbOn && !st.encrypt) Text("Kopieres ukryptert. Greit på eget hjemmenett, men «Krypter backup» anbefales.", color = p.mut, fontSize = 12.5.sp,
        modifier = Modifier.padding(start = 14.dp, end = 14.dp, bottom = 10.dp))
}

@Composable
internal fun Smb30Dialog(vm: AppViewModel) {
    val p = PaperPal.current
    Dialog(onDismissRequest = { vm.smbBack30() }, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false)) {
        Column(Modifier.fillMaxSize().background(p.bg).systemBarsPadding().imePadding()) {
            Smb30Head(vm)
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Smb30Body(vm)
                vm.smb30.error?.let { Smb30ErrBox(it) }
            }
            Smb30Foot(vm)
        }
    }
}

@Composable
private fun Smb30Head(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.smb30
    val done = s.doneLabel.isNotBlank()
    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 6.dp, top = 14.dp, bottom = 10.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(if (done) "NETTVERKSDISK · FERDIG" else "NETTVERKSDISK · STEG ${s.step + 1} AV 5", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
                PSerif(if (done) "Klar" else SMB30_STEPS[s.step], 28.sp, modifier = Modifier.padding(top = 4.dp))
            }
            Box(Modifier.size(48.dp).press24 { vm.closeSmb30() }.semantics { contentDescription = "Lukk" }, contentAlignment = Alignment.Center) {
                Text("✕", color = p.ink, fontSize = 18.sp)
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 10.dp, end = 10.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (i in 0 until 5) {
                val c = if (done || i < s.step) p.mut else if (i == s.step) p.ink else p.line
                Box(Modifier.weight(1f).height(3.dp).background(c))
            }
        }
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
}

@Composable
private fun Smb30Body(vm: AppViewModel) {
    val s = vm.smb30
    when {
        s.doneLabel.isNotBlank() -> Smb30DoneView(s.doneLabel)
        s.step == 0 -> Smb30FindView(vm)
        s.step == 1 -> Smb30LoginView(vm)
        s.step == 2 -> Smb30SharesView(vm)
        s.step == 3 -> Smb30FoldersView(vm)
        else -> Smb30SaveView(vm)
    }
}

/* ---------- Steg ---------- */

@Composable
private fun Smb30FindView(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.smb30
    Text("Homelab leter etter NAS-er og PC-er med fildeling (SMB) på hjemmenettet.", color = p.mut, fontSize = 14.5.sp)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("FUNNET PÅ NETTVERKET", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, letterSpacing = 1.2.sp, modifier = Modifier.weight(1f))
        Smb30Mini(if (s.scanning) "Søker …" else "↻ Søk igjen", !s.scanning) { vm.smbScan30() }
    }
    Smb30ListBox {
        when {
            s.scanning && s.servers.isEmpty() -> Smb30WaitRow("Leter etter servere … (opptil 6 sekunder)")
            s.servers.isEmpty() -> Smb30EmptyRow("Fant ingen servere automatisk. Skriv inn adressen under.")
            else -> s.servers.forEach { srv -> Smb30Row(srv.title, srv.sub) { vm.smbPick30(srv) } }
        }
    }
    Smb30Input("Eller skriv IP-adresse eller navn", "192.168.1.20 eller nas.local", s.manual, KeyboardType.Uri) { s.manual = it }
    Smb30Btn(if (s.busy) "Sjekker …" else "Neste", !s.busy, primary = true) { vm.smbManual30(false) }
    if (s.probeFail.isNotBlank()) Text("Prøv å logge inn på ${s.probeFail} likevel", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
        textDecoration = TextDecoration.Underline, modifier = Modifier.heightIn(min = 40.dp).press24 { vm.smbManual30(true) }.padding(vertical = 10.dp))
}

@Composable
private fun Smb30LoginView(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.smb30
    Smb30Who(s.server.title, s.server.sub.ifBlank { "SMB-server" }, mono = false)
    Smb30Input("Brukernavn", "Brukeren på NAS-en", s.user) { s.user = it }
    Smb30Input("Passord", "Passordet på NAS-en", s.password, KeyboardType.Password, secret = true) { s.password = it }
    Smb30Input("Domene (valgfritt)", "WORKGROUP", s.domain) { s.domain = it }
    Text("Passordet brukes bare mens du setter opp, og lagres kryptert på serveren når du trykker Lagre.", color = p.mut, fontSize = 12.5.sp)
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.weight(1f)) { Smb30Btn("Gjest", !s.busy, primary = false) { vm.smbLogin30(true) } }
        Box(Modifier.weight(1f)) { Smb30Btn(if (s.busy) "Logger inn …" else "Logg inn", !s.busy, primary = true) { vm.smbLogin30(false) } }
    }
}

@Composable
private fun Smb30SharesView(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.smb30
    val who = if (s.guest) " (gjest)" else if (s.user.isBlank()) "" else " som ${s.user}"
    Text("Delte mapper på ${s.server.title}$who · ${s.proto}", color = p.mut, fontSize = 14.5.sp)
    Smb30ListBox {
        if (s.shares.isEmpty()) Smb30EmptyRow("Fant ingen delte mapper brukeren har tilgang til. Lag en på NAS-en, eller logg inn med en annen bruker.")
        else s.shares.forEach { sh -> Smb30Row(sh.name, sh.comment) { vm.smbChoose30(sh) } }
    }
}

@Composable
private fun Smb30FoldersView(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.smb30
    // Prompt 36: brødsmulesti smb://vert › share › mappe (trykk hopper opp), Bruk denne mappen øverst, Velg per rad og 🔒 uten tilgang.
    val crumbs = listOf("smb://" + s.server.host, s.share) + s.path
    Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        crumbs.forEachIndexed { i, c ->
            if (i > 0) Text("›", color = p.mut, fontSize = 14.sp)
            val last = i == crumbs.size - 1
            Text(c, color = if (last) p.ink else p.mut, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, textDecoration = if (last) null else TextDecoration.Underline,
                fontFamily = if (i == 0) PaperFonts.mono else null,
                modifier = Modifier.heightIn(min = 40.dp).press24(enabled = !last) { if (i == 0) { s.dirs = null; vm.smbGo30(2) } else vm.smbOpenDir30(s.path.take(i - 1)) }.padding(vertical = 10.dp))
        }
    }
    Smb30Btn("Bruk denne mappen", !s.busy && s.dirs != null, primary = true) { vm.smbGo30(4) }
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Smb30Mini("‹ Opp", s.path.isNotEmpty() && !s.busy) { vm.smbOpenDir30(s.path.dropLast(1)) }
        Smb30Mini("+ Ny mappe", !s.busy) { s.showNewDir = !s.showNewDir; s.showManual = false }
        Smb30Mini("Skriv sti", !s.busy) { s.showManual = !s.showManual; s.showNewDir = false; if (s.manualPath.isBlank()) s.manualPath = "/" + s.path.joinToString("/") }
        Smb30Mini(if (s.showHidden) "✓ Vis skjulte" else "Vis skjulte", !s.busy) { s.showHidden = !s.showHidden; vm.smbOpenDir30(s.path) }
    }
    if (s.showNewDir) {
        Smb30Input("Navn på ny mappe", "homelab", s.newDir) { s.newDir = it }
        Smb30Btn("Lag mappe", !s.busy, primary = true) { vm.smbMkdir30() }
    }
    if (s.showManual) {
        Smb30Input("Sti i ${s.share}", "/backup/homelab", s.manualPath) { s.manualPath = it }
        Smb30Btn("Åpne stien", !s.busy, primary = true) { vm.smbManualPath36() }
    }
    Smb30ListBox {
        val d = s.dirs
        when {
            s.busy && d == null -> Smb30WaitRow("Henter mapper …")
            d.isNullOrEmpty() -> Smb30EmptyRow("Tom mappe. Bruk denne mappen, eller lag en ny.")
            else -> d.forEach { name ->
                val lock = s.locked[name]
                Smb30DirRow36(name, lock, !s.busy, open = { vm.smbOpenDir30(s.path + name) }, pick = { vm.smbPickDir36(name) })
            }
        }
    }
    if (s.listHint.isNotBlank()) Text(s.listHint, color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
}

@Composable
private fun Smb30SaveView(vm: AppViewModel) {
    val s = vm.smb30
    LaunchedEffect(Unit) { if (s.test == null && !s.testing) vm.smbTest30() }
    Smb30Who(s.label, (if (s.guest) "Gjest" else s.user) + " · " + s.proto, mono = true)
    Smb30TestView(vm)
    Text("BRUK NETTVERKSDISKEN TIL", color = PaperPal.current.mut, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
    Smb30ListBox {
        Smb30Check("FinansHub-backup", "Hele databasen, kvitteringer og innstillinger", s.useFinans) { s.useFinans = !s.useFinans }
        Smb30Check("Systembackup", "Kopi av hver backup fra Innstillinger → Backup", s.useSystem) { s.useSystem = !s.useSystem }
    }
    if (s.useSystem && !s.encrypted) {
        val warn = Color(0xFF9A6A0C)
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).background(warn.copy(alpha = 0.10f))) {
            Box(Modifier.width(3.dp).fillMaxHeight().background(warn))
            Text("Systembackupen er ikke kryptert. På eget hjemmenett er det greit, men vi anbefaler å slå på «Krypter backup» under Hvor, så filene på NAS-en ikke kan leses av andre.",
                color = PaperPal.current.ink, fontSize = 13.sp, modifier = Modifier.padding(12.dp))
        }
    }
}

@Composable
private fun Smb30TestView(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.smb30
    val t = s.test
    if (s.testing || t == null) { Smb30WaitRow("Skriver en liten testfil …"); return }
    val good = t.ok && t.writable
    Column(Modifier.fillMaxWidth().background(p.card).border(1.dp, p.line).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(if (good) "✓ Kan skrive" else if (t.ok) "✗ Kan ikke skrive" else "✗ Testen feilet", color = if (good) p.pos else p.lab, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Text(t.message, color = p.ink, fontSize = 13.5.sp)
        if (!good) smbHints30(if (t.ok) "access" else smbKind30(t.message)).forEach { Text("• $it", color = p.mut, fontSize = 13.sp) }
        Smb30Mini("Test på nytt", true) { vm.smbTest30() }
    }
}

@Composable
private fun Smb30DoneView(label: String) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(72.dp).border(2.dp, p.pos), contentAlignment = Alignment.Center) { Text("✓", color = p.pos, fontSize = 34.sp) }
        PSerif("Koblet til", 22.sp)
        Text("$label ✓", color = p.pos, fontFamily = PaperFonts.mono, fontSize = 14.sp)
    }
}

@Composable
private fun Smb30Foot(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.smb30
    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
    Row(Modifier.fillMaxWidth().background(p.bg).padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (s.doneLabel.isNotBlank()) {
            Box(Modifier.weight(1f)) { Smb30Btn("Ferdig", true, primary = true) { vm.closeSmb30() } }
            return@Row
        }
        Box(Modifier.weight(1f)) { Smb30Btn(if (s.step == 0) "Avbryt" else "‹ Tilbake", true, primary = false) { vm.smbBack30() } }
        if (s.step == 3) Box(Modifier.weight(1f)) { Smb30Btn("Bruk denne mappen", !s.busy && s.dirs != null, primary = true) { vm.smbGo30(4) } }
        if (s.step == 4) {
            val can = !s.busy && (s.test?.writable == true) && (s.useFinans || s.useSystem)
            Box(Modifier.weight(1f)) { Smb30Btn(if (s.busy) "Lagrer …" else "Lagre", can, primary = true) { vm.smbSave30() } }
        }
    }
}

/* ---------- Byggeklosser ---------- */

@Composable
private fun Smb30ListBox(content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.ink))
        content()
    }
}

@Composable
private fun Smb30Row(title: String, sub: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).press24(onClick = onClick).padding(horizontal = 4.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            if (sub.isNotBlank()) Text(sub, color = p.mut, fontSize = 13.sp)
        }
        Text("›", color = p.mut, fontSize = 22.sp)
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
}

@Composable
private fun Smb30Check(title: String, sub: String, on: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).press24(onClick = onClick).padding(horizontal = 4.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(24.dp).border(2.dp, if (on) p.ink else p.mut).background(if (on) p.ink else Color.Transparent), contentAlignment = Alignment.Center) {
            if (on) Text("✓", color = p.bg, fontSize = 14.sp)
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Text(sub, color = p.mut, fontSize = 13.sp)
        }
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
}

@Composable
private fun Smb30Who(title: String, sub: String, mono: Boolean) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.ink))
        Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(44.dp).border(1.dp, p.ink), contentAlignment = Alignment.Center) { Text("▤", color = p.ink, fontSize = 18.sp) }
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontWeight = if (mono) FontWeight.Medium else FontWeight.SemiBold, fontSize = if (mono) 14.sp else 16.sp, fontFamily = if (mono) PaperFonts.mono else PaperFonts.sans)
                Text(sub, color = p.mut, fontSize = 13.sp)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
    }
}

@Composable
private fun Smb30Input(label: String, hint: String, value: String, type: KeyboardType = KeyboardType.Text, secret: Boolean = false, onChange: (String) -> Unit) {
    val p = PaperPal.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = p.mut, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        Box(Modifier.fillMaxWidth().height(50.dp).background(p.card).border(1.dp, p.line).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
            if (value.isEmpty()) Text(hint, color = p.mut, fontSize = 16.sp)
            BasicTextField(value, onChange, singleLine = true, visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
                keyboardOptions = KeyboardOptions(keyboardType = type, autoCorrect = false),
                textStyle = TextStyle(color = p.ink, fontSize = 16.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.ink), modifier = Modifier.fillMaxWidth())
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.ink))
    }
}

@Composable
private fun Smb30Btn(text: String, enabled: Boolean, primary: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    val base = Modifier.fillMaxWidth().heightIn(min = 50.dp)
    val styled = if (primary) base.background(if (enabled) p.ink else p.ink.copy(alpha = 0.45f)) else base.border(1.dp, if (enabled) p.ink else p.line)
    Box(styled.press24(enabled = enabled, onClick = onClick).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
        Text(text, color = if (primary) p.bg else if (enabled) p.ink else p.mut, fontWeight = FontWeight.SemiBold, fontSize = 15.5.sp, maxLines = 1)
    }
}

@Composable
private fun Smb30Mini(text: String, enabled: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.heightIn(min = 40.dp).background(p.card).border(1.dp, p.line).press24(enabled = enabled, onClick = onClick).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
        Text(text, color = if (enabled) p.ink else p.mut, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}

@Composable
private fun Smb30WaitRow(text: String) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        CircularProgressIndicator(Modifier.size(18.dp), color = p.ink, strokeWidth = 2.dp)
        Text(text, color = p.mut, fontSize = 14.5.sp)
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
}

@Composable
private fun Smb30EmptyRow(text: String) {
    val p = PaperPal.current
    Text(text, color = p.mut, fontSize = 14.5.sp, modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 18.dp))
    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
}

@Composable
private fun Smb30ErrBox(e: Smb30Err) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).background(p.lab.copy(alpha = 0.07f))) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(p.lab))
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(e.message, color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            e.hints.forEach { Text("• $it", color = p.mut, fontSize = 13.sp) }
        }
    }
}

/** Prompt 36: mapperad – trykk åpner mappen, «Velg» bruker den. 🔒 = ingen tilgang (vises, skjules ikke). */
@Composable
private fun Smb30DirRow36(name: String, lock: String?, enabled: Boolean, open: () -> Unit, pick: () -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).press24(enabled = enabled && lock == null, onClick = open).padding(horizontal = 4.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        WxIcon(if (lock != null) "M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4" else "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z",
            if (lock != null) p.mut else p.ink, 20.dp, stroke = 1.9f)
        Column(Modifier.weight(1f)) {
            Text(name, color = if (lock != null) p.mut else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            if (lock != null) Text("🔒 $lock", color = p.mut, fontSize = 12.5.sp)
        }
        if (lock == null) {
            Box(Modifier.heightIn(min = 36.dp).border(1.dp, p.line).press24(enabled = enabled, onClick = pick).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                Text("Velg", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
            }
            Text("›", color = p.mut, fontSize = 22.sp)
        }
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
}
