@file:JvmName("DomeneDrift")

package no.kristo.finanshub.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.doneUpd30
import no.kristo.finanshub.hideUpd30
import no.kristo.finanshub.loadLatestNotes36
import no.kristo.finanshub.openCustomTab24
import no.kristo.finanshub.openNordlys31
import no.kristo.finanshub.runUpd30
import no.kristo.finanshub.setUpdSetting30
import no.kristo.finanshub.startUpd31
import no.kristo.finanshub.upd30OnHome

/*
 * Drift (serveroppdatering, backup, logger og versjoner): kode som lå i blandingsfilene (Ui30.kt, Ui36.kt, Ui44.kt, Ui46.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Oppdateringsbanneret ======================= */

/** Skal banneret tegnes her? Hjem: ✕ skjuler «Tilgjengelig» i 24 t. Innstillinger: alltid når det finnes noe å vise. */
internal fun upd30Show(vm: AppViewModel, home: Boolean): Boolean {
    val u = vm.p30.upd
    if (!vm.userIsAdmin) return false
    return if (home) vm.upd30OnHome() else u.loaded && u.phase != "none"
}

/** Kortet: Tilgjengelig · Oppdaterer (fremdrift og steg) · Ferdig · Feilet (Prøv igjen og Gjenopprett). */
@Composable
internal fun UpdateBanner30(vm: AppViewModel, home: Boolean, modifier: Modifier = Modifier) {
    val p = PaperPal.current
    val u = vm.p30.upd
    if (!(if (home) vm.upd30OnHome() else u.loaded && u.phase != "none")) return
    val phase = u.phase
    val cur = u.current.ifBlank { "–" }
    val nv = u.latest.ifBlank { "ny versjon" }
    val title: String = when (phase) {
        "done" -> if (u.action == "rollback") "Gjenopprettet $cur" else "Oppdatert til Nordlys $cur"
        "run" -> if (vm.p46.updStuck) "Oppdateringen står fast" else if (u.action == "rollback") "Gjenoppretter forrige versjon" else "Oppdaterer Nordlys OS"
        "failed" -> "Oppdateringen feilet"
        else -> "Nordlys $nv er klar"
    }
    val sub: String = when (phase) {
        "done" -> "Alt kjører. Endringene er aktive i appen og på web."
        "run" -> if (u.lost) "Mistet forbindelsen mens serveren starter på nytt. Prøver igjen …" else "Du kan bruke appen mens den oppdateres."
        "failed" -> u.error.ifBlank { "Noe gikk galt under oppdateringen." }
        else -> "Du har $cur. Oppdaterer hjemmeserveren, web og appen."
    }
    val ctx = LocalContext.current
    Column(
        modifier.fillMaxWidth().shadow(14.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black.copy(alpha = .35f), spotColor = Color.Black.copy(alpha = .35f))
            .clip(RoundedCornerShape(22.dp)).background(p.card)
            // Prompt 31: trykk hvor som helst på kortet åpner System-siden (knappene beholder egen handling).
            .clickable(role = Role.Button, onClickLabel = "Åpne System") { vm.openNordlys31() }
            .padding(start = 16.dp, top = 14.dp, end = 14.dp, bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(if (phase == "failed") p.ink else p.lab), contentAlignment = Alignment.Center) {
                when (phase) {
                    "done" -> WxIcon(IC_CHECK30, p.onLab, 18.dp, stroke = 2.8f)
                    "failed" -> Text("!", color = p.bg, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                    else -> WxIcon(IC_DL30, p.onLab, 18.dp, stroke = 2.4f)
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(title, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text(sub, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, lineHeight = 17.sp)
            }
            if (home && phase == "avail") Box(
                Modifier.align(Alignment.Top).size(30.dp).clip(CircleShape).background(p.line)
                    .clickable(role = Role.Button, onClickLabel = "Skjul") { Haptics.dismiss(); vm.hideUpd30() },
                contentAlignment = Alignment.Center,
            ) { WxIcon(IC_X30, p.ink, 10.dp, stroke = 3.4f) }
        }
        // Prompt 36: snekker-Glimt på fremdriftslinja (36–44 dp luft over linja).
        if (phase == "run") Column { Carp36(vm, u.pct, 28.dp); UpdProgress30(u.pct, u.stepText.ifBlank { "Starter …" }) }
        if (phase == "run" && vm.p46.updStuck) UpdStuck46(vm) // prompt 46: watchdog «Står fast»
        if (phase == "avail" && u.notesOpen) Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.bg).padding(12.dp, 10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            LaunchedEffect(u.latest) { vm.loadLatestNotes36(u.latest) }
            val notes = u.notes.ifEmpty { vm.p36.latestNotes }.ifEmpty { listOf("Feilrettinger og forbedringer.") }
            notes.forEach { n ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("•", color = p.lab, fontSize = 13.sp)
                    Text(n, color = p.ink, fontFamily = PaperFonts.sans, fontSize = 13.sp, lineHeight = 18.sp)
                }
            }
            // Prompt 36: «Hva er nytt» viser bare den nye versjonen; resten ligger på Nordlys-siden.
            Text("Tidligere versjoner ›", color = p.lab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { vm.openNordlys31() }.padding(vertical = 4.dp))
        }
        when (phase) {
            "avail" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                UpdPill30("Oppdater nå", true, Modifier.weight(1f)) { vm.startUpd31(ctx, "start") }
                UpdPill30(if (u.notesOpen) "Skjul" else "Hva er nytt", false) { u.notesOpen = !u.notesOpen; Haptics.select() }
            }
            "done" -> UpdPill30("Ferdig", true, Modifier.fillMaxWidth()) { vm.doneUpd30() }
            "failed" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                UpdPill30("Prøv igjen", true, Modifier.weight(1f)) { vm.startUpd31(ctx, u.action) }
                UpdPill30("Gjenopprett $cur", false, Modifier.weight(1f)) { vm.startUpd31(ctx, "rollback") }
            }
            else -> {}
        }
    }
}

@Composable
private fun UpdProgress30(pct: Int, step: String) {
    val p = PaperPal.current
    val f by animateFloatAsState(pct.coerceIn(0, 100) / 100f, tween(400), label = "upd30")
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(p.line)) {
            Box(Modifier.fillMaxWidth(f).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(p.lab))
        }
        Row(Modifier.fillMaxWidth()) {
            Text(step, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1)
            Text("$pct %", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp)
        }
    }
}

@Composable
private fun UpdPill30(text: String, primary: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        modifier.height(40.dp).clip(RoundedCornerShape(20.dp)).background(if (primary) p.ink else p.line)
            .clickable(role = Role.Button) { onClick() }.padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (primary) p.bg else p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1) }
}

/** Passordet på nytt før oppdatering eller gjenoppretting (samme sperre mot gjentatte forsøk som innlogging). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun UpdPwSheet30(vm: AppViewModel) {
    val p = PaperPal.current
    val u = vm.p30.upd
    val action = u.pwFor ?: return
    val ctx = LocalContext.current
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var pw by remember(action) { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    LaunchedEffect(action) { runCatching { focus.requestFocus() } }
    val close = { if (!u.pwBusy) { u.pwFor = null; Haptics.dismiss() } }
    val rollback = action == "rollback"
    ModalBottomSheet(
        onDismissRequest = close, sheetState = state, containerColor = p.bg, contentColor = p.ink,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) },
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                PSerif(if (rollback) "Gjenopprett ${u.current.ifBlank { "forrige versjon" }}" else "Oppdater Homelab", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Avbryt", "secondary", onClick = close)
            }
            Text(
                if (rollback) "Forrige vellykkede versjon lastes ned og startes på nytt. Dataene dine beholdes – backupen fra før oppdateringen gjenopprettes ikke automatisk."
                else "Serveren tar backup av databasen, laster ned ${u.latest.ifBlank { "ny versjon" }} og starter på nytt (vanligvis 2–5 minutter). Du kan bruke appen imens.",
                color = p.mut, fontFamily = PaperFonts.sans, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(horizontal = 4.dp),
            )
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(16.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Passord", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp)
                BasicTextField(
                    pw, { pw = it; u.pwErr = "" }, singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 17.sp, fontFamily = PaperFonts.sans),
                    cursorBrush = SolidColor(p.lab), visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { vm.runUpd30(pw) }),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 30.dp).focusRequester(focus),
                )
            }
            if (u.pwErr.isNotBlank()) Text(u.pwErr, color = p.lab, fontFamily = PaperFonts.sans, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(horizontal = 4.dp))
            PButton(if (u.pwBusy) "Starter …" else if (rollback) "Gjenopprett" else "Oppdater nå", Modifier.fillMaxWidth(), height = 48.dp) { if (!u.pwBusy) vm.runUpd30(pw) }
            Text(
                "Oppdater i nettleseren ›", color = p.mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                modifier = Modifier.align(Alignment.CenterHorizontally).clickable(role = Role.Button) { openCustomTab24(ctx, upd28WebUrl(vm)) }.padding(8.dp),
            )
        }
    }
}

/** PROGRAMVARE: «Homelab 2.3.1 · Ny versjon 2.4.0 er klar» → «Oppdater ›», og bryterne for auto og varsler. */
@Composable
internal fun Programvare30(vm: AppViewModel) {
    val p = PaperPal.current
    val u = vm.p30.upd
    val avail = u.phase == "avail" || (u.available && u.phase == "none")
    val ver = if (u.phase == "done") u.latest.ifBlank { u.current } else u.current
    Column {
        // Prompt 31: navigasjonsrad til System-siden («Nordlys OS 4.22.0 ›», «Oppdater» i rødt når ny versjon finnes).
        PRow(
            "Nordlys OS ${ver.ifBlank { "–" }}",
            when {
                !u.loaded -> if (u.missing) "Serveren har ikke denne funksjonen ennå" else "Henter versjon …"
                u.phase == "run" -> "Oppdaterer …"
                u.phase == "failed" -> "Oppdateringen feilet"
                avail -> "Ny versjon ${u.latest} er klar"
                else -> "Siste versjon"
            },
            if (avail) "Oppdater ›" else if (u.loaded && u.phase != "failed") "✓ ›" else "›",
            if (avail) p.lab else p.pos, serif = false,
        ) { vm.openNordlys31() }
        PToggle("Automatiske oppdateringer", "Installeres om natten kl. 03:30, etter backup", u.autoUpdate, top = true) { vm.setUpdSetting30("auto_update", it) }
        // Prompt 39: «Varsle om nye versjoner» ligger nå under Innstillinger → Varsler (UpdNotifyToggle39).
    }
}

/* ======================= Backup: kvittering for siste kjøring ======================= */

/** «✓ 2,4 GB · smb://truenas.local/backup/homelab/homelab-2026-10-19_2130-hele.tar.zst · verifisert» + Åpne mappe › og Vis logg. */
@Composable
internal fun BackupReceipt36(vm: AppViewModel, b: Bk29Item) {
    val p = PaperPal.current
    if (b.fullPath.isBlank() && b.verified == null) return
    var log by remember { mutableStateOf(false) }
    val ok = b.ok && b.verified != false
    Column(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(listOfNotNull(if (ok) "✓" else "✗", b.size.takeIf { it.isNotBlank() }, b.fullPath.takeIf { it.isNotBlank() },
            when (b.verified) { true -> "verifisert"; false -> "ikke verifisert"; null -> null }).joinToString(" · ").replace("✓ · ", "✓ ").replace("✗ · ", "✗ "),
            color = if (ok) p.pos else p.lab, fontFamily = PaperFonts.mono, fontSize = 12.sp, lineHeight = 17.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            if (b.fullPath.startsWith("smb://")) Text("Åpne mappe ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { vm.openSmb30(finans = false, system = true) }.padding(vertical = 4.dp))
            Text(if (log) "Skjul logg" else "Vis logg", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { Haptics.select(); log = !log }.padding(vertical = 4.dp))
        }
        if (log) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.bg).padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            listOfNotNull(
                b.target.takeIf { it.isNotBlank() }?.let { "Mål: $it" }, b.method.takeIf { it.isNotBlank() }?.let { "Metode: $it" },
                b.bytes?.let { "Skrevet: $it byte" }, b.sha256.takeIf { it.isNotBlank() }?.let { "SHA-256: ${it.take(16)}…" },
                b.verified?.let { "Verifisert: " + if (it) "ja (størrelse og liste stemmer)" else "nei" }, b.ms?.let { "Tid: %.1f s".format(java.util.Locale("nb", "NO"), it / 1000.0) },
                b.error.takeIf { it.isNotBlank() }?.let { "Feil: $it" },
            ).plus(b.retention.map { "Retention: $it" }).ifEmpty { listOf("Ingen logg for denne kjøringen.") }.forEach {
                Text(it, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, lineHeight = 16.sp)
            }
        }
    }
}

/* ---------------- Tidligere versjoner ---------------- */

@Composable
internal fun Rollback44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    LaunchedEffect(Unit) { vm.loadVersions44() }
    if (t.verMissing) return
    var all by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("TIDLIGERE VERSJONER", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.lab.copy(alpha = .4f)))
        t.verMsg?.let { Text(it, color = GREEN44u, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
        val list = t.versions
        if (list == null) Text("Henter versjoner …", color = p.mut, fontSize = 13.sp)
        else if (list.isEmpty()) Text("Updateren har ingen tidligere versjoner lagret ennå.", color = p.mut, fontSize = 13.sp)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
            list.orEmpty().take(if (all) 10 else 4).forEachIndexed { i, v ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(v.version, color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            if (v.previous) Tag44("Forrige", p.ink)
                            if (v.hasBackup) Tag44("Har backup", GREEN44u)
                        }
                        Text(listOfNotNull(v.date?.take(10), v.notes).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (v.current) Text("Kjører nå", color = GREEN44u, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    else Text("Installer", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape)
                        .border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { t.verSheet = v; t.verErr = null }.padding(horizontal = 14.dp).wrapContentHeight())
                }
            }
        }
        if (!all && list.orEmpty().size > 4) Text("Vis alle ${list.orEmpty().size}", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp,
            modifier = Modifier.heightIn(min = 44.dp).clickable(role = Role.Button) { all = true }.wrapContentHeight())
        Text("Tilbakerulling bruker updater-containeren, med backup før og automatisk tilbake ved feil innen 90 s. «Krev passord» gjelder også her.",
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp)
    }
    t.verSheet?.let { VerSheet44(vm, it) }
}

@Composable
private fun Tag44(text: String, c: Color) {
    Text(text, color = c, fontWeight = FontWeight.Bold, fontSize = 10.5.sp, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(c.copy(alpha = .12f)).padding(horizontal = 6.dp, vertical = 2.dp))
}

@Composable
private fun VerSheet44(vm: AppViewModel, v: Ver44) {
    val p = PaperPal.current
    val t = vm.p44
    var restore by remember(v.version) { mutableStateOf(!v.compatible && v.hasBackup) }
    var pause by remember(v.version) { mutableStateOf(true) }
    var pw by remember { mutableStateOf("") }
    Sheet43({ t.verSheet = null }) {
        PSerif("Gå tilbake til Nordlys ${v.version}?", 24.sp)
        Radio44("Behold dataene mine", if (v.compatible) "Bare koden byttes." else "Databasen ble endret etter ${v.version}. Du må gjenopprette backupen.", !restore, v.compatible) { restore = false }
        Radio44("Gjenopprett backup" + (v.backupAt?.let { " fra ${it.take(16).replace('T', ' ')}" } ?: ""),
            "Data tilbake til slik de var før oppdateringen. Endringer etter det forsvinner.", restore, v.hasBackup) { restore = true }
        Toggle43("Slå av automatiske oppdateringer i 7 dager", "Så den ikke oppdaterer seg rett tilbake", pause) { pause = it }
        Field43(pw, "Passord (når «Krev passord» er på)", password = true) { pw = it }
        t.verErr?.let { Text(it, color = RED44u, fontSize = 13.sp) }
        Btn43(if (t.verBusy) "Starter …" else "Installer ${v.version}", color = RED44u, modifier = Modifier.fillMaxWidth(), enabled = !t.verBusy && (v.compatible || restore)) {
            vm.rollback44(v, restore, pause, pw)
        }
    }
}

@Composable
private fun Radio44(title: String, sub: String, on: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).clickable(enabled = enabled, role = Role.RadioButton) { onClick() }.padding(14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(20.dp).clip(CircleShape).border(2.dp, if (enabled) p.ink else p.line, CircleShape), contentAlignment = Alignment.Center) {
            if (on) Box(Modifier.size(10.dp).clip(CircleShape).background(p.ink))
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = if (enabled) p.ink else p.mut, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
            Text(sub, color = p.mut, fontSize = 12.sp, lineHeight = 16.sp)
        }
    }
}

/* ---------------- Logger ---------------- */

private val LOG_BG44 = Color(0xFF15171A)

@Composable
internal fun LoggerScreen44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    val ctx = LocalContext.current
    BackHandler { if (t.logPick != null) t.logPick = null else t.logsOpen = false }
    LaunchedEffect(t.ct, t.logLevel, t.logSince) { vm.loadLogs44() }
    LaunchedEffect(t.logQ) { delay(400); vm.loadLogs44() }
    LaunchedEffect(t.live) { while (t.live) { delay(3000); vm.loadLogs44() } }
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val listState = rememberLazyListState()
    LaunchedEffect(t.logs?.size, t.live) { if (t.live) t.logs?.size?.takeIf { it > 0 }?.let { runCatching { listState.scrollToItem(it - 1) } } }
    Column(Modifier.fillMaxSize().background(p.bg).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 12.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("‹ Tilbake", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape)
                .clickable(role = Role.Button) { t.logsOpen = false }.padding(horizontal = 10.dp).wrapContentHeight())
        }
        PSerif("Logger", 34.sp, modifier = Modifier.padding(start = 18.dp, bottom = 2.dp))
        Text("Docker-logger, feil og feilsøking", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(start = 18.dp, bottom = 8.dp))
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, 24.dp + navB), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (t.logsMissing) item { Text("Logger finnes ikke på serveren ennå. Oppdater Homelab.", color = p.mut, fontSize = 13.sp) }
            t.logsErr?.let { e -> item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(e, color = RED44u, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text("Oppsett: monter /var/run/docker.sock (helst via tecnativa/docker-socket-proxy med CONTAINERS=1 LOGS=1 POST=1) i homelab-containeren.", color = p.mut, fontSize = 12.sp)
                }
            } }
            // Tall øverst.
            t.cts?.let { cs -> item {
                val up = cs.count { it.state == "running" }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Kpi44("Oppe", "$up/${cs.size}", if (up == cs.size) GREEN44u else RED44u)
                    Kpi44("Feil", "${cs.sumOf { it.errors }}", if (cs.sumOf { it.errors } > 0) RED44u else p.ink)
                    Kpi44("Omstarter", "${cs.sumOf { it.restarts }}" + (cs.maxByOrNull { it.restarts }?.takeIf { it.restarts > 0 }?.let { " · ${it.name}" } ?: ""), p.ink)
                }
            } }
            // Containere.
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pill43("Alle", t.ct == null) { t.ct = null }
                    t.cts.orEmpty().forEach { c ->
                        val dot = when { c.state == "running" -> "●"; c.state.contains("restart") -> "◐"; else -> "○" }
                        Pill43("$dot ${c.name}", t.ct == c.name, c.errors.takeIf { it > 0 }) { t.ct = c.name }
                    }
                }
            }
            t.cts?.firstOrNull { it.name == t.ct }?.let { c -> item { CtCard44(vm, c) } }
            // Filter.
            item { Field43(t.logQ, "Søk i loggene") { t.logQ = it } }
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("alle" to "Alle", "info" to "Info+", "warn" to "Advarsler", "error" to "Feil").forEach { (k, n) -> Pill43(n, t.logLevel == k) { t.logLevel = k } }
                    Spacer(Modifier.width(6.dp))
                    listOf("15m" to "15m", "1h" to "1t", "24h" to "24t", "7d" to "7d").forEach { (k, n) -> Pill43(n, t.logSince == k) { t.logSince = k } }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Btn43(if (t.live) "● Live" else "Live", color = if (t.live) RED44u else null) { t.live = !t.live }
                    Btn43("Last ned") { shareLog44(ctx, t.logs.orEmpty().joinToString("\n") { "${it.t} ${it.level.uppercase()} [${it.ct}] ${it.msg}" }) }
                }
            }
            // Loggvindu (mørkt, mono).
            val logs = t.logs
            if (logs == null && !t.logsMissing && t.logsErr == null) item { Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            if (logs != null) item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(LOG_BG44).padding(vertical = 6.dp)) {
                    if (logs.isEmpty()) Text("Ingen linjer for filteret.", color = Color(0xFF9AA0A6), fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.padding(12.dp))
                    logs.forEach { l -> LogLine44(l) { vm.explain44(l) } }
                }
            }
            // Feil gruppert.
            t.groups?.takeIf { it.isNotEmpty() }?.let { gs -> item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PLabel("Feil gruppert · 24 t", modifier = Modifier.padding(top = 6.dp))
                    gs.forEach { g ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).clickable(role = Role.Button, onClickLabel = "Forklar feilen") { vm.explain44(Log44(g.last ?: "", "error", g.ct, g.msg)) }.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("×${g.count}", color = RED44u, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Column(Modifier.weight(1f)) {
                                Text(g.msg, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(listOfNotNull(g.ct, g.last?.take(16)?.replace('T', ' ')?.let { "sist $it" }).joinToString(" · "), color = p.mut, fontSize = 11.5.sp)
                            }
                            Text("Forklar ›", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }
            } }
        }
    }
    t.logPick?.let { LogDetail44(vm, it) }
    t.ctAsk?.let { (id, act) ->
        Sheet43({ t.ctAsk = null }) {
            PSerif(if (act == "stop") "Stoppe containeren?" else "Starte på nytt?", 22.sp)
            Text("Gjelder ${t.cts.orEmpty().firstOrNull { it.id == id }?.name ?: id}. Tjenesten er borte en liten stund.", color = p.mut, fontSize = 13.sp)
            Btn43(if (act == "stop") "Stopp" else "Start på nytt", color = RED44u, modifier = Modifier.fillMaxWidth()) { vm.ctAction44(id, act) }
        }
    }
}

@Composable
internal fun Kpi44(label: String, value: String, c: Color) {
    val p = PaperPal.current
    Column(Modifier.widthIn(min = 104.dp).clip(RoundedCornerShape(16.dp)).background(p.card).padding(12.dp)) {
        PLabel(label, color = p.mut)
        Text(value, color = c, fontFamily = PaperFonts.serif, fontSize = 24.sp, maxLines = 1)
    }
}

@Composable
private fun CtCard44(vm: AppViewModel, c: Ct44) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(c.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Text(listOfNotNull(c.image, c.state, c.uptime, c.cpu?.let { "CPU $it" }, c.mem?.let { "minne $it" }, "${c.restarts} omstarter").joinToString(" · "),
            color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
        if (vm.userIsAdmin) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn43("Start på nytt", dark = true) { vm.p44.ctAsk = c.id to "restart" }
            if (c.state == "running") Btn43("Stopp", color = RED44u) { vm.p44.ctAsk = c.id to "stop" } else Btn43("Start") { vm.ctAction44(c.id, "start") }
        }
    }
}

@Composable
private fun LogLine44(l: Log44, onClick: () -> Unit) {
    val err = l.level.startsWith("err") || l.level == "fatal"
    val c = when { err -> Color(0xFFFF7B72); l.level.startsWith("warn") -> Color(0xFFE3B341); l.level == "debug" -> Color(0xFF8B949E); else -> Color(0xFF7EE787) }
    Column(Modifier.fillMaxWidth().background(if (err) Color(0x33FF4D4D) else Color.Transparent).clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 4.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(l.t.takeLast(12).take(8), color = Color(0xFF8B949E), fontFamily = PaperFonts.mono, fontSize = 10.5.sp)
            Text(l.level.uppercase().take(5), color = c, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 10.5.sp)
            Text(l.ct, color = Color(0xFF79C0FF), fontFamily = PaperFonts.mono, fontSize = 10.5.sp, maxLines = 1)
        }
        Text(l.msg, color = Color(0xFFE6EDF3), fontFamily = PaperFonts.mono, fontSize = 11.5.sp, lineHeight = 15.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun LogDetail44(vm: AppViewModel, l: Log44) {
    val p = PaperPal.current
    val t = vm.p44
    val ctx = LocalContext.current
    Sheet43({ t.logPick = null }) {
        PLabel("${l.level.uppercase()} · ${l.ct}")
        Text(l.msg, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.card).padding(12.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { GlimtFig35("glimt", 30.dp, if (t.explainBusy) "talk" else "idle"); Text("  Glimt forklarer", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
            Text(t.explain ?: "Glimt leser linjen …", color = p.ink, fontSize = 14.sp, lineHeight = 20.sp)
        }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn43("Kopier med 20 linjer rundt") {
                (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(ClipData.newPlainText("Logg", vm.logContext44(l)))
                vm.flash("Kopiert")
            }
            Btn43("Vis i sammenheng") { t.logPick = null; t.ct = l.ct; t.logLevel = "alle"; t.logQ = "" }
        }
    }
}

private fun shareLog44(ctx: Context, text: String) {
    runCatching {
        ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text).putExtra(Intent.EXTRA_SUBJECT, "homelab.log"), "Last ned logg")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/* ======================= Oppdatering: «Står fast» ======================= */

@Composable
internal fun UpdStuck46(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Står fast: ingen fremgang på 3 minutter (${vm.p30.upd.stepText.ifBlank { "ukjent steg" }}).", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton("Prøv igjen", Modifier.weight(1f), height = 40.dp) { vm.retryUpd46(ctx) }
            PButton("Avbryt og gå tilbake", Modifier.weight(1.4f), kind = "line", height = 40.dp) { vm.abortUpd46(ctx) }
        }
        PButton("Vis logg", Modifier.fillMaxWidth(), kind = "line", height = 40.dp) { vm.showUpdLog46() }
    }
}
