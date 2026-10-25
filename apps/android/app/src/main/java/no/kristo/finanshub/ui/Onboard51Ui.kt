package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 51 (ANDFEAT51): onboarding-veiviseren for nye familiemedlemmer (Onboard51.kt). Knappen «Jeg har en invitasjon» ligger
 * på innloggingen (PaperLogin), veiviseren legger seg over den: 1 Skann/lim inn → 2 Om deg (navn, brukernavn, passord) →
 * 3 Deling (posisjon, helse, kalender) → logget inn.
 */

@Composable
internal fun Join51Button() {
    val p = PaperPal.current
    Row(
        Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(25.dp)).border(1.dp, p.line, RoundedCornerShape(25.dp))
            .clickable(role = Role.Button) { Haptics.tap(); Join51.reset(); Join51.open = true }.padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) { Text("Jeg har en invitasjon", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp) }
}

@Composable
internal fun Join51Screen(vm: AppViewModel) {
    if (!Join51.open) return
    val p = PaperPal.current
    val j = Join51
    BackHandler {
        when (j.step) { "share" -> j.step = "about"; "about" -> { j.step = "scan"; j.err = null }; else -> j.open = false }
    }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}, contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.fillMaxHeight().widthIn(max = 560.dp).fillMaxWidth().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().imePadding()
                .padding(26.dp, 18.dp, 26.dp, 30.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("‹ Avbryt", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 15.sp,
                modifier = Modifier.heightIn(min = 48.dp).clickable(role = Role.Button) { j.open = false }.padding(vertical = 12.dp))
            val n = when (j.step) { "about" -> 2; "share" -> 3; else -> 1 }
            PLabel("Steg $n av 3 · Ny i familien")
            when (j.step) {
                "about" -> About51(vm)
                "share" -> Share51(vm)
                else -> Scan51(vm)
            }
            j.err?.let { Text(it, color = p.lab, fontSize = 14.sp, fontWeight = FontWeight.SemiBold) }
            if (j.busy) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CircularProgressIndicator(Modifier.size(20.dp), color = p.lab, strokeWidth = 2.dp)
                Text(if (j.step == "share") "Lager kontoen …" else "Sjekker invitasjonen …", color = p.mut, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun Scan51(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    PSerif("Velkommen!", 36.sp, modifier = Modifier.semantics { heading() })
    Text("Skann QR-koden du har fått, eller lim inn invitasjonslenken. Den gjelder bare én gang.", color = p.ink, fontSize = 15.sp)
    PButton("Skann QR-kode", Modifier.fillMaxWidth(), height = 54.dp) {
        QrScan46.start(ctx, onRaw = { raw -> vm.previewJoin51(raw) }, onMsg = { m -> Join51.err = m })
    }
    PField("Eller lim inn lenken", Join51.link, { Join51.link = it.trim() }, placeholder = "papir://join?… eller https://…/join/…",
        keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Go),
        onDone = { if (Join51.link.isNotBlank() && !Join51.busy) vm.previewJoin51(Join51.link) })
    PButton("Fortsett", Modifier.fillMaxWidth(), kind = "line", height = 50.dp) { if (Join51.link.isNotBlank() && !Join51.busy) vm.previewJoin51(Join51.link) }
    Text("QR-koden inneholder ingen innlogging – bare en engangskode og adressen til hjemmeserveren.", color = p.mut, fontSize = 12.5.sp)
}

@Composable
private fun About51(vm: AppViewModel) {
    val p = PaperPal.current
    val pv = Join51.preview
    val by = pv?.optString("invitedBy")?.takeIf { it.isNotBlank() && it != "null" }
    val srv = pv?.optString("serverName")?.takeIf { it.isNotBlank() && it != "null" } ?: Join51.server.substringAfter("://")
    PSerif("Om deg", 36.sp, modifier = Modifier.semantics { heading() })
    Text((by?.let { "$it har invitert deg til $srv." } ?: "Du er invitert til $srv.") + " Velg hva du vil hete og et passord.", color = p.ink, fontSize = 15.sp)
    PField("Navn", Join51.name, { Join51.name = it.take(60) }, placeholder = "Fornavn Etternavn", keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next))
    PField("Brukernavn", Join51.username, { Join51.username = it.trim().take(40) }, placeholder = "ingrid",
        keyboard = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Next))
    PField("Passord (minst 8 tegn)", Join51.password, { Join51.password = it }, password = true, keyboard = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next))
    PField("Gjenta passordet", Join51.password2, { Join51.password2 = it }, password = true, keyboard = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done))
    PButton("Neste", Modifier.fillMaxWidth(), height = 54.dp) {
        val j = Join51
        j.err = when {
            j.name.isBlank() -> "Skriv navnet ditt."
            !Regex("^[A-Za-z0-9._-]{2,40}$").matches(j.username) -> "Brukernavnet kan ha bokstaver (a–z), tall, punktum og bindestrek."
            j.password.length < 8 -> "Passordet må ha minst 8 tegn."
            j.password != j.password2 -> "Passordene er ikke like."
            else -> null
        }
        if (j.err == null) j.step = "share"
    }
}

@Composable
private fun Share51(vm: AppViewModel) {
    val p = PaperPal.current
    PSerif("Hva vil du dele?", 36.sp, modifier = Modifier.semantics { heading() })
    Text("Bare med familien på denne serveren. Du kan endre det når som helst i Familie og Innstillinger.", color = p.ink, fontSize = 15.sp)
    PCard {
        PToggle("Posisjon", "Familien ser hvor du er på kartet, og du kan sjekke inn", Join51.shareLocation) { Join51.shareLocation = it; if (!it) Join51.shareHealth = false }
        // Familie har én delingsbryter: helse deles bare sammen med posisjon (WEBX51).
        PToggle("Helse", if (Join51.shareLocation) "Skritt, hvilepuls, søvn og aktive kalorier" else "Helse deles sammen med posisjon", Join51.shareHealth && Join51.shareLocation, top = true) {
            Join51.shareHealth = it; if (it) Join51.shareLocation = true
        }
        PToggle("Kalender", "Familiekalenderen og «opptatt» i Kalender", Join51.shareCalendar, top = true) { Join51.shareCalendar = it }
    }
    PButton(if (Join51.busy) "Lager kontoen …" else "Ferdig – logg inn", Modifier.fillMaxWidth(), height = 54.dp) { vm.acceptJoin51() }
    Text("‹ Tilbake", color = p.lab, fontWeight = FontWeight.SemiBold, modifier = Modifier.heightIn(min = 48.dp).clickable { Join51.step = "about" }.padding(vertical = 12.dp))
}
