package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import no.kristo.felles.nett.LokaltNett
import no.kristo.finanshub.*

/* ======================= Konto → SERVER ======================= */

@Composable
internal fun Server41(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p41
    LaunchedEffect(vm.account?.id) { vm.loadServer41() }
    val a = vm.account ?: return
    val srv = s.srv ?: Srv41(a.local, a.external.ifBlank { a.server }, vm.flag(AppPrefs.USE_LOCAL, true))
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Server", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PRow("Lokal adresse", "Brukes når du er hjemme på Wi-Fi", srv.local.ifBlank { DEFAULT_LOCAL47 }.removePrefix("http://").removePrefix("https://") + " ›", serif = false) { s.srvTest = null; s.srvSheet = "local" }
            PRow("Ekstern adresse", "Når du er borte", srv.external.ifBlank { DEFAULT_SERVER41 }.removePrefix("https://").removePrefix("http://") + " ›", serif = false, top = true) { s.srvTest = null; s.srvSheet = "external" }
            PToggle("Bytt automatisk", "Lokal når den svarer raskt, ellers ekstern · nå: ${vm.route}", srv.auto, top = true) { vm.saveServer41(srv.local, srv.external, it) }
        }
        Text("Lagres på kontoen din og brukes også av Kalender-appen.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
internal fun ServerSheet41(vm: AppViewModel, which: String) {
    val p = PaperPal.current
    val s = vm.p41
    val a = vm.account
    val srv = s.srv ?: Srv41(a?.local.orEmpty(), a?.external?.ifBlank { a.server }.orEmpty(), true)
    var v by remember(which) { mutableStateOf(if (which == "local") srv.local else srv.external.ifBlank { DEFAULT_SERVER41 }) }
    Sheet41({ s.srvSheet = null; s.srvTest = null }) {
        PSerif(if (which == "local") "Lokal adresse" else "Ekstern adresse", 24.sp)
        Text(if (which == "local") "Standard: $DEFAULT_LOCAL47. Brukes når du er hjemme på Wi-Fi." else "Standard: $DEFAULT_EXTERNAL47.", color = p.mut, fontSize = 13.sp)
        PField("Adresse", v, { v = it.trim() }, placeholder = if (which == "local") DEFAULT_LOCAL47 else DEFAULT_SERVER41,
            keyboard = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false))
        s.srvTest?.let { Text(it, color = if (s.srvTestOk) p.pos else p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton(if (s.srvBusy) "Tester …" else "Test", Modifier.weight(1f), kind = "line") { vm.testServer41(v) }
            PButton("Lagre", Modifier.weight(1f)) {
                if (which == "local") vm.saveServer41(v, srv.external, srv.auto) else vm.saveServer41(srv.local, v, srv.auto)
            }
        }
    }
}

/** Innlogging: «Får ikke kontakt med Homelab» + «Prøv igjen» og «Endre serveradresse» (serverfeltet vises ikke som standard). */
@Composable
internal fun LoginNoContact41(onRetry: () -> Unit, onEdit: () -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Får ikke kontakt med Homelab", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Text("Sjekk nettet, eller bruk en annen adresse.", color = p.mut, fontSize = 13.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Prøv igjen", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, modifier = Modifier.clickable(role = Role.Button, onClick = onRetry).padding(vertical = 4.dp))
            Text("Endre serveradresse", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.clickable(role = Role.Button, onClick = onEdit).padding(vertical = 4.dp))
        }
    }
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
                if (cleartextBlocked47(ext) || cleartextBlocked47(loc)) vm.message = LokaltNett.MSG
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
