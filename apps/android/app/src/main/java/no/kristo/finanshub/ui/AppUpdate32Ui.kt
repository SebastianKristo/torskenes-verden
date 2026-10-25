package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import no.kristo.finanshub.AppUpd32
import no.kristo.finanshub.AppUpd32State
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.appUpd32OnHome
import no.kristo.finanshub.checkAppUpd32
import no.kristo.finanshub.hideAppUpd32
import no.kristo.finanshub.openUnknownSources32
import no.kristo.finanshub.resumeAppUpd32
import no.kristo.finanshub.retryAppUpd32
import no.kristo.finanshub.startAppUpd32

/*
 * Prompt 32 (APKUPD): oppdatering av selve appen. Logikken ligger i AppUpdate32.kt.
 *   AppUpd32Effects(vm)       sjekk ved oppstart (maks hver 6. time) og fortsett etter «Installer ukjente apper»
 *   AppUpdateBanner32(vm)     lite kort på Hjem (✕ skjuler «Ny versjon» i 24 t)
 *   AppUpdateRow32(vm)        PROGRAMVARE: «FinansHub-appen 4.23.0 · Ny 4.24.0 ›» og kortet under når noe skjer
 */

/** Usynlig: sjekker ved oppstart og fortsetter installasjonen når brukeren kommer tilbake fra innstillingene. */
@Composable
internal fun AppUpd32Effects(vm: AppViewModel) {
    LaunchedEffect(vm.base) { vm.checkAppUpd32() }
    val life: Lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(life) {
        val obs = LifecycleEventObserver { _, ev -> if (ev == Lifecycle.Event.ON_RESUME) vm.resumeAppUpd32() }
        life.addObserver(obs)
        onDispose { life.removeObserver(obs) }
    }
}

/** Banneret på Hjem. */
@Composable
internal fun AppUpdateBanner32(vm: AppViewModel, modifier: Modifier = Modifier) {
    if (!vm.appUpd32OnHome()) return
    val p = PaperPal.current
    Column(
        modifier.fillMaxWidth().shadow(14.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black.copy(alpha = .35f), spotColor = Color.Black.copy(alpha = .35f))
            .clip(RoundedCornerShape(22.dp)).background(p.card).padding(start = 16.dp, top = 14.dp, end = 14.dp, bottom = 14.dp),
    ) { AppUpdCard32(vm, home = true) }
}

/** PROGRAMVARE-raden (alle brukere) og kortet under den når det finnes en ny versjon eller noe pågår. */
@Composable
internal fun AppUpdateRow32(vm: AppViewModel) {
    AppUpd32Effects(vm)
    val p = PaperPal.current
    val s: AppUpd32State = AppUpd32.s
    val cur: String = s.current.ifBlank { "–" }
    val nv: String = s.latest?.version ?: ""
    val sub: String = when (s.phase) {
        "avail" -> "Ny $nv"
        "dl" -> "Laster ned $nv … ${s.pct} %"
        "perm" -> "Venter på tillatelse til å installere"
        "install" -> "Installerer $nv …"
        "failed" -> "Oppdateringen feilet"
        else -> if (s.loaded) "Siste versjon" else "Sjekker versjon …"
    }
    val busy: Boolean = s.phase != "none"
    Column {
        PRow("Homelab-appen $cur", sub, if (busy) "›" else if (s.loaded) "✓" else "›", if (busy) p.lab else p.pos, serif = false) {
            if (!busy) vm.checkAppUpd32(force = true)
        }
        if (busy) Column(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 14.dp)) { AppUpdCard32(vm, home = false) }
    }
}

/** Innholdet i kortet: tittel, tekst, fremdrift, «Hva er nytt» og knappene. */
@Composable
private fun AppUpdCard32(vm: AppViewModel, home: Boolean) {
    val p = PaperPal.current
    val s: AppUpd32State = AppUpd32.s
    val nv: String = s.latest?.version ?: "ny versjon"
    val title: String = when (s.phase) {
        "dl" -> "Laster ned $nv"
        "perm" -> "Tillat installasjon"
        "install" -> "Installerer $nv"
        "failed" -> "Oppdateringen feilet"
        else -> "Ny versjon av appen: $nv"
    }
    val text: String = when (s.phase) {
        "dl" -> "${s.pct} % · sjekksummen kontrolleres før installasjonen."
        "perm" -> "Android må tillate at Homelab installerer oppdateringer. Slå på «Installer ukjente apper» for Homelab, og gå tilbake hit."
        "install" -> "Bekreft i dialogen fra Android. Appen starter på nytt etterpå."
        "failed" -> s.error.ifBlank { "Noe gikk galt." }
        else -> s.error.ifBlank { "Du har ${s.current.ifBlank { "–" }}. Lastes ned via hjemmeserveren og installeres over den gamle." }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (home) Box(Modifier.size(40.dp).clip(CircleShape).background(if (s.phase == "failed") p.ink else p.lab), contentAlignment = Alignment.Center) {
                if (s.phase == "failed") Text("!", color = p.bg, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                else WxIcon(IC_DL30, p.onLab, 18.dp, stroke = 2.4f)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(title, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text(text, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, lineHeight = 17.sp)
            }
            if (home && s.phase == "avail") Box(
                Modifier.align(Alignment.Top).size(30.dp).clip(CircleShape).background(p.line)
                    .clickable(role = Role.Button, onClickLabel = "Skjul i 24 timer") { Haptics.dismiss(); vm.hideAppUpd32() },
                contentAlignment = Alignment.Center,
            ) { WxIcon(IC_X30, p.ink, 10.dp, stroke = 3.4f) }
        }
        if (s.phase == "dl") AppUpdBar32(s.pct)
        if (s.notesOpen && (s.phase == "avail" || s.phase == "failed")) AppUpdNotes32(s.latest?.notes ?: emptyList())
        when (s.phase) {
            "avail" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                SheetButton30("Last ned og installer", "primary", Modifier.weight(1f)) { vm.startAppUpd32() }
                SheetButton30(if (s.notesOpen) "Skjul" else "Hva er nytt", "secondary") { s.notesOpen = !s.notesOpen }
            }
            "perm" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                SheetButton30("Åpne innstillinger", "primary", Modifier.weight(1f)) { vm.openUnknownSources32() }
                SheetButton30("Avbryt", "secondary") { s.phase = "avail" }
            }
            "failed" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                SheetButton30("Prøv igjen", "primary", Modifier.weight(1f)) { vm.retryAppUpd32() }
                SheetButton30(if (s.notesOpen) "Skjul" else "Hva er nytt", "secondary") { s.notesOpen = !s.notesOpen }
            }
            else -> {}
        }
    }
}

@Composable
private fun AppUpdBar32(pct: Int) {
    val p = PaperPal.current
    val f: Float = (pct.coerceIn(0, 100) / 100f).coerceAtLeast(.02f)
    Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(p.line)) {
        Box(Modifier.fillMaxWidth(f).height(6.dp).clip(RoundedCornerShape(3.dp)).background(p.lab))
    }
}

@Composable
private fun AppUpdNotes32(notes: List<String>) {
    val p = PaperPal.current
    val list: List<String> = notes.ifEmpty { listOf("Feilrettinger og forbedringer.") }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.bg).padding(12.dp, 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        list.take(20).forEach { n ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("•", color = p.lab, fontSize = 13.sp)
                Text(n, color = p.ink, fontFamily = PaperFonts.sans, fontSize = 13.sp, lineHeight = 18.sp)
            }
        }
    }
}
