package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.util.Locale
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/* ======================= QR-innlogging ======================= */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun Sheet38(onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    ModalBottomSheet(onDismissRequest = onClose, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(start = 18.dp, end = 18.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
internal fun QrSheet38(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p38
    val ctx = LocalContext.current
    val clip = LocalClipboardManager.current
    val close = { s.qrOpen = false; s.qrErr = null }
    Sheet38(close) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PSerif("Logg inn på annen enhet", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
            SheetButton30("Lukk", "secondary", onClick = close)
        }
        Text("Åpne innloggingssiden på den nye enheten (nettleser, Mac eller nettbrett) og skann QR-koden med mobilen.", color = p.mut, fontSize = 13.5.sp, lineHeight = 19.sp)
        // Prompt 46: «Skann QR-kode» med Googles skanner-UI (ingen kameratillatelse). Teksten går til samme håndtering som innlimt kode.
        Row(
            Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(26.dp)).background(p.ink).clickable(role = Role.Button) {
                if (s.qrBusy) return@clickable
                Haptics.tap()
                s.qrErr = null
                no.kristo.finanshub.QrScan46.start(ctx, onRaw = { raw -> s.qrCode = raw; vm.qrScanned46(raw) }, onMsg = { s.qrErr = it })
            }.padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        ) {
            androidx.compose.material3.Icon(Icons.Filled.QrCodeScanner, null, tint = p.bg, modifier = Modifier.size(22.dp))
            Text("Skann QR-kode", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
        Text("Hold mobilen over QR-koden på den nye enheten. Da åpnes godkjenningen her.", color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
        PLabel("ELLER LIM INN KODEN", p.mut)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f).height(46.dp).clip(RoundedCornerShape(14.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(horizontal = 12.dp),
                contentAlignment = Alignment.CenterStart) {
                if (s.qrCode.isEmpty()) Text("papir://login?s=…", color = p.mut, fontSize = 13.5.sp, fontFamily = PaperFonts.mono, maxLines = 1)
                BasicTextField(s.qrCode, { s.qrCode = it.trim(); s.qrErr = null }, singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 13.5.sp, fontFamily = PaperFonts.mono), cursorBrush = SolidColor(p.ink),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
            }
            Box(Modifier.height(46.dp).clip(RoundedCornerShape(14.dp)).background(p.surf2).clickable(role = Role.Button) {
                Haptics.select(); s.qrCode = clip.getText()?.text?.trim().orEmpty(); s.qrErr = null
            }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) { Text("Lim inn", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        }
        s.qrErr?.let { Text(it, color = RED38, fontSize = 13.sp, lineHeight = 18.sp) }
        val code = qrCodeOf38(s.qrCode)
        PButton(if (s.qrBusy) "Henter …" else "Fortsett", Modifier.fillMaxWidth()) {
            if (code == null) { s.qrErr = "Fant ingen gyldig kode. Lim inn hele lenken fra QR-koden."; Haptics.error() } else vm.qrScanned46(s.qrCode)
        }
        Text("Koden inneholder aldri passord eller token, og gjelder i 60 sekunder.", color = p.mut, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
internal fun QrAskSheet38(vm: AppViewModel, a: QrAsk38) {
    val p = PaperPal.current
    val s = vm.p38
    val ctx = LocalContext.current
    var err by remember(a.sid) { mutableStateOf<String?>(null) }
    Sheet38({ s.qrAsk = null }) {
        Text("Logge inn på ny enhet?", color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp)
        PCard {
            listOf("Enhet" to a.device, "Sted" to a.place, "Konto" to a.account).forEachIndexed { i, (k, v) ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(k, color = p.mut, fontSize = 13.5.sp, modifier = Modifier.width(72.dp))
                    Text(v, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                }
            }
            if (a.match.isNotBlank()) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Kode", color = p.mut, fontSize = 13.5.sp, modifier = Modifier.width(72.dp))
                    Text(a.match, color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 30.sp, letterSpacing = 4.sp)
                }
            }
        }
        if (a.match.isNotBlank()) Text("Sjekk at tallene ${a.match} også står på den nye skjermen. Godkjenn bare hvis det er deg.", color = p.ink, fontSize = 13.5.sp, lineHeight = 19.sp)
        err?.let { Text(it, color = RED38, fontSize = 13.sp, lineHeight = 18.sp) }
        PButton(if (s.qrBusy) "Godkjenner …" else "Godkjenn med fingeravtrykk", Modifier.fillMaxWidth()) {
            if (s.qrBusy) return@PButton
            err = null
            confirm38(ctx, "Godkjenn innlogging", "${a.device} · ${a.account}", onOk = { vm.answerQr38(true) }, onFail = { err = it; Haptics.error() })
        }
        Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(24.dp)).border(1.dp, p.line, RoundedCornerShape(24.dp))
            .clickable(role = Role.Button) { if (!s.qrBusy) vm.answerQr38(false) }, contentAlignment = Alignment.Center) {
            Text("Avvis", color = RED38, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
    }
}

@Composable
internal fun QrResultSheet38(vm: AppViewModel, r: QrResult38) {
    val p = PaperPal.current
    val close = { vm.p38.qrResult = null }
    Sheet38(close) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(if (r.ok) GREEN38 else RED38), contentAlignment = Alignment.Center) {
                Text(if (r.ok) "✓" else "×", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
            }
            PSerif(r.title, 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
        }
        Text(r.text, color = p.ink, fontSize = 14.sp, lineHeight = 20.sp)
        PButton("Ferdig", Modifier.fillMaxWidth(), onClick = close)
    }
}

/* ======================= Kalender ber om innlogging ======================= */

@Composable
internal fun AppAuthSheet41(vm: AppViewModel, a: AppAuth41) {
    val p = PaperPal.current
    val s = vm.p41
    val ctx = LocalContext.current
    var err by remember(a.state) { mutableStateOf<String?>(null) }
    // Engangskoden må brukes innen 60 s: arket lukkes og appen får «avbrutt» hvis ingen svarer.
    LaunchedEffect(a.state) { delay(120_000); if (s.appAuth?.state == a.state) vm.rejectAppAuth41() }
    Sheet41({ vm.rejectAppAuth41() }) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Color.White).border(1.dp, p.line, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(java.time.LocalDate.now().dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale("nb", "NO")).uppercase().take(3), color = Color(0xFFC0392B), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    Text("${java.time.LocalDate.now().dayOfMonth}", color = Color(0xFF1B1A17), fontSize = 20.sp, fontWeight = FontWeight.Medium)
                }
            }
            PSerif("Logge inn i ${a.appName}?", 24.sp, modifier = Modifier.weight(1f), maxLines = 2)
        }
        PCard {
            listOf("App" to a.appName, "Konto" to vm.displayName.ifBlank { vm.account?.username ?: "" }, "Server" to vm.base.substringAfter("://").trimEnd('/')).forEachIndexed { i, (k, v) ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(k, color = p.mut, fontSize = 13.5.sp, modifier = Modifier.width(72.dp))
                    Text(v, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                }
            }
        }
        Text("${a.appName} får sin egen innlogging på denne kontoen. Du kan logge den ut i Innstillinger → Konto → Enheter.", color = p.mut, fontSize = 13.sp, lineHeight = 18.sp)
        (err ?: s.appAuthErr)?.let { Text(it, color = p.lab, fontSize = 13.sp, lineHeight = 18.sp) }
        PButton(if (s.appAuthBusy) "Godkjenner …" else "Godkjenn med fingeravtrykk", Modifier.fillMaxWidth()) {
            if (s.appAuthBusy) return@PButton
            err = null
            confirm41(ctx, "Logg inn i ${a.appName}", vm.displayName, onOk = { vm.approveAppAuth41() }, onFail = { err = it; Haptics.error() })
        }
        Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(24.dp)).border(1.dp, p.line, RoundedCornerShape(24.dp))
            .clickable(role = Role.Button) { vm.rejectAppAuth41() }, contentAlignment = Alignment.Center) {
            Text("Avvis", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
    }
}

/* ======================= QR-innlogging: vis QR på innloggingsskjermen ======================= */

@Composable
internal fun QrLoginButton46(onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(25.dp)).border(1.dp, p.line, RoundedCornerShape(25.dp)).clickable(role = Role.Button) { Haptics.tap(); onClick() }.padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
    ) {
        WxIcon("M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2", p.ink, 20.dp, stroke = 1.9f)
        Text("Logg inn med QR-kode", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
    }
}

/** Stor QR (maks 320 dp, sentrert på Fold), nedtelling (2 min) og ny kode ved utløp. «Scan med Papir Finans på mobilen». */
@Composable
internal fun QrLoginScreen46(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p46
    androidx.activity.compose.BackHandler { vm.closeQrLogin46() }
    val q = s.qrShow
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(q?.sid) { while (true) { now = System.currentTimeMillis(); kotlinx.coroutines.delay(500) } }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, null) {}, contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.widthIn(max = 520.dp).fillMaxWidth().statusBarsPadding().navigationBarsPadding().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                PSerif("Logg inn med QR-kode", 26.sp, modifier = Modifier.weight(1f), maxLines = 2)
                SheetButton30("Lukk", "secondary") { vm.closeQrLogin46() }
            }
            val err = s.qrShowErr
            if (q == null && err == null) Box(Modifier.size(280.dp), contentAlignment = Alignment.Center) { androidx.compose.material3.CircularProgressIndicator(color = p.ink) }
            if (q != null) {
                val mat = remember(q.payload) { runCatching { Qr46.matrix(q.payload) }.getOrNull() }
                Box(Modifier.widthIn(max = 320.dp).fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(20.dp)).background(Color.White).padding(14.dp)) {
                    if (mat != null) androidx.compose.foundation.Canvas(Modifier.fillMaxSize().semantics { contentDescription = "QR-kode for innlogging" }) {
                        val n = mat.size + 8
                        val c = size.minDimension / n
                        for (y in mat.indices) for (x in mat[y].indices) if (mat[y][x])
                            drawRect(Color.Black, Offset((x + 4) * c, (y + 4) * c), androidx.compose.ui.geometry.Size(c + .5f, c + .5f))
                    }
                    if (q.state == "scanned" || q.state == "approved") Box(Modifier.matchParentSize().background(Color.White.copy(alpha = .92f)), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(if (q.state == "approved") "Godkjent – logger inn …" else "Skannet" + (q.who?.let { " av $it" } ?: ""), color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            q.match?.let { Text(it, color = Color(0xFF1B1A17), fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 40.sp, letterSpacing = 6.sp) }
                            if (q.state == "scanned") Text("Sjekk at tallet er det samme på mobilen, og godkjenn der.", color = Color(0xFF6B655B), fontSize = 13.sp)
                        }
                    }
                }
                val left = ((q.expiresAt - now) / 1000).coerceAtLeast(0)
                Text(when (q.state) {
                    "denied" -> "Avvist på mobilen. Lager en ny kode …"
                    "approved" -> "Godkjent"
                    else -> if (left > 0) "Gjelder i ${left / 60}:${(left % 60).toString().padStart(2, '0')} · fornyes automatisk" else "Lager en ny kode …"
                }, color = p.mut, fontSize = 13.sp)
            }
            Text("Skann med Papir Finans på mobilen: Innstillinger → Konto → Logg inn på annen enhet (eller Mer → Logg inn på annen enhet).",
                color = p.ink, fontSize = 14.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Text("Koden inneholder aldri passord eller token. Den nye enheten får sin egen innlogging, som du kan logge ut under Innstillinger → Enheter.",
                color = p.mut, fontSize = 12.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            err?.let {
                Text(it, color = p.lab, fontSize = 13.5.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                PButton("Prøv igjen", Modifier.fillMaxWidth(), height = 46.dp) { val srv = vm.p46.qrSrv; vm.closeQrLogin46(); vm.openQrLogin46(srv) }
            }
            Text("‹ Logg inn med passord i stedet", color = p.lab, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { vm.closeQrLogin46() }.padding(8.dp))
        }
    }
}
