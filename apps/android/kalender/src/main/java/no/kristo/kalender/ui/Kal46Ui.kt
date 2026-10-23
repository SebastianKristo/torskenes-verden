package no.kristo.kalender.ui

import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import no.kristo.kalender.Hap
import no.kristo.kalender.Kal46Guard
import no.kristo.kalender.Kal46Prefs
import no.kristo.kalender.Kal46Qr
import no.kristo.kalender.Kal46Rask
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.setPref46

/*
 * Prompt 46 (KAL46): Compose-delene – «Vis detaljer» i oppdateringen, «Kunne ikke åpne ny hendelse», STANDARDKALENDER i
 * Innstillinger, «✦ Glimt» / sted i GLIMT FORSTÅR, «Logg inn med QR-kode» på innloggingsskjermen og «Logg inn på annen enhet».
 */

/** «Vis detaljer» under feilmeldingen i Programvareoppdatering (URL og feilkode). */
@Composable
fun UpdDetails46(text: String) {
    val k = LocalK.current
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.height(32.dp).tap(if (open) "Skjul detaljer" else "Vis detaljer") { open = !open }, contentAlignment = Alignment.CenterStart) {
            Tx(if (open) "Skjul detaljer" else "Vis detaljer", man(12.5.sp, FontWeight.Bold, k.mut))
        }
        if (open) Tx(text, mono(11.5.sp, k.mut), maxLines = 8)
    }
}

/** Arket kom ikke fram: feilmelding med «Prøv igjen» i stedet for grå skjerm. */
@Composable
fun NewFail46(vm: KalVm, modifier: Modifier = Modifier) {
    val k = LocalK.current
    if (Kal46Guard.failed == null) return
    Column(
        modifier.padding(horizontal = 16.dp).widthIn(max = 420.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(k.card)
            .border(1.dp, k.line, RoundedCornerShape(20.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Tx("Kunne ikke åpne ny hendelse", man(15.sp, FontWeight.Bold, k.ink))
        Tx("Prøv igjen, eller skriv hendelsen i feltet nederst.", man(13.sp, FontWeight.Medium, k.mut), maxLines = 3)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            InkPill("Prøv igjen", { Hap.tick(); Kal46Guard.retry(vm) })
            LinePill("Lukk", { Hap.tick(); Kal46Guard.failed = null })
        }
    }
}

/** Innstillinger → STANDARDKALENDER (skrivbare kalendere, lagres i profilen). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DefCal46(vm: KalVm) {
    val k = LocalK.current
    val ctx = vm.getApplication<android.app.Application>()
    var pref by remember { mutableStateOf(Kal46Prefs.defCal(ctx)) }
    val cur = Kal46Prefs.pick(vm.cals, pref)
    Label("STANDARDKALENDER", Modifier.padding(top = 4.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        vm.cals.filter { Kal46Prefs.usable(it) }.forEach { c ->
            Chip(c.n, cur == c.id, {
                Hap.tick()
                val sid = Kal46Prefs.serverId(vm.cals, c.id)
                Kal46Prefs.setDefCal(ctx, sid)
                pref = sid
                vm.setPref46("defaultCalendar", sid)
            }, dot = c.col)
        }
    }
    Tx("Nye hendelser fra «+», rask time og Glimt havner her, med mindre du nevner en annen kalender.", man(12.sp, FontWeight.Medium, k.mut), maxLines = 3)
}

/** «✦ Glimt» / «Glimt tenker …» ved GLIMT FORSTÅR. */
@Composable
fun RaskBadge46(glimt: Boolean) {
    val k = LocalK.current
    when {
        Kal46Rask.thinking -> Tx("Glimt tenker …", man(11.sp, FontWeight.Bold, k.mut))
        glimt -> Tx("✦ Glimt", man(11.sp, FontWeight.Bold, k.acc))
    }
}

@Composable
fun RaskPlace46(loc: String, address: String) {
    val k = LocalK.current
    if (loc.isBlank()) return
    Tx("📍 " + (if (address.isBlank()) loc else "$loc · $address"), man(12.5.sp, FontWeight.SemiBold, k.ink), maxLines = 2)
}

/* ---------------- QR: vis (innloggingsskjermen) ---------------- */

@Composable
fun QrButton46(vm: KalVm) {
    val k = LocalK.current
    Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, k.line, RoundedCornerShape(22.dp))
        .tap("Logg inn med QR-kode") { Hap.tick(); vm.k41.err = ""; vm.k41.phase = "qr" }, contentAlignment = Alignment.Center) {
        Tx("Logg inn med QR-kode", man(13.5.sp, FontWeight.Bold, k.ink))
    }
}

@Composable
fun QrLogin46(vm: KalVm) {
    val k = LocalK.current
    LaunchedEffect(Unit) { Kal46Qr.start(vm) }
    DisposableEffect(Unit) { onDispose { if (Kal46Qr.phase != "done") Kal46Qr.stop() } }
    Column(Modifier.widthIn(max = 320.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.widthIn(max = 260.dp).fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, k.line, RoundedCornerShape(18.dp)).padding(14.dp), contentAlignment = Alignment.Center) {
            val m = Kal46Qr.matrix
            if (m != null && Kal46Qr.phase != "scanned") QrCanvas46(m)
            else if (Kal46Qr.phase == "scanned") Tx(Kal46Qr.match.ifBlank { "✓" }, mono(34.sp, Color(0xFF1B1A17)))
            else no.kristo.kalender.ui.Spark(28.dp, true)
        }
        val head = when (Kal46Qr.phase) { "scanned" -> "Skannet – godkjenn på mobilen"; "err" -> "Fikk ikke laget koden"; else -> "Logg inn med mobilen" }
        Tx(head, man(16.sp, FontWeight.Bold, k.ink).copy(textAlign = TextAlign.Center), maxLines = 2)
        val sub = if (Kal46Qr.phase == "scanned") "Sjekk at tallet ${Kal46Qr.match} også vises på mobilen."
            else "Skann med Papir Finans på mobilen: Innstillinger → Logg inn på annen enhet. En innlogget Kalender kan også godkjenne."
        Tx(sub, man(13.sp, FontWeight.Medium, k.mut, 18.sp).copy(textAlign = TextAlign.Center), maxLines = 4)
        if (Kal46Qr.phase == "pending") Tx("Koden fornyes om ${Kal46Qr.secondsLeft} s", mono(12.sp, k.mut2))
        if (Kal46Qr.phase == "err") {
            Tx(Kal46Qr.err, man(13.sp, FontWeight.SemiBold, k.acc).copy(textAlign = TextAlign.Center), maxLines = 4)
            InkPill("Ny kode", { Hap.tick(); Kal46Qr.start(vm) })
        }
        Box(Modifier.height(40.dp).tap("Logg inn på en annen måte") { Hap.tick(); Kal46Qr.stop(); vm.k41.phase = "start" }, contentAlignment = Alignment.Center) {
            Tx("‹ Logg inn på en annen måte", man(13.sp, FontWeight.Bold, k.mut))
        }
    }
}

@Composable
private fun QrCanvas46(m: Array<BooleanArray>) {
    Canvas(Modifier.fillMaxWidth().aspectRatio(1f).semantics { contentDescription = "QR-kode for innlogging" }) {
        val n = m.size
        val cell = size.width / n
        for (y in 0 until n) for (x in 0 until n) if (m[y][x]) drawRect(Color.Black, Offset(x * cell, y * cell), Size(cell + 0.5f, cell + 0.5f))
    }
}

/* ---------------- QR: skann/godkjenn (innlogget) ---------------- */

/** Innstillinger → GLIMT OG KONTO → «Logg inn på annen enhet». */
@Composable
fun ScanRow46(vm: KalVm) {
    val k = LocalK.current
    Row(Modifier.fillMaxWidth().height(56.dp).tap("Logg inn på annen enhet") { Hap.tick(); Kal46Qr.openScan() }, verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Tx("Logg inn på annen enhet", man(14.5.sp, FontWeight.Bold, k.ink))
            Tx("Godkjenn QR-koden Kalender på Mac, iPad eller en annen telefon viser", man(12.sp, FontWeight.Medium, k.mut), maxLines = 2)
        }
        Tx("›", man(16.sp, FontWeight.Bold, k.mut))
    }
}

@Composable
fun ScanDialog46(vm: KalVm) {
    if (!Kal46Qr.scanOpen) return
    val k = LocalK.current
    val ctx = LocalContext.current
    Dialog(onDismissRequest = { Kal46Qr.scanOpen = false }) {
        Column(Modifier.clip(RoundedCornerShape(24.dp)).background(k.card).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Tx("Logg inn på annen enhet", news(22.sp, k.ink), maxLines = 2)
            when (Kal46Qr.scanPhase) {
                "busy" -> Box(Modifier.fillMaxWidth().height(80.dp), contentAlignment = Alignment.Center) { no.kristo.kalender.ui.Spark(28.dp, true) }
                "ask" -> {
                    Tx("Logge inn ${Kal46Qr.askDevice}?", man(15.sp, FontWeight.Bold, k.ink), maxLines = 3)
                    if (Kal46Qr.askPlace.isNotBlank()) Tx(Kal46Qr.askPlace, man(13.sp, FontWeight.Medium, k.mut), maxLines = 2)
                    Tx("Som ${Kal46Qr.askAccount}", man(13.sp, FontWeight.Medium, k.mut))
                    if (Kal46Qr.askMatch.isNotBlank()) {
                        Tx("Sjekk at tallet også vises på den andre skjermen", man(12.sp, FontWeight.Medium, k.mut), maxLines = 2)
                        Tx(Kal46Qr.askMatch, mono(32.sp, k.ink))
                    }
                    if (Kal46Qr.scanMsg.isNotBlank()) Tx(Kal46Qr.scanMsg, man(13.sp, FontWeight.SemiBold, k.acc), maxLines = 3)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        InkPill("Logg inn", { confirm46(ctx) { ok -> if (ok) Kal46Qr.answer(vm, true) else Kal46Qr.scanMsg = "Godkjenningen ble avbrutt." } }, h = 44.dp)
                        LinePill("Avbryt", { Kal46Qr.answer(vm, false) }, h = 44.dp)
                    }
                }
                "done", "err" -> {
                    Tx(Kal46Qr.scanMsg, man(13.5.sp, FontWeight.Medium, if (Kal46Qr.scanPhase == "done") k.ink else k.acc, 19.sp), maxLines = 6)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        LinePill("Ny kode", { Kal46Qr.openScan() }, h = 44.dp)
                        InkPill("Ferdig", { Kal46Qr.scanOpen = false }, h = 44.dp)
                    }
                }
                else -> {
                    Tx("Lim inn lenken eller koden som står under QR-koden på den andre enheten. Skanner du med kameraet til telefonen, åpnes Papir Finans.",
                        man(13.sp, FontWeight.Medium, k.mut, 18.sp), maxLines = 5)
                    Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, k.line, RoundedCornerShape(14.dp)).padding(horizontal = 12.dp),
                        contentAlignment = Alignment.CenterStart) {
                        if (Kal46Qr.scanText.isEmpty()) Tx("papir://login?… eller kode", man(14.sp, FontWeight.Medium, k.mut2))
                        BasicTextField(Kal46Qr.scanText, { Kal46Qr.scanText = it }, Modifier.fillMaxWidth().semantics { contentDescription = "Innloggingskode" },
                            textStyle = man(14.sp, FontWeight.Medium, k.ink), singleLine = true, cursorBrush = SolidColor(Red))
                    }
                    if (Kal46Qr.scanMsg.isNotBlank()) Tx(Kal46Qr.scanMsg, man(13.sp, FontWeight.SemiBold, k.acc), maxLines = 3)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        InkPill("Fortsett", { Kal46Qr.scan(vm, Kal46Qr.scanText) }, enabled = Kal46Qr.scanText.isNotBlank(), h = 44.dp)
                        LinePill("Avbryt", { Kal46Qr.scanOpen = false }, h = 44.dp)
                    }
                }
            }
        }
    }
}

/** Fingeravtrykk/ansikt med PIN/mønster som reserve (systemets BiometricPrompt, ingen ny avhengighet). Krever Android 9+. */
private fun confirm46(ctx: android.content.Context, done: (Boolean) -> Unit) {
    if (Build.VERSION.SDK_INT < 28) {
        val km = ctx.getSystemService(android.content.Context.KEYGUARD_SERVICE) as? android.app.KeyguardManager
        // Uten BiometricPrompt: godkjenning krever i det minste en låst telefon (PIN/mønster). Ellers nei.
        done(km?.isDeviceSecure == true)
        return
    }
    val exec = ctx.mainExecutor
    val b = android.hardware.biometrics.BiometricPrompt.Builder(ctx)
        .setTitle("Logg inn den andre enheten")
        .setSubtitle("Bekreft at det er deg")
    if (Build.VERSION.SDK_INT >= 30) {
        b.setAllowedAuthenticators(android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK or android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL)
    } else if (Build.VERSION.SDK_INT >= 29) {
        @Suppress("DEPRECATION")
        b.setDeviceCredentialAllowed(true)
    } else {
        b.setNegativeButton("Avbryt", exec) { _, _ -> done(false) }
    }
    val cb = object : android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: android.hardware.biometrics.BiometricPrompt.AuthenticationResult?) { done(true) }
        override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) { done(false) }
    }
    runCatching { b.build().authenticate(android.os.CancellationSignal(), exec, cb) }.onFailure { done(false) }
}
