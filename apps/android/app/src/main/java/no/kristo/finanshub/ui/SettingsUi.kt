package no.kristo.finanshub.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private data class SettingsGroup(val title: String, val items: List<Triple<String, String, ImageVector>>)

private val groups = listOf(
    SettingsGroup("Konto", listOf(
        Triple("accounts", "Kontoer og brukere", Icons.Filled.People),
        Triple("security", "Sikkerhet", Icons.Filled.Lock),
        Triple("tokens", "API-tokens", Icons.Filled.Key),
    )),
    SettingsGroup("App", listOf(
        Triple("look", "Utseende", Icons.Filled.Palette),
        Triple("scan", "Skanning og AI", Icons.Filled.DocumentScanner),
        Triple("notify", "Varsler", Icons.Filled.Notifications),
        Triple("haptics", "Haptikk", Icons.Filled.Vibration),
    )),
    SettingsGroup("Finans", listOf(
        Triple("ai", "AI-motor", Icons.Filled.AutoAwesome),
        Triple("cats", "Kategorier", Icons.Filled.Category),
        Triple("rules", "Regler", Icons.Filled.Tune),
        Triple("bank", "Bank og import", Icons.Filled.AccountBalance),
        Triple("stocks", "Aksjer · Trading 212", Icons.AutoMirrored.Filled.ShowChart),
        Triple("backup", "Backup og data", Icons.Filled.Backup),
    )),
    SettingsGroup("System", listOf(
        Triple("server", "Server og synk", Icons.Filled.Dns),
        Triple("data", "Data og lagring", Icons.Filled.Storage),
        Triple("about", "Om FinansHub", Icons.Filled.Info),
    )),
)

private val when_ = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale("nb", "NO"))
private fun time(t: Long?) = t?.let { when_.format(Date(it)) } ?: "–"

/** Innstillinger i appen: profilkort øverst og gruppene Konto, App og System. */
@Composable
internal fun SettingsScreen(vm: AppViewModel, onPrivacyChanged: () -> Unit) {
    val page = vm.settingsPage
    val title = groups.flatMap { it.items }.firstOrNull { it.first == page }?.second ?: "Innstillinger"
    Page {
        item { ModuleHeader(vm, title, back = if (page != null) ({ vm.settingsPage = null }) else null) }
        when (page) {
            null -> {
                item {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.container).clickable { vm.settingsPage = "accounts" }.padding(18.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        AvatarImage(vm, 56, C.primary, C.onPrimary)
                        Column(Modifier.weight(1f)) {
                            Text(vm.displayName, color = C.onContainer, style = MaterialTheme.typography.titleLarge)
                            Text("${vm.account?.username?.ifBlank { null } ?: "–"} · ${vm.me?.role ?: vm.account?.role ?: ""}", color = C.onContainer.copy(alpha = .8f), fontSize = 13.sp)
                            Text(host(vm.base), color = C.onContainer.copy(alpha = .7f), fontSize = 12.sp)
                        }
                        Icon(Icons.Filled.ChevronRight, null, tint = C.onContainer)
                    }
                }
                groups.forEach { g ->
                    item { SectionLabel(g.title) }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            g.items.forEachIndexed { i, (k, label, icon) ->
                                Row(Modifier.fillMaxWidth().clip(itemShape(i, g.items.size)).background(C.surface1).clickable {
                                    when (k) { "bank" -> vm.open(Screen.Import); else -> { vm.settingsPage = k; if (k == "tokens") vm.loadTokens() } }
                                }.padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                    Icon(icon, null, tint = C.primary)
                                    Text(label, Modifier.weight(1f))
                                    Icon(Icons.Filled.ChevronRight, null, tint = C.text2)
                                }
                            }
                        }
                    }
                }
                item {
                    OutlinedButton(onClick = { vm.logout() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Logg ut av ${vm.displayName}", color = C.primary) }
                }
            }
            "accounts" -> item { AccountsPage(vm) }
            "security" -> item { SecurityPage(vm, onPrivacyChanged) }
            "tokens" -> item { TokensPage(vm) }
            "look" -> item { LookPage(vm) }
            "scan" -> item { ScanPage(vm) }
            "notify" -> item { NotifyPage(vm) }
            "haptics" -> item { HapticsPage(vm) }
            "server" -> item { ServerPage(vm) }
            "data" -> item { DataPage(vm) }
            "about" -> item { AboutPage(vm) }
            "ai" -> item { AiPage(vm) }
            "cats" -> item { CategoriesPage(vm) }
            "rules" -> item { RulesPage(vm) }
            "stocks" -> item { StocksPrefsPage(vm) }
            "backup" -> item { BackupPage(vm) }
        }
    }
}

/* ---------------- Byggeklosser ---------------- */

@Composable
private fun Group(content: @Composable ColumnScope.() -> Unit) =
    // Papir: hvite kort med 20 dp runding (samme som PCard), ellers Material-gruppen.
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(if (Tone.paper) 20.dp else 24.dp)).background(C.surface1).padding(vertical = 4.dp), content = content)

@Composable
private fun Toggle(label: String, sub: String?, on: Boolean, onChange: (Boolean) -> Unit) {
    if (Tone.paper) { PToggle(label, sub, on, onChange = onChange); return }
    Row(Modifier.fillMaxWidth().clickable { onChange(!on) }.padding(16.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(label); sub?.let { Text(it, color = C.text2, fontSize = 12.sp) } }
        Switch(checked = on, onCheckedChange = onChange, colors = SwitchDefaults.colors(checkedTrackColor = C.primary, checkedThumbColor = C.onPrimary))
    }
}

@Composable
private fun Choice(label: String, sub: String? = null, on: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(label); sub?.let { Text(it, color = C.text2, fontSize = 12.sp) } }
        RadioButton(selected = on, onClick = onClick, colors = RadioButtonDefaults.colors(selectedColor = C.primary))
    }
}

@Composable
private fun Info(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(16.dp, 10.dp)) { Text(k, Modifier.weight(1f), color = C.text2); Text(v, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
}

@Composable
private fun Note(text: String) = Text(text, color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp))

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { SectionLabel(title); content() }
}

@Composable
private fun Pages(content: @Composable ColumnScope.() -> Unit) = Column(verticalArrangement = Arrangement.spacedBy(12.dp), content = content)

private fun homelab(vm: AppViewModel) = vm.base.trimEnd('/') + "/"

/* ---------------- Sider ---------------- */

@Composable
internal fun AccountsPage(vm: AppViewModel) = Pages {
    val ctx = LocalContext.current
    var shot by remember { mutableStateOf<android.net.Uri?>(null) }
    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(vm::uploadAvatar) }
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(vm::uploadAvatar) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) shot?.let(vm::uploadAvatar) }
    // Prompt 28 (konto-farger): i Papir ligger innholdet 23 dp opp i toppbildet; etiketten PROFILBILDE skal stå under bildet.
    if (Tone.paper) Spacer(Modifier.height(28.dp))
    // Prompt 36: Konto viser profilbildet sentrert (88–96 dp) over navnet, med «Endre bilde» (ui/Ui36.kt).
    // Prompt 37: Konto → Profil (koblingen bruker ⟷ profil i husstanden).
    if (Tone.paper) { KontoAvatar36(vm); ProfileLink37(vm) } else Section("Profilbilde") {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                AvatarImage(vm, 64)
                Column(Modifier.weight(1f)) {
                    Text(vm.displayName, fontWeight = FontWeight.SemiBold)
                    Text("Vises i menyknappen i Homelab og i appen. Beskjæres til 256 × 256.", color = C.text2, fontSize = 12.sp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = { pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, shape = RoundedCornerShape(18.dp)) { Text("Bilder") }
                FilledTonalButton(onClick = { pickFile.launch(arrayOf("image/*")) }, shape = RoundedCornerShape(18.dp)) { Text("Filer") }
                FilledTonalButton(onClick = {
                    val f = java.io.File(java.io.File(ctx.cacheDir, "scans").apply { mkdirs() }, "profil-${System.currentTimeMillis()}.jpg")
                    val u = androidx.core.content.FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
                    shot = u; camera.launch(u)
                }, shape = RoundedCornerShape(18.dp)) { Text("Ta bilde") }
            }
            // Destruktiv tekstknapp i aksentfargen (lab), fet og uten opasitet.
            if (vm.avatar != null) TextButton(onClick = { vm.removeAvatar() }) { Text("Fjern bildet", color = if (Tone.paper) PaperPal.current.lab else C.red, fontWeight = FontWeight.Bold) }
        }
    }
    Note("Hver konto har egne data, tokens og varsler. Bytt raskt ved å holde inne profilbildet.")
    Group {
        vm.accounts.forEach { a ->
            Row(Modifier.fillMaxWidth().clickable { if (a.id != vm.activeId) vm.switchTo(a.id) }.padding(16.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(if (a.id == vm.activeId) C.primary else C.surface3), contentAlignment = Alignment.Center) {
                    Text(initial(a.name.ifBlank { a.username.ifBlank { "K" } }), color = if (a.id == vm.activeId) C.onPrimary else C.text, fontWeight = FontWeight.Bold)
                }
                Column(Modifier.weight(1f)) {
                    Text(a.name.ifBlank { a.username.ifBlank { "Konto" } } + if (a.id == vm.activeId) " · aktiv" else "", fontWeight = FontWeight.Medium)
                    Text("${a.username.ifBlank { "–" }} · ${a.role} · ${host(a.server)}", color = C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                TextButton(onClick = { vm.logout(a.id) }) { Text("Logg ut", color = if (Tone.paper) PaperPal.current.lab else C.primary, fontWeight = if (Tone.paper) FontWeight.Bold else null) }
            }
        }
    }
    // Primærknapp: lab-bakgrunn med onLab-tekst i Papir (aldri hvit på lys rosa); ikonet følger tekstfargen.
    Button(onClick = { vm.addingAccount = true }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
        colors = if (Tone.paper) ButtonDefaults.buttonColors(containerColor = PaperPal.current.lab, contentColor = PaperPal.current.onLab)
            else ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Icon(Icons.Filled.PersonAdd, null); Spacer(Modifier.width(8.dp)); Text("Legg til konto", fontWeight = FontWeight.Bold) }
    if (vm.accounts.size > 1) OutlinedButton(onClick = { vm.logoutOthers() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Logg ut andre kontoer") }
    Note("Nye brukere opprettes av admin i Homelab → Innstillinger → Innlogging.")
    // Prompt 38: ENHETER (Logg inn på ny enhet) og ØKT (Lås skjermen, Logg ut, Logg ut av alle enheter) nederst på Konto.
    if (Tone.paper) Session38(vm)
}

@Composable
internal fun SecurityPage(vm: AppViewModel, onPrivacyChanged: () -> Unit) = Pages {
    val uri = LocalUriHandler.current
    Group {
        Toggle("Lås med fingeravtrykk eller ansikt", "Kreves når appen åpnes. PIN/mønster kan brukes som reserve.", vm.flag(AppPrefs.LOCK)) { vm.setPref(AppPrefs.LOCK, it) }
    }
    if (vm.flag(AppPrefs.LOCK)) Section("Lås etter") {
        Group {
            listOf(0 to "Umiddelbart", 1 to "1 min", 5 to "5 min", 15 to "15 min").forEach { (m, n) ->
                Choice(n, on = vm.optionInt(AppPrefs.LOCK_AFTER, 0) == m) { vm.setPref(AppPrefs.LOCK_AFTER, m) }
            }
        }
    }
    Group {
        Toggle("Skjul beløp i appveksleren", "Viser et blankt bilde i oversikten over åpne apper", vm.flag(AppPrefs.HIDE_SWITCHER)) { vm.setPref(AppPrefs.HIDE_SWITCHER, it); onPrivacyChanged() }
    }
    Section("Tofaktor (2FA)") {
        Group {
            // Prompt 40 (claude-code-2fa-i-appen.md): hele oppsettet skjer i appen (ui/Ui40.kt), aldri i nettleseren.
            Box(Modifier.fillMaxWidth().hl34(vm, "2fa", 0.dp)) { TfRow40(vm) } // prompt 34: mål «2fa»
        }
        Note("Autentiseringsappen på denne telefonen (Google Authenticator, 1Password, Aegis …) åpnes med ett trykk. Reservekodene får du til slutt.")
    }
    Section("Pålitelige enheter") {
        Group {
            Info("Denne enheten", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
            Row(Modifier.fillMaxWidth().clickable { uri.openUri(homelab(vm)) }.padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Administrer i Homelab", Modifier.weight(1f), color = C.primary)
                Icon(Icons.Filled.OpenInBrowser, null, tint = C.text2)
            }
        }
        Note("Appen bruker et eget token. Fra internett kreves alltid passord, og 2FA hvis det er på.")
    }
}

private val allScopes = listOf(
    "receipts:write" to "Last opp kvitteringer", "read:transactions" to "Les transaksjoner", "read:summary" to "Les sammendrag",
    "read:budget" to "Les budsjett", "write:transactions" to "Endre transaksjoner", "finance:read" to "Les alt i FinansHub",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TokensPage(vm: AppViewModel) = Pages {
    val clip = LocalClipboardManager.current
    Note("Tokens brukes av iOS-snarveien for kvitteringer, Home Assistant, Excel Power Query og skript. De gir bare tilgangen du velger og kan trekkes tilbake når som helst.")
    vm.newToken?.let { t ->
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.positiveBg).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Kopier nå – tokenet vises bare én gang", color = C.positive, fontWeight = FontWeight.SemiBold)
            Text(t, fontFamily = Mono, fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { clip.setText(AnnotatedString(t)); vm.message = "Kopiert" }, colors = ButtonDefaults.buttonColors(containerColor = C.positive, contentColor = C.positiveBg)) { Text("Kopier") }
                TextButton(onClick = { vm.newToken = null }) { Text("Ferdig", color = C.positive) }
            }
        }
    }
    vm.tokenError?.let { Note(it) }
    val list = vm.tokens
    if (list == null) Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }
    else if (list.isNotEmpty()) Group {
        list.forEach { t ->
            Row(Modifier.fillMaxWidth().padding(16.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(t.name, fontWeight = FontWeight.Medium)
                    Text(t.scopes.joinToString(", "), color = C.text2, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("Laget ${time(t.created)} · sist brukt ${time(t.lastUsed)} · utløper ${t.expires?.let { time(it) } ?: "aldri"}", color = C.text2, fontSize = 11.sp)
                }
                TextButton(onClick = { vm.revokeToken(t.id) }) { Text("Trekk tilbake", color = C.primary) }
            }
        }
    } else if (vm.tokenError == null) Note("Ingen tokens ennå.")
    if (vm.tokenError == null) Section("Lag nytt token") {
        var name by remember { mutableStateOf("") }
        var scopes by remember { mutableStateOf(setOf("receipts:write")) }
        var days by remember { mutableStateOf<Int?>(90) }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(name, { name = it }, label = { Text("Navn, f.eks. iOS-snarvei") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
            Text("Tilganger", color = C.text2, fontSize = 13.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                allScopes.forEach { (k, n) ->
                    FilterChip(selected = k in scopes, onClick = { scopes = if (k in scopes) scopes - k else scopes + k }, label = { Text(n) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = C.container, selectedLabelColor = C.onContainer))
                }
            }
            Text("Utløper", color = C.text2, fontSize = 13.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(30 to "30 d", 90 to "90 d", 365 to "1 år", null to "Aldri").forEach { (d, n) ->
                    FilterChip(selected = days == d, onClick = { days = d }, label = { Text(n) })
                }
            }
            Button(onClick = { vm.createToken(name.ifBlank { "Token" }, scopes.toList(), days); name = "" }, enabled = scopes.isNotEmpty(), modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(26.dp), colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Lag token", fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun LookPage(vm: AppViewModel) = Pages {
    Section("Mobildesign") {
        Group {
            Choice("Klassisk", "Material You, som appen har sett ut til nå", on = !vm.paper) { vm.setMobileDesign("klassisk") }
            Choice("Papir", "Lyst papir, fotovindu øverst og nyheter på forsiden (likt med iPhone)", on = vm.paper) { vm.setMobileDesign("papir") }
        }
        if (vm.paper) Group {
            listOf("auto" to "Følg systemet", "lys" to "Papir · lys", "mork" to "Papir · mørk").forEach { (k, n) ->
                Choice(n, on = vm.paperMode == k) { vm.setPaperMode(k) }
            }
        }
        Note("Papir har de samme sidene og funksjonene. Du kan bytte tilbake her eller i Papir → Innstillinger.")
    }
    Section("Nyhetsleser") {
        Group {
            Row(Modifier.fillMaxWidth().clickable { vm.openNews(settings = true) }.padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("Kilder og AI"); Text("RSS- og Atom-adresser, ✦ AI-sammendrag og ✦ AI-kategorisering", color = C.text2, fontSize = 12.sp) }
                Icon(Icons.Filled.ChevronRight, null, tint = C.text2)
            }
        }
    }
    Section("Oppstart") {
        Group {
            listOf("homelab" to "Homelab", "home" to "Finans · Hjem", "list" to "Finans · Liste", "budget" to "Finans · Budsjett").forEach { (k, n) ->
                Choice(n, on = vm.option(AppPrefs.START, "homelab") == k) { vm.setPref(AppPrefs.START, k) }
            }
        }
        Note("Med Finans som startside åpner appen der, og Homelab og de andre modulene ligger i profilmenyen.")
    }
    Section("Navigasjonslinje") {
        var open by remember { mutableStateOf(false) }
        Group {
            Row(Modifier.fillMaxWidth().clickable { open = !open }.padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Endre navn, rekkefølge og skjul faner", Modifier.weight(1f))
                Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, null, tint = C.text2)
            }
        }
        if (open) NavEditors(vm)
    }
    Section("Sider") {
        Group {
            Choice("Samme overalt", "Alle sidene, også Domener og Mat, bruker fargetemaet under", on = vm.option(AppPrefs.PAGES, "same") == "same") { vm.setPref(AppPrefs.PAGES, "same") }
            Choice("Egen farge per side", "Domener er rosa, og modulene beholder sine egne kulører", on = vm.option(AppPrefs.PAGES, "same") == "own") { vm.setPref(AppPrefs.PAGES, "own") }
        }
        Note("Mat følger alltid appens tema og lys/mørk-valget.")
    }
    Group {
        Toggle("Skjul beløp til jeg trykker", "Beløp vises som prikker til du trykker på saldoen eller øyet", vm.flag(AppPrefs.HIDE_AMOUNTS)) { vm.setPref(AppPrefs.HIDE_AMOUNTS, it) }
    }
    Section("Farger") {
        Group {
            SEEDS.forEach { (k, n, c) ->
                Row(Modifier.fillMaxWidth().clickable { vm.setPref(AppPrefs.COLOR, k) }.padding(16.dp, 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(24.dp).clip(CircleShape).background(if (k == "system") C.primary else androidx.compose.ui.graphics.Color(c)))
                    Column(Modifier.weight(1f)) {
                        Text(n)
                        if (k == "system") Text(if (android.os.Build.VERSION.SDK_INT >= 31) "Material You: fargene fra bakgrunnsbildet" else "Krever Android 12 – bruker oransje", color = C.text2, fontSize = 12.sp)
                    }
                    RadioButton(selected = vm.option(AppPrefs.COLOR, "system") == k, onClick = { vm.setPref(AppPrefs.COLOR, k) }, colors = RadioButtonDefaults.colors(selectedColor = C.primary))
                }
            }
        }
    }
    Section("Lys eller mørk") {
        Group { MODES.forEach { (k, n) -> Choice(n, on = vm.option(AppPrefs.MODE, "dark") == k) { vm.setPref(AppPrefs.MODE, k) } } }
    }
    Section("Widgets · One UI-stil") {
        val ctx = LocalContext.current
        var alpha by remember { mutableStateOf(vm.optionInt(AppPrefs.W_ALPHA, 75).toFloat()) }
        Group {
            listOf("system" to "Som systemet", "dark" to "Mørk", "light" to "Lys").forEach { (k, n) ->
                Choice(n, on = vm.option(AppPrefs.W_THEME, "system") == k) { vm.setPref(AppPrefs.W_THEME, k); no.kristo.finanshub.widget.WidgetSync.styleChanged(ctx) }
            }
            Column(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                Row { Text("Bakgrunn", Modifier.weight(1f)); Text("${alpha.toInt()} %", color = C.text2) }
                Slider(value = alpha, onValueChange = { alpha = it }, valueRange = 0f..100f, steps = 9,
                    onValueChangeFinished = { vm.setPref(AppPrefs.W_ALPHA, alpha.toInt()); no.kristo.finanshub.widget.WidgetSync.styleChanged(ctx) },
                    colors = SliderDefaults.colors(thumbColor = C.primary, activeTrackColor = C.primary))
            }
        }
        Note("Gjelder Samsung-widgetene (Søk, Klokke, Vær, Pakker, Skann, Budsjett, Aksjer, Middag, FinansHub, Domener og Finn). Material You-widgetene følger fargene fra bakgrunnsbildet.")
    }
    // Prompt 40 (claude-code-widgets-android-samsung-preview-las.md): låseskjerm-widgetene (små 1 × 1 og brede 4 × 1).
    Section("Widgets · låseskjerm") {
        val ctx = LocalContext.current
        var hide by remember { mutableStateOf(no.kristo.finanshub.widget.Lock40.hide(ctx)) }
        Group {
            Toggle("Skjul beløp og navn på låseskjermen", "Budsjett og Pakker viser «•••» til telefonen er låst opp", hide) { hide = it; no.kristo.finanshub.widget.Lock40.setHide(ctx, it) }
        }
        Note("Små: Vær, Gjøremål, Pakker, Budsjett, Avgang og Prøveperiode. Brede: Neste time, Avganger, Gjøremål, Pakker, Glimt brief og Dagens bibelvers. Legg dem til fra låseskjermen (Pixel: sveip fra høyre kant · Samsung: hold inne på låseskjermen → Widgets).")
    }
    Note("Fargebakgrunn (lysflekker bak glasset) finnes i iPhone-appen.")
}

@Composable
internal fun ScanPage(vm: AppViewModel) = Pages {
    Section("Skanneknappen") {
        Group {
            Choice("Trykk åpner kameraet", "Hold inne for å velge fra Bilder eller Filer", vm.option(AppPrefs.SCAN_TAP, "camera") == "camera") { vm.setPref(AppPrefs.SCAN_TAP, "camera") }
            Choice("Trykk viser valg", "Hold inne for å åpne kameraet direkte", vm.option(AppPrefs.SCAN_TAP, "camera") == "choices") { vm.setPref(AppPrefs.SCAN_TAP, "choices") }
        }
    }
    Group {
        Toggle("Beskjær automatisk", "Finner kantene på kvitteringen før AI-en leser den", vm.flag(AppPrefs.AUTO_CROP, true)) { vm.setPref(AppPrefs.AUTO_CROP, it) }
        Toggle("Lagre originalbildet", "Lagres sammen med kvitteringen på serveren", vm.flag(AppPrefs.KEEP_ORIGINAL, true)) { vm.setPref(AppPrefs.KEEP_ORIGINAL, it) }
        Toggle("Last opp bare på Wi-Fi", "Ellers settes filer i kø til du er på Wi-Fi", vm.flag(AppPrefs.WIFI_ONLY)) { vm.setPref(AppPrefs.WIFI_ONLY, it) }
    }
    val st = vm.boot?.settings
    Section("AI-motor (på serveren)") {
        Group {
            if (!vm.canEditServer) Info("AI-motor", engineName(st)) else {
                Choice("Ollama lokalt", "Bildet forlater aldri huset", st?.provider == "ollama" && st?.fallback != true) { vm.saveSetting("provider", "ollama"); vm.saveSetting("fallback", false) }
                Choice("Gemini", "Raskest og mest presis", st?.provider == "gemini") { vm.saveSetting("provider", "gemini"); vm.saveSetting("fallback", false) }
                Choice("Ollama + Gemini", "Lokalt først, Gemini som reserve", st?.provider == "ollama" && st?.fallback == true) { vm.saveSetting("provider", "ollama"); vm.saveSetting("fallback", true) }
            }
        }
        if (!vm.canEditServer) Note(SERVER_LOCKED)
    }
}

@Composable
private fun NotifyPage(vm: AppViewModel) = Pages {
    Note("Send varsel når …")
    Group {
        Toggle("Kvittering er lest", "Når AI er ferdig og noe må bekreftes", vm.flag(AppPrefs.N_RECEIPT, true)) { vm.setPref(AppPrefs.N_RECEIPT, it); vm.saveSetting("nRc", it) }
        Toggle("Budsjett passerer 80 %", null, vm.flag(AppPrefs.N_BUDGET, true)) { vm.setPref(AppPrefs.N_BUDGET, it); vm.saveSetting("n80", it) }
        Toggle("Abonnement trekkes snart", "Dagen før trekk", vm.flag(AppPrefs.N_SUB, true)) { vm.setPref(AppPrefs.N_SUB, it) }
        Toggle("Domene eller SSL utløper", "30 og 7 dager før", vm.flag(AppPrefs.N_DOMAIN, true)) { vm.setPref(AppPrefs.N_DOMAIN, it) }
        Toggle("Ukesoppsummering", "Søndag kl. 18", vm.flag(AppPrefs.N_WEEKLY)) { vm.setPref(AppPrefs.N_WEEKLY, it) }
    }
    Note("Kvittering og budsjett lagres også på serveren. Mens appen er åpen vises ferdige kvitteringer i køen med en gang.")
    LaunchedEffect(Unit) { if (vm.tracking == null) vm.pollTracking() }
    Section("Sporing") {
        Group {
            TRK_PREFS.forEach { (k, l, sub) -> Toggle(l, sub, vm.tracking?.prefs?.get(k) ?: (k != "delayed")) { vm.setTrackingPref(k, it) } }
        }
    }
    Note("Lagres på serveren og gjelder også Sporing på web. Varslene vises som lokale varsler når appen henter status; ekte push fra serveren er ikke bygget ennå.")
}

/** Innstillinger → App → Haptikk: hovedbryter, styrke, brytere per type og test. */
@Composable
internal fun HapticsPage(vm: AppViewModel) = Pages {
    val on = vm.flag(Haptics.ON, true)
    Group { Toggle("Haptisk tilbakemelding", "Vibrasjon ved trykk, fullførte handlinger og varsler", on) { vm.setPref(Haptics.ON, it) } }
    if (on) {
        Section("Styrke") {
            Group {
                val st = vm.option(Haptics.STRENGTH, "medium")
                listOf("light" to "Lett", "medium" to "Middels", "heavy" to "Kraftig").forEach { (k, l) ->
                    Choice(l, on = st == k) { vm.setPref(Haptics.STRENGTH, k); Haptics.tap() }
                }
            }
        }
        Section("Gi tilbakemelding ved …") {
            Group {
                Toggle("Trykk på knapper og faner", null, vm.flag(Haptics.TAP, true)) { vm.setPref(Haptics.TAP, it) }
                Toggle("Fullført handling", "Lagret, bokført, synket", vm.flag(Haptics.DONE, true)) { vm.setPref(Haptics.DONE, it) }
                Toggle("Feil og advarsler", null, vm.flag(Haptics.ERROR, true)) { vm.setPref(Haptics.ERROR, it) }
                Toggle("Pakke-varsler", "Klar for henting, levert", vm.flag(Haptics.PKG, true)) { vm.setPref(Haptics.PKG, it) }
            }
        }
        FilledTonalButton(onClick = { Haptics.test() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Test haptikk") }
    }
    Note("Følger «Vibrasjon og haptikk» i Android-innstillingene. Er berøringsvibrasjon av der, vibrerer ikke appen heller.")
}

@Composable
internal fun ServerPage(vm: AppViewModel) = Pages {
    val a = vm.account
    var local by remember(a?.id) { mutableStateOf(a?.local ?: "") }
    var external by remember(a?.id) { mutableStateOf(a?.let { it.external.ifBlank { it.server } } ?: "") }
    Section("Adresser") {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(local, { local = it }, label = { Text("Lokal adresse") }, placeholder = { Text("192.168.1.20:3000") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = ServerKeyboard, shape = RoundedCornerShape(16.dp))
            OutlinedTextField(external, { external = it }, label = { Text("Ekstern adresse") }, placeholder = { Text("os.dittdomene.no") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = ServerKeyboard, shape = RoundedCornerShape(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { vm.updateAddresses(local, external) }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(24.dp), colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Lagre") }
                OutlinedButton(onClick = { vm.testConnection(local.ifBlank { external }) }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(24.dp)) { Text("Test tilkobling") }
            }
            Note("Eksternt går trafikken via Cloudflare Tunnel. Hjemme brukes den lokale adressen når den svarer.")
        }
    }
    Group {
        Toggle("Bruk lokal adresse hjemme", "Bytter automatisk når serveren svarer på lokal adresse", vm.flag(AppPrefs.USE_LOCAL, true)) { vm.setPref(AppPrefs.USE_LOCAL, it); vm.refresh() }
    }
    Section("Status") {
        Group {
            Info("Aktiv vei", "${vm.route} · ${host(vm.base)}")
            Info("Siste synk", time(vm.lastSync))
            Info("Serverversjon", vm.me?.version ?: "–")
        }
    }
}

@Composable
internal fun DataPage(vm: AppViewModel) = Pages {
    Group {
        Row(Modifier.fillMaxWidth().clickable { vm.clearCache() }.padding(16.dp, 14.dp)) { Text("Tøm hurtigbuffer", Modifier.weight(1f)); Text("Logoer og bilder", color = C.text2, fontSize = 13.sp) }
        Row(Modifier.fillMaxWidth().clickable { vm.refresh() }.padding(16.dp, 14.dp)) { Text("Synk nå", Modifier.weight(1f)); Text(time(vm.lastSync), color = C.text2, fontSize = 13.sp) }
        Row(Modifier.fillMaxWidth().clickable { vm.exportCsv() }.padding(16.dp, 14.dp)) { Text("Eksporter som CSV", Modifier.weight(1f)); Icon(Icons.Filled.IosShare, null, tint = C.text2) }
    }
    Note("Full backup og Excel-database lages i FinansHub på PC under Innstillinger → Backup og data.")
}

@Composable
internal fun AboutPage(vm: AppViewModel) = Pages {
    val ctx = LocalContext.current
    val version = remember { runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "–" }
    Group {
        Info("Appversjon", "FinansHub $version")
        Info("Serverversjon", vm.me?.version ?: "–")
        Info("Plattform", "Android ${android.os.Build.VERSION.RELEASE}")
    }
    Section("Personvern") {
        Note("Appen snakker bare med din egen homelab-server. Tokenet lagres kryptert i Android Keystore, og passordet lagres ikke. Ingen data sendes til tredjeparter fra appen.")
    }
    Section("Lisenser") {
        Note("Jetpack Compose, Material 3, AndroidX Biometric og Security Crypto (Apache 2.0).")
    }
}


/* ---------------- Finans ---------------- */

@Composable
internal fun AiPage(vm: AppViewModel) = Pages {
    val st = vm.boot?.settings
    Group {
        if (!vm.canEditServer) Info("AI-motor", engineName(st)) else {
            Choice("Ollama lokalt", "Bildet forlater aldri huset", st?.provider == "ollama" && st?.fallback != true) { vm.saveSetting("provider", "ollama"); vm.saveSetting("fallback", false) }
            Choice("Gemini", "Raskest og mest presis", st?.provider == "gemini") { vm.saveSetting("provider", "gemini"); vm.saveSetting("fallback", false) }
            Choice("Ollama + Gemini", "Lokalt først, Gemini som reserve", st?.provider == "ollama" && st?.fallback == true) { vm.saveSetting("provider", "ollama"); vm.saveSetting("fallback", true) }
        }
    }
    if (!vm.canEditServer) Note("AI-motor, modeller og minimum sikkerhet: $SERVER_LOCKED")
    Group {
        Info("Minimum sikkerhet", "${st?.minConf ?: 85} %")
        Toggle("Kategoriser automatisk", "Regler først, deretter AI", st?.autoCat == true) { vm.saveSetting("autoCat", it) }
    }
    Note(if (vm.canEditServer) "Nøkler og modeller for Ollama og Gemini legges inn i FinansHub på PC. De lagres bare på serveren."
        else "Nøkler og modeller for Ollama og Gemini er felles for serveren. $SERVER_LOCKED")
}

/** ISO2: serveroppsettet (AI-motorer, modeller, tidsgrenser, SMB) kan bare endres når canEditServer er true. */
internal const val SERVER_LOCKED = "Settes opp av administrator."

internal fun engineName(st: no.kristo.finanshub.Settings?): String = when {
    st == null -> "–"
    st.provider == "gemini" -> "Gemini"
    st.provider == "ollama" && st.fallback -> "Ollama + Gemini"
    st.provider == "ollama" -> "Ollama lokalt"
    else -> st.provider.replaceFirstChar { it.uppercase() }
}

@Composable
internal fun CategoriesPage(vm: AppViewModel) = Pages {
    val cats = vm.boot?.categories.orEmpty()
    if (cats.isEmpty()) Note("Ingen kategorier.") else Group {
        cats.forEach { c ->
            Row(Modifier.fillMaxWidth().padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(14.dp).clip(CircleShape).background(androidx.compose.ui.graphics.Color(c.color)))
                Text(c.name, Modifier.weight(1f))
                Text(when (c.kind) { "income" -> "Inntekt"; "transfer" -> "Overføring"; else -> "Utgift" }, color = C.text2, fontSize = 13.sp)
            }
        }
    }
    Note("Nye kategorier, farger og budsjett settes i FinansHub på PC.")
}

@Composable
internal fun RulesPage(vm: AppViewModel) = Pages {
    val rules = vm.boot?.rules.orEmpty()
    if (rules.isEmpty()) Note("Ingen regler ennå. Regler lages når du retter en kategori, eller i FinansHub på PC.") else Group {
        rules.forEach { r -> Info(r.pattern, r.category ?: "–") }
    }
    Note("* kan brukes som jokertegn og treffer starten på et hvilket som helst ord.")
}

@Composable
internal fun StocksPrefsPage(vm: AppViewModel) = Pages {
    LaunchedEffect(Unit) { if (vm.stocks == null) vm.syncStocks() }
    val s = vm.stocks
    Group {
        Info("Status", if (s == null) "–" else if (s.configured) "Koblet til" else if (s.mock) "Eksempeldata" else "Ikke koblet til")
        Info("Miljø", when (s?.env) { "demo" -> "Demo"; null -> "–"; else -> "Live" })
        s?.status?.let { Info("Siste synk", it) }
    }
    Button(onClick = { vm.open(Screen.Stocks) }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
        colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Åpne Aksjer", fontWeight = FontWeight.Bold) }
    Note("Lag nøkkelen hos Trading 212 under Innstillinger → API (Beta), med bare lesetilgang. Legg din egen nøkkel og secret inn under Innstillinger → Integrasjoner → Trading 212. De lagres kryptert på serveren.")
}

@Composable
internal fun BackupPage(vm: AppViewModel) = Pages {
    val uri = LocalUriHandler.current
    // ISO2: backup av hele databasen og SMB er bare for hovedadministrator (canSmb). Eldre server uten flagget: admin-rollen.
    val canSmb = vm.me?.isMainAdmin == true || (vm.boot?.canEditServer == null && vm.userIsAdmin)
    Group {
        Row(Modifier.fillMaxWidth().clickable { vm.exportCsv() }.padding(16.dp, 14.dp)) { Text("Eksporter transaksjoner som CSV", Modifier.weight(1f)); Icon(Icons.Filled.IosShare, null, tint = C.text2) }
        Row(Modifier.fillMaxWidth().clickable { runCatching { uri.openUri(vm.base.trimEnd('/') + "/finans/?desktop=1#/inn") } }.padding(16.dp, 14.dp)) {
            Text(if (canSmb) "Full backup, Excel og SMB-share" else "Eksporter og gjenopprett dine data", Modifier.weight(1f)); Icon(Icons.Filled.OpenInBrowser, null, tint = C.text2)
        }
    }
    Note(if (canSmb) "Full backup (.json), Excel-databasen og backup til SMB-share settes opp i FinansHub på PC under Innstillinger → Backup og data."
        else "Du kan eksportere og gjenopprette dine egne data i FinansHub på PC under Innstillinger → Backup og data. Backup av hele databasen og SMB-share: $SERVER_LOCKED")
}
