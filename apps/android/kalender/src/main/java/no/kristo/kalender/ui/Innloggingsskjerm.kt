package no.kristo.kalender.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate as rotateDraw
import androidx.compose.animation.core.animateFloat
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.kalender.Hap
import no.kristo.kalender.KEv
import no.kristo.kalender.Kal41
import no.kristo.kalender.Kal89
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.reduceMotion
import android.os.Build
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import no.kristo.kalender.Kal46Guard
import no.kristo.kalender.Kal46Prefs
import no.kristo.kalender.Kal46Qr
import no.kristo.kalender.Kal46Rask
import no.kristo.kalender.setPref46
import no.kristo.kalender.KLight

/* Innloggingsskjermen uten serverfelt (prompt 41, auVals i Kalender App.dc.html) og «Logg inn med QR-kode» (prompt 46). */

/* ---------------- Innlogging ---------------- */

@Composable
fun LoginScreen41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    LaunchedEffect(Unit) { s.loadWho() }
    val title = when (s.phase) { "wait" -> "Godkjenn i Homelab"; "err" -> "Fikk ikke logget inn"; "qr" -> "Logg inn med QR-kode"; "approve51" -> "Venter på godkjenning"; else -> "Velkommen til Kalender" }
    val sub = when (s.phase) {
        "wait" -> "Homelab åpnes og spør om Kalender får logge inn. Du kommer tilbake hit av deg selv."
        "approve51" -> "Denne enheten er ny for kontoen din."
        "err", "qr" -> ""
        else -> "Bruk samme konto som i Homelab. Kalendere, bursdager og frister synkes med en gang."
    }
    // Prompt 89: tannhjul øverst til høyre → Server-arket (samme lagring som Innstillinger → Server), valgt server under knappene.
    val ctx89 = androidx.compose.ui.platform.LocalContext.current
    var srv89 by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    var tick89 by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(0) }
    Box(Modifier.fillMaxSize()) {
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.systemBars).imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterVertically),
    ) {
        val T = no.kristo.kalender.today()
        Column(Modifier.size(84.dp).shadow(10.dp, RoundedCornerShape(20.dp)).clip(RoundedCornerShape(20.dp)).background(KLight.card), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.fillMaxWidth().height(24.dp).background(Red), contentAlignment = Alignment.Center) {
                Tx(no.kristo.kalender.WS[T.dayOfWeek.value % 7].uppercase(), man(KType.caption, FontWeight.ExtraBold, Color.White))
            }
            Box(Modifier.fillMaxWidth().height(60.dp), contentAlignment = Alignment.Center) { Tx("${T.dayOfMonth}", news(KType.largeTitle, KLight.ink, 44.sp)) }
        }
        Column(Modifier.widthIn(max = 320.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Tx(title, news(KType.title2, k.ink, 33.sp).copy(textAlign = TextAlign.Center), maxLines = 2)
            if (sub.isNotEmpty()) Tx(sub, man(KType.callout, FontWeight.Medium, k.mut, 21.sp).copy(textAlign = TextAlign.Center), maxLines = 4)
        }
        Column(Modifier.widthIn(max = 340.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when (s.phase) {
                "wait" -> Wait41(vm)
                "err" -> Err41(vm)
                "pw" -> Pw41(vm)
                // Prompt 46: QR-koden (skannes med Papir Finans eller en innlogget Kalender på mobilen).
                "qr" -> QrLogin46(vm)
                // Prompt 51: ny enhet må godkjennes fra en kjent enhet (Enhetsgodkjenning.kt).
                "approve51" -> Approve51(vm)
                else -> Start41(vm)
            }
            if (s.phase == "start" || s.phase == "pw" || s.phase == "err") {
                val host = androidx.compose.runtime.remember(tick89) { Kal89.hostLabel(Kal41.external(ctx89)) }
                Tx("Server: $host", man(KType.footnote, FontWeight.Medium, k.mut), Modifier.semantics { contentDescription = "Server: $host" })
            }
        }
    }
    Box(Modifier.align(Alignment.TopEnd).windowInsetsPadding(WindowInsets.statusBars).padding(6.dp).size(48.dp).clip(CircleShape)
        .tap("Server") { Hap.tick(); srv89 = true }, contentAlignment = Alignment.Center) { Gear89(22.dp, k.mut) }
    }
    if (srv89) ServerDialog47(onClose = { srv89 = false; tick89++ }, login = true)
}

/** Tannhjul (Material «settings»-formen) tegnet selv – Kalender har ikke ikonbiblioteket. */
@Composable
private fun Gear89(size: androidx.compose.ui.unit.Dp, color: Color) {
    Canvas(Modifier.size(size).semantics { contentDescription = "Server" }) {
        val c = Offset(this.size.width / 2, this.size.height / 2)
        val r = this.size.minDimension / 2
        for (i in 0 until 8) rotateDraw(i * 45f, c) {
            drawRoundRect(color, Offset(c.x - r * .17f, c.y - r), androidx.compose.ui.geometry.Size(r * .34f, r * .5f), androidx.compose.ui.geometry.CornerRadius(r * .08f))
        }
        drawCircle(color, r * .5f, c, style = Stroke(width = r * .42f))
    }
}

@Composable
private fun Start41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    s.whoName?.let { n ->
        Row(
            Modifier.fillMaxWidth().height(62.dp).clip(RoundedCornerShape(20.dp)).background(k.ink).tap("Fortsett som $n") { s.quick() }.padding(start = 10.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(42.dp).clip(CircleShape).background(Red), contentAlignment = Alignment.Center) { Tx(n.take(1).uppercase(), man(KType.callout, FontWeight.ExtraBold, Color.White)) }
            Column(Modifier.weight(1f)) {
                Tx("Fortsett som $n", man(KType.body, FontWeight.Bold, k.bg))
                Tx("Innlogget i Homelab på denne enheten", man(KType.footnote, FontWeight.Medium, k.bg.copy(alpha = .75f)))
            }
            Chevron(k.bg, 16.dp)
        }
    }
    Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(26.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(26.dp)).tap("Logg inn med Homelab-appen") { s.viaApp() },
        contentAlignment = Alignment.Center) { Tx("Logg inn med Homelab-appen", man(KType.callout, FontWeight.Bold, k.ink)) }
    QrButton46(vm)
    Box(Modifier.fillMaxWidth().height(44.dp).tap("Bruk brukernavn og passord") { s.password() }, contentAlignment = Alignment.Center) {
        Tx("Bruk brukernavn og passord", man(KType.subheadline, FontWeight.Bold, k.mut))
    }
}

@Composable
private fun Wait41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    Spark(34.dp, true)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(k.card).padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("Åpner Homelab", "Godkjenn i Homelab (Face ID / fingeravtrykk)", "Sender deg tilbake til Kalender", "Henter kalenderne dine").forEachIndexed { i, n ->
            val c = if (i <= s.step) k.ink else k.mut
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Tx(if (i < s.step) "✓" else if (i == s.step) "•" else "·", man(KType.subheadline, FontWeight.Bold, c), Modifier.width(16.dp))
                Tx(n, man(KType.subheadline, if (i == s.step) FontWeight.Bold else FontWeight.Medium, c))
            }
        }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, k.line, RoundedCornerShape(22.dp)).tap("Åpne Homelab igjen") { s.viaApp() }, contentAlignment = Alignment.Center) {
            Tx("Åpne Homelab igjen", man(KType.subheadline, FontWeight.Bold, k.ink))
        }
        Box(Modifier.weight(1f).height(44.dp).tap("Avbryt") { s.cancel() }, contentAlignment = Alignment.Center) { Tx("Avbryt", man(KType.subheadline, FontWeight.Bold, k.mut)) }
    }
}

@Composable
private fun Err41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(k.card).border(1.5.dp, Red, RoundedCornerShape(16.dp)).padding(horizontal = 14.dp, vertical = 12.dp)) {
        Tx(s.err.ifBlank { "Homelab svarte ikke. Sjekk at Homelab-appen er installert og innlogget, og prøv igjen." }, man(KType.subheadline, FontWeight.Medium, k.ink, 19.sp), maxLines = 6)
    }
    Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(26.dp)).background(k.ink).tap("Prøv igjen") { s.viaApp() }, contentAlignment = Alignment.Center) {
        Tx("Prøv igjen", man(KType.callout, FontWeight.Bold, k.bg))
    }
    if (s.webOffer) Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, k.line, RoundedCornerShape(22.dp)).tap("Godkjenn i nettleseren") { s.approveInBrowser() },
        contentAlignment = Alignment.Center) { Tx("Godkjenn i nettleseren", man(KType.subheadline, FontWeight.Bold, k.ink)) }
    Box(Modifier.fillMaxWidth().height(44.dp).tap("Bruk brukernavn og passord") { s.password() }, contentAlignment = Alignment.Center) {
        Tx("Bruk brukernavn og passord", man(KType.subheadline, FontWeight.Bold, k.mut))
    }
    if (s.offerServer) ServerFix41(vm)
}

@Composable
private fun Pw41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    Field41(vm.lUser, { vm.lUser = it }, "Brukernavn", KeyboardType.Text)
    Field41(vm.lPass, { vm.lPass = it }, "Passord", KeyboardType.Password, password = true)
    if (vm.lTotp) Field41(vm.lCode, { vm.lCode = it.filter(Char::isDigit).take(6) }, "6-sifret kode (2FA)", KeyboardType.NumberPassword)
    vm.lErr?.let { Tx(it, man(KType.subheadline, FontWeight.SemiBold, k.acc), Modifier.fillMaxWidth(), maxLines = 4) }
    Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(26.dp)).background(k.ink).tap("Logg inn") { s.submitPassword() }, contentAlignment = Alignment.Center) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (vm.lBusy) Spark(20.dp, true)
            Tx(if (vm.lBusy) "Logger inn …" else "Logg inn", man(KType.callout, FontWeight.Bold, k.bg))
        }
    }
    if (s.offerServer) ServerFix41(vm)
    BackLink("Tilbake", k.mut, man(KType.subheadline, FontWeight.Bold, k.mut)) { Hap.tick(); vm.lErr = null; s.phase = "start" }
}

/** «Endre serveradresse» – bare når ingen adresse svarer. */
@Composable
private fun ServerFix41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    if (!s.serverOpen) {
        Box(Modifier.height(36.dp).tap("Endre serveradresse") { Hap.tick(); s.serverOpen = true }, contentAlignment = Alignment.Center) {
            Tx("Endre serveradresse", man(KType.subheadline, FontWeight.SemiBold, k.acc))
        }
        return
    }
    Field41(s.serverText, { s.serverText = it }, no.kristo.kalender.Kal41.DEFAULT_BASE, KeyboardType.Uri)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        LinePill("Avbryt", { s.serverOpen = false })
        InkPill("Lagre", { s.saveServer() })
    }
}

@Composable
private fun Field41(v: String, on: (String) -> Unit, hint: String, type: KeyboardType, password: Boolean = false) {
    val k = LocalK.current
    Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(16.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp),
        contentAlignment = Alignment.CenterStart) {
        if (v.isEmpty()) Tx(hint, man(KType.callout, FontWeight.Medium, k.mut2))
        BasicTextField(v, on, Modifier.fillMaxWidth().semantics { contentDescription = hint }, textStyle = man(KType.callout, FontWeight.Medium, k.ink), singleLine = true,
            cursorBrush = SolidColor(Red), keyboardOptions = KeyboardOptions(keyboardType = type, imeAction = ImeAction.Next, autoCorrectEnabled = false),
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None)
    }
}

/* ---------------- QR: vis (innloggingsskjermen) ---------------- */

@Composable
fun QrButton46(vm: KalVm) {
    val k = LocalK.current
    Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, k.line, RoundedCornerShape(22.dp))
        .tap("Logg inn med QR-kode") { Hap.tick(); vm.k41.err = ""; vm.k41.phase = "qr" }, contentAlignment = Alignment.Center) {
        Tx("Logg inn med QR-kode", man(KType.subheadline, FontWeight.Bold, k.ink))
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
            else if (Kal46Qr.phase == "scanned") Tx(Kal46Qr.match.ifBlank { "✓" }, mono(KType.title2, KLight.ink))
            else no.kristo.kalender.ui.Spark(28.dp, true)
        }
        val head = when (Kal46Qr.phase) { "scanned" -> "Skannet – godkjenn på mobilen"; "err" -> "Fikk ikke laget koden"; else -> "Logg inn med mobilen" }
        Tx(head, man(KType.body, FontWeight.Bold, k.ink).copy(textAlign = TextAlign.Center), maxLines = 2)
        val sub = if (Kal46Qr.phase == "scanned") "Sjekk at tallet ${Kal46Qr.match} også vises på mobilen."
            else "Skann med Papir Finans på mobilen: Innstillinger → Logg inn på annen enhet. En innlogget Kalender kan også godkjenne."
        Tx(sub, man(KType.subheadline, FontWeight.Medium, k.mut, 18.sp).copy(textAlign = TextAlign.Center), maxLines = 4)
        if (Kal46Qr.phase == "pending") Tx("Koden fornyes om ${Kal46Qr.secondsLeft} s", mono(KType.footnote, k.mut2))
        if (Kal46Qr.phase == "err") {
            Tx(Kal46Qr.err, man(KType.subheadline, FontWeight.SemiBold, k.acc).copy(textAlign = TextAlign.Center), maxLines = 4)
            InkPill("Ny kode", { Hap.tick(); Kal46Qr.start(vm) })
        }
        BackLink("Logg inn på en annen måte", k.mut, man(KType.subheadline, FontWeight.Bold, k.mut)) { Hap.tick(); Kal46Qr.stop(); vm.k41.phase = "start" }
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
            Tx("Logg inn på annen enhet", man(KType.callout, FontWeight.Bold, k.ink))
            Tx("Godkjenn QR-koden Kalender på Mac, iPad eller en annen telefon viser", man(KType.footnote, FontWeight.Medium, k.mut), maxLines = 2)
        }
        Chevron(k.mut)
    }
}

@Composable
fun ScanDialog46(vm: KalVm) {
    if (!Kal46Qr.scanOpen) return
    val k = LocalK.current
    val ctx = LocalContext.current
    Dialog(onDismissRequest = { Kal46Qr.scanOpen = false }) {
        Column(Modifier.clip(RoundedCornerShape(24.dp)).background(k.card).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Tx("Logg inn på annen enhet", news(KType.title3, k.ink), maxLines = 2)
            when (Kal46Qr.scanPhase) {
                "busy" -> Box(Modifier.fillMaxWidth().height(80.dp), contentAlignment = Alignment.Center) { no.kristo.kalender.ui.Spark(28.dp, true) }
                "ask" -> {
                    Tx("Logge inn ${Kal46Qr.askDevice}?", man(KType.callout, FontWeight.Bold, k.ink), maxLines = 3)
                    if (Kal46Qr.askPlace.isNotBlank()) Tx(Kal46Qr.askPlace, man(KType.subheadline, FontWeight.Medium, k.mut), maxLines = 2)
                    Tx("Som ${Kal46Qr.askAccount}", man(KType.subheadline, FontWeight.Medium, k.mut))
                    if (Kal46Qr.askMatch.isNotBlank()) {
                        Tx("Sjekk at tallet også vises på den andre skjermen", man(KType.footnote, FontWeight.Medium, k.mut), maxLines = 2)
                        Tx(Kal46Qr.askMatch, mono(KType.title2, k.ink))
                    }
                    if (Kal46Qr.scanMsg.isNotBlank()) Tx(Kal46Qr.scanMsg, man(KType.subheadline, FontWeight.SemiBold, k.acc), maxLines = 3)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        InkPill("Logg inn", { confirm46(ctx) { ok -> if (ok) Kal46Qr.answer(vm, true) else Kal46Qr.scanMsg = "Godkjenningen ble avbrutt." } }, h = 44.dp)
                        LinePill("Avbryt", { Kal46Qr.answer(vm, false) }, h = 44.dp)
                    }
                }
                "done", "err" -> {
                    Tx(Kal46Qr.scanMsg, man(KType.subheadline, FontWeight.Medium, if (Kal46Qr.scanPhase == "done") k.ink else k.acc, 19.sp), maxLines = 6)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        LinePill("Ny kode", { Kal46Qr.openScan() }, h = 44.dp)
                        InkPill("Ferdig", { Kal46Qr.scanOpen = false }, h = 44.dp)
                    }
                }
                else -> {
                    Tx("Skann QR-koden som den andre enheten viser. Du kan også lime inn lenken eller koden under QR-koden.",
                        man(KType.subheadline, FontWeight.Medium, k.mut, 18.sp), maxLines = 5)
                    // Prompt 46: Googles skanner-UI (ingen kameratillatelse) → samme håndtering som innlimt kode (serversjekk, så biometri før godkjenning).
                    InkPill("Skann QR-kode", {
                        Hap.tick(); Kal46Qr.scanMsg = ""
                        no.kristo.kalender.KalScan46.start(ctx, onRaw = { raw -> Kal46Qr.scanText = raw; Kal46Qr.scan(vm, raw) }, onMsg = { Kal46Qr.scanMsg = it })
                    }, h = 48.dp)
                    Tx("ELLER LIM INN", man(KType.caption, FontWeight.Bold, k.mut2))
                    Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, k.line, RoundedCornerShape(14.dp)).padding(horizontal = 12.dp),
                        contentAlignment = Alignment.CenterStart) {
                        if (Kal46Qr.scanText.isEmpty()) Tx("papir://login?… eller kode", man(KType.callout, FontWeight.Medium, k.mut2))
                        BasicTextField(Kal46Qr.scanText, { Kal46Qr.scanText = it }, Modifier.fillMaxWidth().semantics { contentDescription = "Innloggingskode" },
                            textStyle = man(KType.callout, FontWeight.Medium, k.ink), singleLine = true, cursorBrush = SolidColor(Red))
                    }
                    if (Kal46Qr.scanMsg.isNotBlank()) Tx(Kal46Qr.scanMsg, man(KType.subheadline, FontWeight.SemiBold, k.acc), maxLines = 3)
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
