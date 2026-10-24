package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Prompt 51 (APPAND51): skjermene for Sec51.kt, Qa51.kt og Ntfy51.kt.
 *  - ApprovalWait51: «Venter på godkjenning» over innloggingen (PaperLogin) mens en ny enhet venter. Viser aldri token eller pollKey.
 *  - Sec51Section: Innstillinger → Sikkerhet → Enheter som venter (Godkjenn med biometri / Avvis) og Mine enheter.
 *  - Ntfy51Section: Innstillinger → Varsler → «Varsler via ntfy (hjemmeserver)».
 *  - Overlays51: etter innlogging – laster flagg/«Nytt»/ventende enheter per konto, banner «Ny enhet vil logge inn» og kortet
 *    «Nytt i denne versjonen».
 */

private val nb51 = Locale("nb", "NO")

/** ISO-tid → «14:05» i dag, ellers «3. okt. 14:05». */
internal fun time51(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val t = runCatching { Instant.parse(iso) }.getOrNull() ?: runCatching { java.time.OffsetDateTime.parse(iso).toInstant() }.getOrNull() ?: return ""
    val z = t.atZone(ZoneId.systemDefault())
    val today = z.toLocalDate() == java.time.LocalDate.now()
    return z.format(DateTimeFormatter.ofPattern(if (today) "HH:mm" else "d. MMM HH:mm", nb51))
}

/* ---------------- Venter på godkjenning ---------------- */

@Composable
internal fun ApprovalWait51(vm: AppViewModel) {
    val w = vm.sec51.wait ?: return
    val p = PaperPal.current
    BackHandler { vm.cancelApproval51() }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(enabled = false) {}) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(26.dp, 40.dp, 26.dp, 30.dp)
                .widthIn(max = 520.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            PLabel("Homelab · ${w.server.substringAfter("://")}")
            PSerif(when (w.state) { "denied" -> "Innloggingen\nble avvist"; "expired" -> "Forespørselen\ner utløpt"; "error" -> "Noe gikk galt"; else -> "Venter på\ngodkjenning" }, 36.sp)
            when (w.state) {
                "pending" -> {
                    Text("Denne telefonen er ikke brukt med kontoen før, og innloggingen kommer fra internett. Den må derfor godkjennes.", color = p.ink, fontSize = 15.sp)
                    PCard {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Step51("1", "Åpne Homelab på en enhet som allerede er logget inn (telefon, nettbrett eller PC).")
                            Step51("2", "Trykk på varselet «Ny enhet vil logge inn», eller gå til Innstillinger → Sikkerhet.")
                            Step51("3", "Godkjenn. Denne skjermen fortsetter av seg selv.")
                        }
                    }
                    Text("Eller logg inn hjemme på det lokale nettet – da trengs ingen godkjenning.", color = p.mut, fontSize = 13.5.sp)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        CircularProgressIndicator(Modifier.size(20.dp), color = p.lab, strokeWidth = 2.dp)
                        Column {
                            Text(w.note ?: "Venter …", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            val sub = listOfNotNull(w.device.takeIf { it.isNotBlank() }, time51(w.expiresAt).takeIf { it.isNotBlank() }?.let { "gyldig til $it" }).joinToString(" · ")
                            if (sub.isNotBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp)
                        }
                    }
                    PButton("Avbryt", Modifier.fillMaxWidth(), kind = "line", height = 52.dp) { vm.cancelApproval51() }
                }
                else -> {
                    Text(when (w.state) {
                        "denied" -> "Innloggingen fra denne telefonen ble avvist fra en annen enhet. Var det deg, kan du prøve igjen og godkjenne den."
                        "expired" -> "Ingen godkjente innloggingen innen 15 minutter. Prøv igjen."
                        else -> w.note ?: "Prøv igjen."
                    }, color = p.ink, fontSize = 15.sp)
                    PButton("Tilbake til innlogging", Modifier.fillMaxWidth(), height = 52.dp) { vm.retryApproval51() }
                }
            }
        }
    }
}

@Composable
private fun Step51(n: String, text: String) {
    val p = PaperPal.current
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(22.dp).clip(RoundedCornerShape(11.dp)).background(p.ink), contentAlignment = Alignment.Center) { Text(n, color = p.bg, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        Text(text, color = p.ink, fontSize = 14.sp, modifier = Modifier.weight(1f))
    }
}

/* ---------------- Innstillinger → Sikkerhet ---------------- */

@Composable
internal fun Sec51Section(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.sec51
    LaunchedEffect(vm.activeId) { vm.loadApprovals51(); vm.loadDevices51() }
    Column(Modifier.fillMaxWidth().padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Enheter som venter", modifier = Modifier.padding(start = 4.dp))
        val pend = s.approvals?.filter { it.state == "pending" }
        PCard {
            when {
                pend == null -> Text("Henter …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
                pend.isEmpty() -> Text("Ingen enheter venter på godkjenning.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
                else -> pend.forEachIndexed { i, a ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(a.device, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                        val sub = listOf(a.userName, a.methodLabel, a.countryOrIp(), time51(a.createdAt)).filter { it.isNotBlank() }.joinToString(" · ")
                        if (sub.isNotBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            val busy = s.busy == a.id
                            PButton(if (busy) "…" else "Godkjenn", Modifier.weight(1f)) {
                                if (busy) return@PButton
                                Bio31.confirm(ctx, "Godkjenn ny enhet", a.device, onOk = { vm.decideApproval51(a.id, true) },
                                    onFail = { vm.message = "Godkjenning krever fingeravtrykk, ansikt eller PIN. Slå på skjermlås, eller godkjenn fra web." })
                            }
                            PButton("Avvis", Modifier.weight(1f), kind = "line") { if (!busy) vm.decideApproval51(a.id, false) }
                        }
                    }
                }
            }
        }
        s.error?.let { Text(it, color = p.lab, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp)) }
        Text("Når noen logger inn fra internett på en ny enhet, må det godkjennes her (eller på web). Kjenner du ikke igjen enheten, trykk Avvis og bytt passord.",
            color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))

        val devs = s.devices
        if (!devs.isNullOrEmpty()) {
            PLabel("Mine enheter", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
            PCard {
                devs.forEachIndexed { i, d ->
                    val sub = listOf(if (d.current) "Denne enheten" else "", if (d.approved) "godkjent" + (d.approvedByName.takeIf { it.isNotBlank() }?.let { " av $it" } ?: "") else "ikke godkjent",
                        d.lastCountry, time51(d.lastSeen).takeIf { it.isNotBlank() }?.let { "sist $it" } ?: "").filter { it.isNotBlank() }.joinToString(" · ")
                    PRow(d.name, sub, value = if (d.current) "" else if (s.busy == d.id) "…" else "Fjern", valueColor = p.lab, serif = false, top = i > 0,
                        onClick = if (d.current) null else ({ if (s.busy == null) vm.removeDevice51(d.id) }))
                }
            }
        }
    }
}

/* ---------------- Innstillinger → Varsler → ntfy ---------------- */

@Composable
internal fun Ntfy51Section(vm: AppViewModel) {
    val p = PaperPal.current
    val n = vm.ntfy51
    LaunchedEffect(vm.activeId) { vm.loadNtfy51() }
    Column(Modifier.fillMaxWidth().padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("ntfy", modifier = Modifier.padding(start = 4.dp))
        PCard {
            PToggle("Varsler via ntfy (hjemmeserver)", if (n.busy) "Kobler til …" else if (n.on) Ntfy51.status else "Av – varslene hentes hvert 15. minutt som før", n.on) { on -> vm.setNtfy51(on) }
            if (n.on) PRow("Send testvarsel", null, value = "Test ›", valueColor = p.lab, serif = false, top = true) { vm.testNtfy51() }
        }
        n.error?.let { Text(it, color = p.lab, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp)) }
        Text(
            "Varslene kommer med en gang via din egen ntfy-server på hjemmenettet. Appen holder en tilkobling i bakgrunnen og viser et lite, varig varsel. " +
                "Med strømsparing på hentes varslene hvert 15. minutt i stedet. Utenfor hjemmenettet (uten VPN) kommer varslene som før." +
                (if (n.serverEnabled == false) "\n\n" + (n.help ?: "ntfy er ikke satt opp på serveren.") else ""),
            color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp),
        )
    }
}

/* ---------------- Etter innlogging: banner og «Nytt i denne versjonen» ---------------- */

@Composable
internal fun Overlays51(vm: AppViewModel) {
    if (!vm.loggedIn) return
    LaunchedEffect(vm.activeId) { vm.refresh51(force = true) }
    val p = PaperPal.current
    val pend = vm.sec51.approvals?.filter { it.state == "pending" && it.id !in vm.sec51.dismissed }.orEmpty()
    Box(Modifier.fillMaxSize()) {
        if (pend.isNotEmpty() && !(vm.settingsPage == "security")) {
            val a = pend.first()
            Column(
                Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(12.dp, 8.dp).widthIn(max = 560.dp).fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp)).background(p.ink).padding(14.dp, 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(if (pend.size > 1) "${pend.size} nye enheter vil logge inn" else "Ny enhet vil logge inn", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                Text(listOf(a.device, a.countryOrIp(), time51(a.createdAt)).filter { it.isNotBlank() }.joinToString(" · "), color = p.bg.copy(alpha = .8f), fontSize = 12.5.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("Se forespørselen", color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp,
                        modifier = Modifier.clickable { vm.deepLink(android.net.Uri.parse("finanshub://settings/security")) })
                    Text("Senere", color = p.bg.copy(alpha = .7f), fontSize = 13.5.sp,
                        modifier = Modifier.clickable { vm.sec51.dismissed = vm.sec51.dismissed + pend.map { it.id } })
                }
            }
        }
        vm.qa51.whatsNew?.let { w -> WhatsNew51Card(w) { vm.closeWhatsNew51() } }
    }
}

@Composable
private fun WhatsNew51Card(w: WhatsNew51, onClose: () -> Unit) {
    val p = PaperPal.current
    BackHandler { onClose() }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .45f)).clickable(onClick = onClose), contentAlignment = Alignment.BottomCenter) {
        Column(
            Modifier.widthIn(max = 560.dp).fillMaxWidth().navigationBarsPadding().padding(12.dp).clip(RoundedCornerShape(24.dp)).background(p.bg)
                .clickable(enabled = false) {}.heightIn(max = 560.dp).verticalScroll(rememberScrollState()).padding(22.dp, 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PLabel("Nytt i denne versjonen · ${w.version}")
            PSerif(w.title, 26.sp)
            w.items.forEach { t ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("•", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text(t, color = p.ink, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
                }
            }
            PButton("Fint", Modifier.fillMaxWidth().padding(top = 6.dp), height = 50.dp, onClick = onClose)
        }
    }
}
