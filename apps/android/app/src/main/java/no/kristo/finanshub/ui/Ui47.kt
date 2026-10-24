package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 47 (ANDROID47): Innstillinger → Server (claude-code-standard-serveradresser.md) og arket for kvitteringer lest med
 * ML Kit på telefonen (claude-code-android-kvittering-mlkit-ocr.md). Logikken ligger i P47.kt og ReceiptOcr47.kt.
 */

/** Globalt (Paper.kt): standardverdier fra /api/config etter innlogging, og ML Kit-arket. */
@Composable
internal fun Global47(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) { if (vm.account != null) vm.loadConfig47() }
    if (vm.p47.scan != ReceiptScanUiState47.Idle) ReceiptSheet47(vm)
}

/* ======================= Innstillinger → Server ======================= */

/** Konto-siden: én rad som åpner Innstillinger → Server (erstatter den gamle SERVER-blokken). */
@Composable
internal fun ServerLink47(vm: AppViewModel) {
    val a = vm.account ?: return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Server", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PRow("Server og synk", "Lokal og ekstern adresse · nå: ${vm.route}", (a.external.ifBlank { a.server }).substringAfter("://").trimEnd('/') + " ›", serif = false) {
                vm.settingsPage = "server"
            }
        }
    }
}

@Composable
internal fun ServerPage47(vm: AppViewModel) {
    val p = PaperPal.current
    val s41 = vm.p41
    val s = vm.p47
    val a = vm.account
    LaunchedEffect(a?.id) { vm.loadServer41() }
    if (a == null) { Text("Logg inn for å endre serveradressene.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp)); return }
    val srv = s41.srv ?: Srv41(a.local, a.external.ifBlank { a.server }, vm.flag(AppPrefs.USE_LOCAL, true))
    var ext by remember(srv.external) { mutableStateOf(srv.external.ifBlank { s.defExternal }) }
    var loc by remember(srv.local) { mutableStateOf(srv.local.ifBlank { s.defLocal }) }
    LaunchedEffect(srv.local, srv.external) { vm.probe47("external", ext); vm.probe47("local", loc) }
    val dirty = ext.trim() != srv.external || loc.trim() != srv.local
    Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PLabel("Server", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        PCard {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                AddrField47(vm, "external", "Ekstern adresse", ext, s.defExternal) { ext = it }
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                AddrField47(vm, "local", "Lokal adresse", loc, s.defLocal) { loc = it }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton("Tilbakestill til standard", Modifier.weight(1f), kind = "line") { ext = s.defExternal; loc = s.defLocal; vm.resetServer47() }
            PButton(if (dirty) "Lagre" else "Lagret", Modifier.weight(1f)) {
                if (cleartextBlocked47(ext) || cleartextBlocked47(loc)) vm.message = "Android tillater bare http:// til ${hostOf47(DEFAULT_LOCAL47)}. Bruk https://."
                else if (dirty) vm.saveServer41(loc, ext, srv.auto)
            }
        }
        PCard {
            PToggle("Bytt automatisk", "Lokal når den svarer innen 1,5 s, ellers ekstern · nå: ${vm.route}", srv.auto) { vm.saveServer41(srv.local, srv.external, it) }
        }
        Text(
            "Lagres på kontoen din og synkes til dine andre enheter og Kalender-appen. Hjemme på Wi-Fi brukes den lokale adressen, ellers den eksterne.",
            color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp),
        )
    }
}

@Composable
private fun AddrField47(vm: AppViewModel, which: String, label: String, value: String, def: String, onChange: (String) -> Unit) {
    val p = PaperPal.current
    val st = vm.p47.status[which]
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PField(label, value, { onChange(it.trim()) }, placeholder = def, keyboard = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(when (st?.ok) { true -> p.pos; false -> p.lab; null -> p.line }))
            Text(
                when {
                    st == null -> "Ikke testet"
                    st.ok == null -> "Tester …"
                    st.ok -> "Svarer · ${st.ms} ms"
                    else -> st.note ?: "Svarer ikke"
                },
                color = when (st?.ok) { true -> p.pos; false -> p.lab; null -> p.mut }, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, modifier = Modifier.weight(1f), maxLines = 2,
            )
            Box(
                Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(p.card).clickable(role = Role.Button) { Haptics.select(); vm.probe47(which, value) }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Test", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1) }
        }
    }
}

/* ======================= Kvittering lest på telefonen (ML Kit) ======================= */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReceiptSheet47(vm: AppViewModel) {
    val p = PaperPal.current
    val st = vm.p47.scan
    ModalBottomSheet(
        onDismissRequest = { vm.closeOcr47() }, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) },
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 18.dp, end = 18.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("Kvittering", 24.sp, maxLines = 1)
            when (st) {
                ReceiptScanUiState47.Idle -> Unit
                ReceiptScanUiState47.Scanning -> Busy47("Leser teksten på telefonen …")
                ReceiptScanUiState47.Uploading -> Busy47("Glimt tolker kvitteringen …")
                is ReceiptScanUiState47.TextReady -> {
                    Text("Lest på telefonen med ML Kit. Bare teksten sendes til serveren.", color = p.mut, fontSize = 12.5.sp)
                    OcrPreview47(st.ocr.text)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PButton("Last opp bildet", Modifier.weight(1f), kind = "line") { vm.uploadInstead47() }
                        PButton("Send til Glimt", Modifier.weight(1f)) { vm.sendOcr47(st.ocr) }
                    }
                }
                is ReceiptScanUiState47.Parsed -> {
                    Text(listOfNotNull(st.merchant, st.total?.let { kr47(it) }).joinToString(" · ").ifBlank { "Sendt til Glimt" }, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Text(if (st.review) "Glimt tolker teksten nå. Kvitteringen havner i «Til gjennomgang»." else "Kvitteringen er lagret.", color = p.mut, fontSize = 13.sp)
                    PButton("Ferdig", Modifier.fillMaxWidth()) { vm.closeOcr47() }
                }
                is ReceiptScanUiState47.Error -> {
                    Text(st.message, color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
                    st.ocr?.let { OcrPreview47(it.text) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PButton("Last opp bildet", Modifier.weight(1f), kind = "line") { vm.uploadInstead47() }
                        val o = st.ocr
                        if (o != null) PButton("Prøv igjen", Modifier.weight(1f)) { vm.sendOcr47(o) }
                        else PButton("Lukk", Modifier.weight(1f)) { vm.closeOcr47() }
                    }
                }
            }
        }
    }
}

@Composable
private fun Busy47(text: String) {
    val p = PaperPal.current
    Text(text, color = p.mut, fontSize = 13.sp)
    LinearProgressIndicator(Modifier.fillMaxWidth(), color = p.ink, trackColor = p.line)
}

@Composable
private fun OcrPreview47(text: String) {
    val p = PaperPal.current
    Box(Modifier.fillMaxWidth().heightIn(max = 320.dp).clip(RoundedCornerShape(16.dp)).background(p.card)) {
        Text(
            text.replace("\t", "    "), color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp, lineHeight = 16.sp,
            modifier = Modifier.verticalScroll(rememberScrollState()).padding(12.dp),
        )
    }
}

private fun kr47(v: Double): String = String.format(java.util.Locale("nb", "NO"), "%,.2f", v).removeSuffix(",00") + " kr"
