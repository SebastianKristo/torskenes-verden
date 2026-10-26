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

private val when_ = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale("nb", "NO"))
private fun time(t: Long?) = t?.let { when_.format(Date(it)) } ?: "–"

// Prompt 42: den klassiske Innstillinger-skjermen (Material You) er slettet. Papir viser sidene under fra PaperSettings17.

/* ---------------- Byggeklosser ---------------- */

@Composable
private fun Group(content: @Composable ColumnScope.() -> Unit) =
    // Papir: hvite kort med 20 dp runding (samme som PCard).
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface1).padding(vertical = 4.dp), content = content)

@Composable
private fun Toggle(label: String, sub: String?, on: Boolean, onChange: (Boolean) -> Unit) {
    PToggle(label, sub, on, onChange = onChange)
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
    // Prompt 28 (konto-farger): i Papir ligger innholdet 23 dp opp i toppbildet; etiketten PROFILBILDE skal stå under bildet.
    Spacer(Modifier.height(28.dp))
    // Prompt 36: Konto viser profilbildet sentrert (88–96 dp) over navnet, med «Endre bilde» (ui/Ui36.kt).
    // Prompt 37: Konto → Profil (koblingen bruker ⟷ profil i husstanden).
    KontoAvatar36(vm); ProfileLink37(vm)
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
                TextButton(onClick = { vm.logout(a.id) }) { Text("Logg ut", color = PaperPal.current.lab, fontWeight = FontWeight.Bold) }
            }
        }
    }
    // Primærknapp: lab-bakgrunn med onLab-tekst i Papir (aldri hvit på lys rosa); ikonet følger tekstfargen.
    Button(onClick = { vm.addingAccount = true }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
        colors = ButtonDefaults.buttonColors(containerColor = PaperPal.current.lab, contentColor = PaperPal.current.onLab)) { Icon(Icons.Filled.PersonAdd, null); Spacer(Modifier.width(8.dp)); Text("Legg til konto", fontWeight = FontWeight.Bold) }
    if (vm.accounts.size > 1) OutlinedButton(onClick = { vm.logoutOthers() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Logg ut andre kontoer") }
    Note("Nye brukere opprettes av admin i Homelab → Innstillinger → Innlogging.")
    // Prompt 44: FAMILIE · LOGG INN SOM og SERVER · EIER – prompt 68: flyttet til Husstand → Brukere og familie (ui/Users68Ui.kt).
    Users68Link(vm, if (vm.userIsAdmin) "Brukerne, Logg inn som og eier av serveren · Familie, helse og posisjon" else "Familie, helse og posisjon")
    // Prompt 38: ENHETER (Logg inn på ny enhet) og ØKT (Lås skjermen, Logg ut, Logg ut av alle enheter) nederst på Konto.
    ServerLink47(vm); Session38(vm) // Prompt 41/47: Konto → SERVER åpner Innstillinger → Server (lokal, ekstern, status, Tilbakestill)
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
        // Prompt 48: begge valgene er av som standard. ML Kit og dokumentskanneren kjører på telefonen (Play-tjenester); bildet og
        // den lokale OCR-teksten sendes bare til din egen Glimt-server (POST /finans/api/receipts/scan), som tolker og kontrollerer.
        Toggle("Les teksten på telefonen", "Google ML Kit leser teksten lokalt. Teksten sendes til Glimt sammen med bildet, og Glimt kontrollerer alt.", vm.flag(PREF_OCR_LOCAL47, false)) { vm.setPref(PREF_OCR_LOCAL47, it) }
        Toggle("Dokumentskanner", "Googles skanner på telefonen retter opp perspektivet og beskjærer kvitteringen før den sendes", vm.flag(PREF_DOCSCAN48, false)) { vm.setPref(PREF_DOCSCAN48, it) }
    }
    val st = vm.boot?.settings
    Section("AI-motor (på serveren)") {
        Group {
            // Prompt 52 (AND52A): kvitteringer leses bare lokalt – Gemini er fjernet fra kjeden, også som reserve.
            if (!vm.canEditServer) Info("Kvitteringer", engineName(st)) else {
                // Eneste valg: lokal kjede. Et gammelt «gemini»/«ollama + reserve» lagres som ollama uten reserve ved trykk (serveren migrerer også).
                Choice("Glimt leser lokalt", "Telefon → Mac Vision → Tesseract → lokal modell → kø. Bildet forlater aldri huset.", true) {
                    if (st?.provider != "ollama" || st.fallback) { vm.saveSetting("provider", "ollama"); vm.saveSetting("fallback", false) }
                }
            }
        }
        if (!vm.canEditServer) Note(SERVER_LOCKED)
    }
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
        Info("Appversjon", "Homelab $version")
        Info("Serverversjon", vm.me?.version ?: "–")
        Info("Plattform", "Android ${android.os.Build.VERSION.RELEASE}")
    }
    Section("Personvern") {
        Note("Appen snakker bare med din egen homelab-server. Tokenet lagres kryptert i Android Keystore, og passordet lagres ikke. Ingen data sendes til tredjeparter fra appen.")
    }
    Section("Lisenser") {
        Note("Jetpack Compose, Material 3, AndroidX Biometric og Security Crypto (Apache 2.0).")
        // Prompt 56 (AND56): modellene på serveren og Mac mini-en (docs/lisenser-tredjepart.md).
        Note("Inneholder modeller fra Desert Ant Labs (license.desertant.com): Eye, Redact, Gist, Tongue, Emo, Moderator, Clear og Voz. Desert Ant Labs Source-Available License 1.0. Copyright © 2026 Desert Ant Labs B.V.")
        Note("Fermion Research: Phonon (tale til tekst) © Fermion Research, CC-BY-4.0. Neutrino-1 © Fermion Research, Apache-2.0 (Qwen3 © Alibaba Cloud, Apache-2.0).")
        Note("NB-Whisper fra Nasjonalbiblioteket (Apache-2.0): tale til tekst på norsk og engelsk. Finjustert fra OpenAI Whisper (MIT).")
    }
}


/* ---------------- Finans ---------------- */

@Composable
internal fun AiPage(vm: AppViewModel) = Pages {
    val st = vm.boot?.settings
    Group {
        if (!vm.canEditServer) Info("Kvitteringer", engineName(st)) else {
            // Eneste valg: lokal kjede. Et gammelt «gemini»/«ollama + reserve» lagres som ollama uten reserve ved trykk (serveren migrerer også).
            Choice("Glimt leser lokalt", "Telefon → Mac Vision → Tesseract → lokal modell → kø. Bildet forlater aldri huset.", true) {
                if (st?.provider != "ollama" || st.fallback) { vm.saveSetting("provider", "ollama"); vm.saveSetting("fallback", false) }
            }
        }
    }
    if (!vm.canEditServer) Note("AI-motor, modeller og minimum sikkerhet: $SERVER_LOCKED")
    Group {
        Info("Minimum sikkerhet", "${st?.minConf ?: 85} %")
        Toggle("Kategoriser automatisk", "Regler først, deretter AI", st?.autoCat == true) { vm.saveSetting("autoCat", it) }
    }
    Note(if (vm.canEditServer) "Glimt leser kvitteringer lokalt (telefon, Mac Vision, Tesseract og lokal modell). Kvitteringsbilder sendes aldri til skytjenester. Modeller settes i FinansHub på PC."
        else "Glimt leser kvitteringer lokalt. Modellene er felles for serveren. $SERVER_LOCKED")
}

/** ISO2: serveroppsettet (AI-motorer, modeller, tidsgrenser, SMB) kan bare endres når canEditServer er true. */
internal const val SERVER_LOCKED = "Settes opp av administrator."

internal fun engineName(st: no.kristo.finanshub.Settings?): String = when {
    st == null -> "–"
    // Prompt 52: Gemini leser ikke kvitteringer lenger – gamle verdier (gemini, ollama + reserve) vises som lokal AI.
    st.provider == "gemini" || st.provider == "ollama" -> "Lokal AI"
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
