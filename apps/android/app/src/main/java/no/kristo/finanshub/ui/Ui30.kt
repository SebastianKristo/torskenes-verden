package no.kristo.finanshub.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.askUpd30
import no.kristo.finanshub.doneUpd30
import no.kristo.finanshub.hideUpd30
import no.kristo.finanshub.openCustomTab24
import no.kristo.finanshub.runUpd30
import no.kristo.finanshub.setUpdSetting30
import no.kristo.finanshub.upd30OnHome
import no.kristo.finanshub.openNordlys31
import no.kristo.finanshub.startUpd31
import no.kristo.finanshub.loadLatestNotes36

/*
 * Prompt 30 (ANDROID30): felles SheetButton30 (Ferdig / Lukk · Avbryt / ‹ Tilbake), haptikk når ark lukkes,
 * 64 dp luft under wiggle-verktøylinja (animert), oppdateringsbanneret (Hjem og Innstillinger), passord-arket og
 * PROGRAMVARE-radene. Logikken ligger i P30.kt.
 */

internal const val IC_DL30 = "M12 4v11M7 10l5 5 5-5M5 20h14"
internal const val IC_CHECK30 = "M5 12.5l4.5 4.5L19 7"
internal const val IC_X30 = "M6 6l12 12M18 6L6 18"
internal const val IC_BACK30 = "M15 18l-6-6 6-6"
internal const val IC_PLUS30 = "M12 5v14M5 12h14"
internal const val IC_MINUS30 = "M5 12h14"
internal const val IC_LOCK30 = "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3"

/** Animasjonen fra fasiten: cubic-bezier(.2,.8,.2,1). */
internal val EASE30 = CubicBezierEasing(.2f, .8f, .2f, 1f)

/** Luft øverst i innholdet i wiggle-modus (64 dp), så verktøylinja aldri dekker første kort eller minus-merket. */
// Prompt 32: knapperaden (＋ / ✓, 40 dp) står 8 dp under papirkanten (WIGGLE_TOP28 = 31 dp i laget som ligger 23 dp opp i bildet);
// første widget og «−»-merket (9 dp opp) starter med luft under den: 31 + 40 + 26 = 97 dp. Klippes 14 dp under knappene når man scroller.
internal val WIGGLE_PAD30: Dp = 97.dp
internal val WIGGLE_CLIP32B: Dp = 85.dp

/** 0 → 64 dp på 280 ms når redigeringen slås på, og tilbake når man trykker ✓. */
@Composable
internal fun WiggleSpace30(on: Boolean, extra: Dp = 0.dp) {
    // Starter alltid på 0, så luften også animeres inn når raden nettopp er lagt til (rutenettene).
    val a = remember { Animatable(0f) }
    val target = if (on) (WIGGLE_PAD30 + extra).value else 0f
    LaunchedEffect(target) { a.animateTo(target, tween(280, easing = EASE30)) }
    if (a.value > .5f) Spacer(Modifier.height(a.value.dp))
}

/** Lett haptikk når noe lukkes (sentral dismiss-hook): kall med «er åpen», tikker på overgangen åpen → lukket. */
@Composable
internal fun DismissHaptic30(open: Boolean) {
    var was by remember { mutableStateOf(open) }
    LaunchedEffect(open) {
        if (was && !open) Haptics.dismiss()
        was = open
    }
}

/**
 * Felles pille øverst i ark og fullskjerm: primary (Ferdig: ink/bg), secondary (Lukk · Avbryt: ink 8 %, mørk 10 %),
 * back (‹ Tilbake). 36 høy, radius 18, 700 14 sp; treffflaten er minst 44 × 44. dark = mørk flate (Vær, Subscription OS):
 * primary blir hvit med mørk tekst.
 */
@Composable
internal fun SheetButton30(label: String, kind: String = "primary", modifier: Modifier = Modifier, dark: Boolean? = null, onClick: () -> Unit) {
    val p = PaperPal.current
    val isDark: Boolean = dark ?: (p.bg.luminance() < .5f)
    val onDarkSurface: Boolean = dark == true
    val bg: Color = when {
        kind == "primary" && onDarkSurface -> Color.White
        kind == "primary" -> p.ink
        onDarkSurface || isDark -> Color.White.copy(alpha = .1f)
        else -> Color(0x141B1A17)
    }
    val fg: Color = when {
        kind == "primary" && onDarkSurface -> Color(0xFF17191E)
        kind == "primary" -> p.bg
        onDarkSurface -> Color.White
        else -> p.ink
    }
    Box(
        modifier.sizeIn(minWidth = 44.dp, minHeight = 44.dp)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClickLabel = label) {
                if (kind == "back") Haptics.select() else Haptics.dismiss()
                onClick()
            }.semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(bg)
                .padding(start = if (kind == "back") 10.dp else 16.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            if (kind == "back") WxIcon(IC_BACK30, fg, 16.dp, stroke = 2.2f)
            Text(label, color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
        }
    }
}

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
        "run" -> if (u.action == "rollback") "Gjenoppretter forrige versjon" else "Oppdaterer Nordlys OS"
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
                modifier = Modifier.align(Alignment.CenterHorizontally).clickable { openCustomTab24(ctx, upd28WebUrl(vm)) }.padding(8.dp),
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
        PToggle("Varsle om nye versjoner", "Banner på Hjem og push", u.notifyUpdates, top = true) { vm.setUpdSetting30("notify_updates", it) }
    }
}

/** Fargene på ikonene i Innstillinger, samme som web (Innstillinger Web.dc.html). Null = fargetemaet. */
internal fun setColor30(title: String): Long? = when (title) {
    "Kontoer og brukere", "Konto" -> 0xFF2B5D8A
    "Utseende og fanelinje", "Utseende" -> 0xFF7A5AD6
    "Moduler", "Startside" -> 0xFF3F7A6E
    "Domener" -> 0xFFC0562A
    "Varsler og haptikk", "Varsler", "Logg ut" -> 0xFFB23A2A
    "Navn på appen", "App-ikon", "Fanelinje-stil", "Fanelinje i Hjem", "App" -> 0xFF5B6470
    "Integrasjoner" -> 0xFF4A5BBF
    "Kalendere" -> 0xFF2F7D4F
    "AI og tolkning", "AI" -> 0xFF7A3B6B
    "API-tokens", "Brukere" -> 0xFFA8661A
    "Sikkerhet", "Innlogging" -> 0xFF1F6F78
    "Oppdatering", "Server og synk", "System" -> 0xFF6B6558
    "Backup", "Backup og data" -> 0xFF2F6B45
    else -> null
}

/** Lås-merke i samme stil som minus-merket (Innstillinger kan ikke skjules). */
@Composable
internal fun LockDot30(modifier: Modifier = Modifier) {
    val p = PaperPal.current
    Box(
        modifier.offset((-9).dp, (-9).dp).size(28.dp)
            .shadow(5.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).semantics { contentDescription = "Kan ikke skjules" },
        contentAlignment = Alignment.Center,
    ) { WxIcon(IC_LOCK30, p.mut, 12.dp, stroke = 2.4f) }
}

/** ＋-merke på skjulte kort (trykk = vis igjen). */
@Composable
internal fun PlusDot30(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        modifier.offset((-9).dp, (-9).dp).size(28.dp)
            .shadow(5.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
            .clickable(role = Role.Button, onClickLabel = label) { onClick() }.semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { WxIcon(IC_PLUS30, p.ink, 12.dp, stroke = 3.2f) }
}
