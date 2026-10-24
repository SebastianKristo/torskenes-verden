package no.kristo.kalender.ui

import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.kalender.Hap
import no.kristo.kalender.Kal51
import no.kristo.kalender.Kal51News
import no.kristo.kalender.Kal51Pending
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red

/*
 * Prompt 51 (KAL51): Kalender Android – visningene for godkjenning av ny enhet, Innstillinger → SIKKERHET og
 * «Nytt i denne versjonen». Logikken ligger i Kal51.kt (K51State og K41State.startApproval51).
 */

/** «Venter på godkjenning» (LoginScreen41, fase «approve51»). */
@Composable
fun Approve51(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    Spark(34.dp, true)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(k.card).padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Tx("Godkjenn innloggingen fra en enhet som allerede er logget inn – Kalender eller Homelab-appen (Innstillinger → Sikkerhet), eller Homelab på web.",
            man(13.5.sp, FontWeight.Medium, k.ink, 19.sp), maxLines = 6)
        Tx("Er du hjemme? Logg inn på hjemmenettet, så trengs ingen godkjenning. Du kan også avbryte og bruke «Logg inn med Homelab-appen» eller QR-kode.",
            man(12.5.sp, FontWeight.Medium, k.mut, 18.sp), maxLines = 6)
    }
    s.approval51?.let { ap ->
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (ap.device.isNotBlank()) Tx("Enhet: " + ap.device, man(12.5.sp, FontWeight.SemiBold, k.mut))
            Tx("Venter til kl. " + Kal51.hm(ap.expires), man(12.5.sp, FontWeight.Medium, k.mut2))
        }
    }
    Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(25.dp)).border(1.dp, k.line, RoundedCornerShape(25.dp)).tap("Avbryt innloggingen") { s.cancelApproval51() },
        contentAlignment = Alignment.Center) { Tx("Avbryt", man(14.5.sp, FontWeight.Bold, k.ink)) }
}

/* ---------- Innstillinger → SIKKERHET ---------- */

@Composable
fun Sec51Section(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k51
    LaunchedEffect(Unit) { s.loadPending() }
    Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
        if (s.pending.isEmpty()) {
            Column(Modifier.fillMaxWidth().line51(k.line2).padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Tx("Ingen enheter venter", man(14.5.sp, FontWeight.Bold, k.ink))
                Tx("Nye enheter som logger inn fra internett må godkjennes her, i Homelab-appen eller på web.", man(12.sp, FontWeight.Medium, k.mut), maxLines = 3)
            }
        } else {
            s.pending.forEach { p -> Sec51Row(vm, p) }
        }
        if (s.msg.isNotBlank()) Tx(s.msg, man(12.5.sp, FontWeight.Medium, k.mut), Modifier.padding(vertical = 8.dp), maxLines = 3)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 44.dp).tap("Nytt i denne versjonen") { Hap.tick(); s.openNews() }.line51(k.line2).padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Tx("Nytt i denne versjonen", man(14.5.sp, FontWeight.Bold, k.ink))
                Tx("Endringene i siste oppdatering av Homelab", man(12.sp, FontWeight.Medium, k.mut))
            }
            Tx("›", man(16.sp, FontWeight.Bold, k.mut))
        }
    }
}

private fun Modifier.line51(c: Color): Modifier = this.drawBehind { drawLine(c, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }

@Composable
private fun Sec51Row(vm: KalVm, p: Kal51Pending) {
    val k = LocalK.current
    val s = vm.k51
    val ctx = LocalContext.current
    val sub = listOfNotNull(p.userName.takeIf { it.isNotBlank() }, p.place.takeIf { it.isNotBlank() }, p.method.takeIf { it.isNotBlank() },
        p.created.takeIf { it > 0 }?.let { "kl. " + Kal51.hm(it) }).joinToString(" · ")
    Column(Modifier.fillMaxWidth().line51(k.line2).padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Tx(p.device, man(14.5.sp, FontWeight.Bold, k.ink))
            if (sub.isNotBlank()) Tx(sub, man(12.sp, FontWeight.Medium, k.mut), maxLines = 3)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (s.busyId == p.id) Spark(22.dp, true) else {
                InkPill("Godkjenn", {
                    Hap.tick()
                    confirm51(ctx, "Godkjenn innloggingen på ${p.device}") { ok -> if (ok) { s.decide(p, true) } else { s.msg = "Ikke godkjent – bekreftelsen ble avbrutt." } }
                })
                LinePill("Avvis", { Hap.tick(); s.decide(p, false) })
            }
        }
    }
}

/** Fingeravtrykk/ansikt med PIN/mønster som reserve (systemets BiometricPrompt, ingen ny avhengighet). Uten skjermlås: trykket alene. */
private fun confirm51(ctx: android.content.Context, title: String, done: (Boolean) -> Unit) {
    val km = ctx.getSystemService(android.content.Context.KEYGUARD_SERVICE) as? android.app.KeyguardManager
    if (km?.isDeviceSecure != true || Build.VERSION.SDK_INT < 28) { done(true); return }
    val exec = ctx.mainExecutor
    val b = android.hardware.biometrics.BiometricPrompt.Builder(ctx).setTitle(title).setSubtitle("Bekreft at det er deg")
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

/* ---------- «Nytt i denne versjonen» ---------- */

/** Over hele appen (KalRoot). Tegner ingenting når det ikke er noe nytt. */
@Composable
fun News51Host(vm: KalVm) {
    val n = vm.k51.news ?: return
    val k = LocalK.current
    BackHandler { vm.k51.dismissNews() }
    Box(Modifier.fillMaxSize().background(k.dim).tap("Lukk") { vm.k51.dismissNews() }.windowInsetsPadding(WindowInsets.systemBars).padding(22.dp), contentAlignment = Alignment.Center) {
        News51Card(n) { Hap.tick(); vm.k51.dismissNews() }
    }
}

@Composable
private fun News51Card(n: Kal51News, close: () -> Unit) {
    val k = LocalK.current
    Column(
        Modifier.widthIn(max = 440.dp).fillMaxWidth().shadow(16.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(k.bg)
            .border(1.dp, k.line, RoundedCornerShape(24.dp)).tap(null) { }.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Tx("NYTT I DENNE VERSJONEN", mono(10.5.sp, Red, .12f))
        Tx(n.title.ifBlank { "Versjon " + n.version }, news(26.sp, k.ink, 30.sp), maxLines = 3)
        Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            n.items.forEach { t ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Tx("•", man(14.sp, FontWeight.Bold, Red))
                    Tx(t, man(14.sp, FontWeight.Medium, k.ink, 20.sp), maxLines = 8)
                }
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Tx(n.version + (if (n.date.isBlank()) "" else " · " + n.date), mono(11.sp, k.mut2).copy(textAlign = TextAlign.Start), Modifier.weight(1f))
            Spacer(Modifier.height(1.dp))
            InkPill("Fint", close)
        }
    }
}
