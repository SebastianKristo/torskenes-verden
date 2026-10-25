package no.kristo.finanshub.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.*

/*
 * Prompt 56 (AND56): mikrofonen i Glimt-chatten og Glimt-søket (logikken i Voice56.kt).
 *  - Modifier.holdMic56: trykk = start/stopp, hold inne (≥ 350 ms) = snakk så lenge du holder, slipp = send.
 *  - rememberMic56: forklaring før Androids tillatelsesdialog for mikrofonen (RECORD_AUDIO).
 *  - VoiceBar56: «Lytter … 12 s» med lydbølge og Avbryt, «Skriver ned …» mens serveren jobber.
 *  - VoiceSettings56: «Tale til tekst: Serveren (anbefalt) / På enheten» i Innstillinger → AI og tolkning.
 */

internal const val MIC56 = "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"
private const val X56 = "M6 6l12 12M18 6L6 18"
internal val MIC56_ON = Color(0xFFB23A2A)

internal fun micOk56(ctx: Context): Boolean = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

/** Trykk og hold på mikrofonknappen. Lambdaene oppdateres uten å starte gesten på nytt (nivået tegner om hele tiden). */
internal fun Modifier.holdMic56(label: String, onTap: () -> Unit, onHold: () -> Unit, onRelease: (cancel: Boolean) -> Unit): Modifier = composed {
    val tap by rememberUpdatedState(onTap)
    val hold by rememberUpdatedState(onHold)
    val rel by rememberUpdatedState(onRelease)
    this.pointerInput(Unit) {
        detectTapGestures(onPress = {
            val up = withTimeoutOrNull(350L) { tryAwaitRelease() }
            if (up != null) { if (up) tap() }
            else {
                hold()
                val ok = tryAwaitRelease()
                rel(!ok)
            }
        })
    }.semantics {
        role = Role.Button
        contentDescription = label
        onClick(label) { tap(); true }
    }
}

/**
 * Spør om mikrofonen med en forklaring først. Returnerer funksjonen som starter (har appen lov, kalles onGranted med en gang).
 */
@Composable
internal fun rememberMic56(onDenied: () -> Unit = {}, onGranted: () -> Unit): () -> Unit {
    val ctx = LocalContext.current
    var ask by remember { mutableStateOf(false) }
    val granted by rememberUpdatedState(onGranted)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) granted() else onDenied() }
    if (ask) AlertDialog(
        onDismissRequest = { ask = false },
        title = { Text("Bruke mikrofonen?") },
        text = {
            Text("Homelab bruker mikrofonen til tale til tekst. Lyden sendes bare til serveren i huset og lagres ikke.\n\n" +
                "Hold inne mikrofonen mens du snakker, eller trykk for å starte og trykk igjen for å stoppe. Android spør deg om lov etterpå.")
        },
        confirmButton = { TextButton({ ask = false; launcher.launch(Manifest.permission.RECORD_AUDIO) }) { Text("Tillat mikrofon") } },
        dismissButton = { TextButton({ ask = false }) { Text("Avbryt") } },
    )
    return remember(ctx) { { if (micOk56(ctx)) granted() else ask = true } }
}

/** Lydbølgen (sju streker) som følger nivået, som i Chat. */
@Composable
internal fun Wave56(level: Float, color: Color) {
    val tr = rememberInfiniteTransition(label = "wave56")
    Row(Modifier.height(22.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        for (i in 0 until 7) {
            val a by tr.animateFloat(.25f, 1f, infiniteRepeatable(tween(450, delayMillis = i * 60), RepeatMode.Reverse), label = "w56$i")
            val h = (6f + 16f * a * (.35f + .65f * level)).dp
            Box(Modifier.width(3.dp).height(h).clip(RoundedCornerShape(2.dp)).background(color))
        }
    }
}

/** «Lytter … 12 s · slipp for å sende» med bølge og Avbryt, eller «Skriver ned …». */
@Composable
internal fun VoiceBar56(vm: AppViewModel, target: String, ink: Color, mut: Color, font: FontFamily, modifier: Modifier = Modifier) {
    val v = Voice56
    val on = v.on(target)
    val note = v.note.takeIf { v.noteFor == target }
    if (!on && note == null) return
    Row(modifier.fillMaxWidth().heightIn(min = 44.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!on) {
            Text(note ?: "", color = mut, fontFamily = font, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            return@Row
        }
        val rec = v.phase == "rec"
        Box(Modifier.size(9.dp).clip(CircleShape).background(if (rec) MIC56_ON else mut))
        Column(Modifier.weight(1f)) {
            Text(if (rec) "Lytter … ${v.secs} s" else "Skriver ned …", color = ink, fontFamily = font, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
            Text(
                if (!rec) (if (v.onDevice) "På telefonen" else "På serveren i huset") else if (v.hold) "Slipp for å sende" else "Trykk på mikrofonen igjen for å stoppe",
                color = mut, fontFamily = font, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (rec) Wave56(v.level, MIC56_ON)
        Box(Modifier.height(32.dp).clip(CircleShape).border(1.dp, mut.copy(alpha = .5f), CircleShape).clickable(role = Role.Button, onClickLabel = "Avbryt") { vm.cancelMic56() }
            .padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                WxIcon(X56, ink, 10.dp, stroke = 3f)
                Text("Avbryt", color = ink, fontFamily = font, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
            }
        }
    }
}

/** Mikrofonknappen i søkefeltet på Hjem (30 dp, rød mens den lytter). */
@Composable
internal fun SearchMic56(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.voice56Refresh() }
    val start = rememberMic56(onDenied = { vm.say56(Voice56.SEARCH, "Mikrofonen trenger tillatelse") }) { vm.micSearch56(ctx) }
    val on = Voice56.on(Voice56.SEARCH)
    Box(
        Modifier.size(34.dp).clip(CircleShape).background(if (on) MIC56_ON else Color.Transparent)
            .holdMic56("Snakk inn søket (hold inne, eller trykk for start og stopp)",
                onTap = { Haptics.select(); if (on) vm.micSearch56(ctx) else start() },
                onHold = { if (micOk56(ctx)) vm.micSearch56(ctx, hold = true) else start() },
                onRelease = { cancel -> vm.releaseMic56(Voice56.SEARCH, cancel) }),
        contentAlignment = Alignment.Center,
    ) { WxIcon(MIC56, if (on) Color.White else p.ink, 18.dp, stroke = 2f) }
}

/** Innstillinger → AI og tolkning: hvor talen skrives ned. Lagres på telefonen. */
@Composable
internal fun VoiceSettings56(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { Voice56.loadMode(ctx); vm.voice56Refresh(force = true) }
    val info = Voice56.info
    val ready = info?.backends?.filter { it.available }.orEmpty()
    val status = when {
        !Voice56.infoLoaded -> "Sjekker serveren …"
        info == null -> "Fikk ikke kontakt med tale til tekst på serveren – telefonen brukes."
        ready.isEmpty() -> "Ingen motor er klar på serveren nå – telefonen brukes."
        else -> "Klar: " + ready.joinToString(", ") { it.engineLabel } + if (info.norwegian) "" else " (norsk krever NB-Whisper på Mac mini-en)"
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Tale til tekst", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PRow("Serveren (anbefalt)", "NB-Whisper, Voz eller Phonon i huset. Lyden lagres ikke.", if (Voice56.mode == "server") "✓" else "", valueColor = p.ink, serif = false) {
                Haptics.select(); Voice56.saveMode(ctx, "server")
            }
            PRow("På enheten", "Talegjenkjenningen på telefonen (norsk).", if (Voice56.mode == "device") "✓" else "", valueColor = p.ink, serif = false, top = true) {
                Haptics.select(); Voice56.saveMode(ctx, "device")
            }
        }
        Text(status, color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp))
    }
}
