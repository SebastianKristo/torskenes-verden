package no.kristo.finanshub.ui

import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.provider.MediaStore
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/*
 * Prompt 38 (ANDROID38): QR-innlogging (skann/lim inn, godkjenn-ark med matchkode og biometri), Konto → ØKT, laget som fanger trykk
 * utenfor Glimt-boblen, nye brief-kort, Glimt i prestedrakt, Domener-Glimt og AI-kontroll (Mac mini, Finans-modellvalg). Logikk i P38.kt.
 */

private val RED38 = Color(0xFFB23A2A)
private val BLUE38 = Color(0xFF2B5D8A)
private val GREEN38 = Color(0xFF2F7A4F)
private val OSLO38: ZoneId = ZoneId.of("Europe/Oslo")
private val WD38 = listOf("man", "tir", "ons", "tor", "fre", "lør", "søn")
private val MS38 = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")

/** «tir 23. okt» fra «2026-10-23…»; ellers teksten som den er. */
private fun day38(iso: String?): String? {
    val d = iso?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: return iso
    return "${WD38[d.dayOfWeek.value - 1]} ${d.dayOfMonth}. ${MS38[d.monthValue - 1]}"
}

private tailrec fun Context.activity38(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.activity38()
    else -> null
}

/** Fingeravtrykk/ansikt (PIN/mønster som reserve). Uten skjermlås på telefonen kan det ikke godkjennes. */
private fun confirm38(ctx: Context, title: String, sub: String, onOk: () -> Unit, onFail: (String) -> Unit) {
    val act = ctx.activity38() ?: return onFail("Fikk ikke åpnet bekreftelsen")
    val auth = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
    if (BiometricManager.from(act).canAuthenticate(auth) != BiometricManager.BIOMETRIC_SUCCESS) return onFail("Sett opp skjermlås (fingeravtrykk, ansikt eller PIN) på telefonen for å godkjenne.")
    val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { onOk() }
        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            if (errorCode != BiometricPrompt.ERROR_USER_CANCELED && errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON && errorCode != BiometricPrompt.ERROR_CANCELED) onFail(errString.toString())
        }
    })
    prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle(sub).setAllowedAuthenticators(auth).build())
}

/* ======================= Globalt (Paper.kt) ======================= */

@Composable
internal fun Global38(vm: AppViewModel) {
    val s = vm.p38
    val life = LocalLifecycleOwner.current
    LaunchedEffect(vm.account?.id) {
        vm.qrAfterLogin38()
        vm.prefetchDomains38(force = true)
    }
    DisposableEffect(life) {
        val o = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_START) vm.prefetchDomains38() }
        life.lifecycle.addObserver(o)
        onDispose { life.lifecycle.removeObserver(o) }
    }
    if (s.qrOpen) QrSheet38(vm)
    s.qrAsk?.let { QrAskSheet38(vm, it) }
    s.qrResult?.let { QrResultSheet38(vm, it) }
    if (s.outAsk) AlertDialog(
        onDismissRequest = { s.outAsk = false },
        title = { Text("Logge ut?") },
        text = { Text("Logge ut av Homelab på denne enheten?") },
        confirmButton = { TextButton(onClick = { s.outAsk = false; vm.logout() }) { Text("Logg ut", color = RED38, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton(onClick = { s.outAsk = false }) { Text("Avbryt") } },
    )
    if (s.allOpen) LogoutAllSheet38(vm)
}

/**
 * Usynlig lag rundt Glimt-boblen på Hjem (fire flater rundt et hull der boblen står). Første berøring lukker boblen og fanges,
 * så kortet under (f.eks. Vær) ikke åpnes; også scroll lukker. Legges under fullskjermsflatene (Nyheter, Brief …) i Paper.kt.
 */
@Composable
internal fun AnsScrim38(vm: AppViewModel) {
    val r = vm.p38.ansRect ?: return
    if (vm.p31.ans == null) return
    var origin by remember { mutableStateOf(Offset.Zero) }
    val d = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxSize().onGloballyPositioned { origin = it.positionInRoot() }) {
        val w = constraints.maxWidth.toFloat()
        val h = constraints.maxHeight.toFloat()
        val rr = Rect(r.left - origin.x, r.top - origin.y, r.right - origin.x, r.bottom - origin.y)
        val catcher = Modifier.pointerInput(Unit) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                down.consume()
                vm.closeAns31()
                Haptics.dismiss()
                // Resten av berøringen (slipp/dra) fanges også.
                do {
                    val ev = awaitPointerEvent()
                    ev.changes.forEach { it.consume() }
                } while (ev.changes.any { it.pressed })
            }
        }
        with(d) {
            val top = rr.top.coerceIn(0f, h)
            val bottom = rr.bottom.coerceIn(0f, h)
            Box(catcher.offset(0.dp, 0.dp).size(w.toDp(), top.toDp()))
            Box(catcher.offset(0.dp, bottom.toDp()).size(w.toDp(), (h - bottom).coerceAtLeast(0f).toDp()))
            Box(catcher.offset(0.dp, top.toDp()).size(rr.left.coerceIn(0f, w).toDp(), (bottom - top).coerceAtLeast(0f).toDp()))
            Box(catcher.offset(rr.right.coerceIn(0f, w).toDp(), top.toDp()).size((w - rr.right).coerceAtLeast(0f).toDp(), (bottom - top).coerceAtLeast(0f).toDp()))
        }
    }
}

/**
 * Rammen rundt Glimt-boblen: ✕ oppe til høyre (30 dp, glass), sveip opp > 40 dp lukker med glid og fade (under terskelen spretter den
 * tilbake), lite håndtak nederst. Posisjonen meldes til AnsScrim38, og nullstilles når boblen forsvinner.
 */
@Composable
internal fun AnsBox38(vm: AppViewModel, content: @Composable () -> Unit) {
    var drag by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()
    val limit = with(LocalDensity.current) { 40.dp.toPx() }
    DisposableEffect(Unit) { onDispose { vm.p38.ansRect = null } }
    val close: () -> Unit = { Haptics.dismiss(); vm.closeAns31() }
    Box(
        Modifier.fillMaxWidth()
            .onGloballyPositioned { vm.p38.ansRect = it.boundsInRoot() }
            .graphicsLayer { translationY = drag; alpha = (1f + drag / (limit * 3f)).coerceIn(0f, 1f) }
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragEnd = {
                        scope.launch {
                            if (-drag > limit) {
                                animate(drag, -size.height.toFloat() * .6f, animationSpec = tween(170)) { v, _ -> drag = v }
                                close()
                                drag = 0f
                            } else animate(drag, 0f, animationSpec = spring(dampingRatio = .6f)) { v, _ -> drag = v }
                        }
                    },
                    onDragCancel = { scope.launch { animate(drag, 0f, animationSpec = spring()) { v, _ -> drag = v } } },
                ) { ch, amt ->
                    ch.consume()
                    val n = drag + amt
                    drag = if (n > 0f) minOf(n * .5f, limit * .3f) else n
                }
            },
    ) {
        content()
        Box(
            Modifier.align(Alignment.TopEnd).padding(top = 10.dp, end = 10.dp).size(30.dp).clip(CircleShape).background(Color.White.copy(alpha = .14f))
                .border(1.dp, Color.White.copy(alpha = .14f), CircleShape).clickable(role = Role.Button, onClickLabel = "Lukk svaret") { close() },
            contentAlignment = Alignment.Center,
        ) { Text("✕", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp).size(36.dp, 4.dp).clip(CircleShape).background(Color.White.copy(alpha = .28f)))
    }
}

/* ======================= QR-innlogging ======================= */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Sheet38(onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    ModalBottomSheet(onDismissRequest = onClose, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(start = 18.dp, end = 18.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
private fun QrSheet38(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p38
    val ctx = LocalContext.current
    val clip = LocalClipboardManager.current
    val close = { s.qrOpen = false; s.qrErr = null }
    Sheet38(close) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PSerif("Logg inn på ny enhet", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
            SheetButton30("Lukk", "secondary", onClick = close)
        }
        Text("Åpne innloggingssiden på den nye enheten (nettleser, Mac eller nettbrett) og skann QR-koden med mobilen.", color = p.mut, fontSize = 13.5.sp, lineHeight = 19.sp)
        // Skanner uten kamerabibliotek: systemkameraet leser koden og åpner lenken (homelab://login …), som kommer tilbake hit.
        Row(
            Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(26.dp)).background(p.ink).clickable(role = Role.Button) {
                Haptics.tap()
                val ok = runCatching { ctx.startActivity(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess
                if (!ok) s.qrErr = "Fant ingen kamera-app. Lim inn koden i stedet."
            }.padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        ) {
            androidx.compose.material3.Icon(Icons.Filled.QrCodeScanner, null, tint = p.bg, modifier = Modifier.size(22.dp))
            Text("Skann med kameraet", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
        Text("Hold mobilen over koden og trykk på lenken kameraet viser. Da åpnes godkjenningen her.", color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
        PLabel("ELLER LIM INN KODEN", p.mut)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f).height(46.dp).clip(RoundedCornerShape(14.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(horizontal = 12.dp),
                contentAlignment = Alignment.CenterStart) {
                if (s.qrCode.isEmpty()) Text("homelab://login?c=…", color = p.mut, fontSize = 13.5.sp, fontFamily = PaperFonts.mono, maxLines = 1)
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
            if (code == null) { s.qrErr = "Fant ingen gyldig kode. Lim inn hele lenken fra QR-koden."; Haptics.error() } else vm.scanQr38(code)
        }
        Text("Koden inneholder aldri passord eller token, og gjelder i 60 sekunder.", color = p.mut, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun QrAskSheet38(vm: AppViewModel, a: QrAsk38) {
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
private fun QrResultSheet38(vm: AppViewModel, r: QrResult38) {
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

/* ======================= Konto → ØKT ======================= */

@Composable
private fun SesRow38(icon: ImageVector, tint: Color, title: String, sub: String?, red: Boolean = false, top: Boolean = false, onClick: () -> Unit) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = 60.dp).height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.size(32.dp).clip(RoundedCornerShape(9.dp)).background(tint), contentAlignment = Alignment.Center) {
                androidx.compose.material3.Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, color = if (red) RED38 else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
                if (!sub.isNullOrBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (!red) Text("›", color = p.mut, fontSize = 16.sp)
        }
    }
}

/** Nederst på Konto: ENHETER (Logg inn på ny enhet) og ØKT (Lås skjermen, Logg ut, Logg ut av alle enheter). */
@Composable
internal fun Session38(vm: AppViewModel) {
    val s = vm.p38
    val ctx = LocalContext.current
    LaunchedEffect(vm.account?.id) { vm.loadSessions38() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Enheter", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        PCard {
            SesRow38(Icons.Filled.QrCodeScanner, Color(0xFF2E6F75), "Logg inn på ny enhet", "Skann QR-koden på skjermen til den nye enheten") { vm.openQr38() }
        }
        PLabel("Økt", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            SesRow38(Icons.Filled.Lock, BLUE38, "Lås skjermen", "Krever fingeravtrykk, ansikt eller PIN for å fortsette") {
                val auth = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
                if (BiometricManager.from(ctx).canAuthenticate(auth) != BiometricManager.BIOMETRIC_SUCCESS) vm.message = "Sett opp skjermlås på telefonen for å låse appen"
                else { Haptics.tap(); vm.locked = true; (ctx.activity38() as? MainActivity)?.unlock() }
            }
            SesRow38(Icons.AutoMirrored.Filled.Logout, RED38, "Logg ut", "Bare denne enheten", red = true, top = true) { Haptics.tap(); s.outAsk = true }
            SesRow38(Icons.Filled.Devices, Color(0xFF6B665C), "Logg ut av alle enheter",
                s.sessions?.let { n -> "$n ${if (n == 1) "enhet er" else "enheter er"} logget inn · krever passord" } ?: "Avslutter alle økter · krever passord", top = true) {
                Haptics.tap(); s.allPw = ""; s.allErr = null; s.allOpen = true
            }
        }
    }
}

@Composable
private fun LogoutAllSheet38(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p38
    Sheet38({ if (!s.allBusy) s.allOpen = false }) {
        PSerif("Logg ut av alle enheter", 24.sp, maxLines = 1)
        Text(
            "Alle økter avsluttes, også på denne telefonen" + (s.sessions?.let { " ($it ${if (it == 1) "enhet" else "enheter"} er logget inn nå)" } ?: "") + ". Skriv passordet for å bekrefte.",
            color = p.mut, fontSize = 13.5.sp, lineHeight = 19.sp,
        )
        Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp)).background(p.card).border(1.dp, if (s.allErr != null) RED38 else p.line, RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
            if (s.allPw.isEmpty()) Text("Passord", color = p.mut, fontSize = 14.5.sp)
            BasicTextField(s.allPw, { s.allPw = it; s.allErr = null }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
                textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp), cursorBrush = SolidColor(p.ink),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
        }
        s.allErr?.let { Text(it, color = RED38, fontSize = 13.sp) }
        PButton(if (s.allBusy) "Logger ut …" else "Logg ut av alle", Modifier.fillMaxWidth(), kind = "lab") { vm.logoutAll38() }
    }
}

/* ======================= Glimt i prestedrakt ======================= */

private fun DrawScope.path38(d: String, vw: Float, vh: Float, fill: Color?, stroke: Color? = null, sw: Float = 1.5f) {
    scale(size.width / vw, size.height / vh, pivot = Offset.Zero) {
        val path = wxPath(d)
        if (fill != null) drawPath(path, fill)
        if (stroke != null) drawPath(path, stroke, style = Stroke(sw, cap = StrokeCap.Round))
    }
}

/**
 * Glimt i lys kjortel med rød stola og brunt belte, en liten bibel med gyllent ✝ og en pulserende gylden glorie (Bibelvers.dc.html → priest()).
 * Dupper rolig (3 s). Reduser bevegelse: ingen dupping og fast glorie.
 */
@Composable
internal fun PriestFig38(S: Dp, mood: String = "idle", modifier: Modifier = Modifier) {
    val reduce = reduceMotion31()
    val inf = rememberInfiniteTransition(label = "prest38")
    val bob = inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1500, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "bob")
    val halo = inf.animateFloat(.55f, 1f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "halo")
    Box(modifier.size(S * 1.32f, S * 1.6f).graphicsLayer { translationY = if (reduce) 0f else -S.toPx() * .04f * bob.value }.semantics38("Glimt i prestedrakt")) {
        val ox = S * .16f
        val oy = S * .22f
        // Glorie.
        Canvas(Modifier.offset(ox + S * .11f, oy - S * .2f).size(S * .78f, S * .22f)) {
            val a = if (reduce) 1f else halo.value
            val w = S.toPx() * .05f
            drawOval(Color(0xFFF2C14E).copy(alpha = .35f * a), style = Stroke(w * 3f))
            drawOval(Color(0xFFF2C14E).copy(alpha = .6f + .4f * a), style = Stroke(w))
        }
        Box(Modifier.offset(ox, oy)) { GlimtFig35("glimt", S, mood, still = reduce) }
        // Kjortel med stola og belte.
        Canvas(Modifier.offset(ox + S * .5f - S * .58f, oy + S * .72f).size(S * 1.16f, S * .62f)) {
            path38("M18 8 Q58 22 98 8 L110 58 Q58 66 6 58 Z", 116f, 62f, Color(0xFFF6F1E7), Color(0xFFC9BFA9), 1.6f)
            path38("M44 12 L40 60 L50 60 L54 16 Z", 116f, 62f, RED38)
            path38("M72 12 L76 60 L66 60 L62 16 Z", 116f, 62f, RED38)
            path38("M42 34 h8 M66 34 h8", 116f, 62f, null, Color(0xFFF2C14E), 2f)
            path38("M24 40 Q58 48 92 40", 116f, 62f, null, Color(0xFFA8661A), 3f)
        }
        // Bibelen med ✝.
        Box(Modifier.offset(ox + S * .8f, oy + S * .92f).size(S * .36f, S * .28f).graphicsLayer { rotationZ = -10f }.clip(RoundedCornerShape(3.dp))
            .background(Color(0xFF3B2A1A)).border(2.dp, Color(0xFF6B4A2A), RoundedCornerShape(3.dp)), contentAlignment = Alignment.Center) {
            Text("✝", color = Color(0xFFF2C14E), fontWeight = FontWeight.ExtraBold, fontSize = (S.value * .16f).sp, lineHeight = (S.value * .18f).sp)
        }
    }
}

private fun Modifier.semantics38(label: String): Modifier = this.semantics { contentDescription = label }

/* ======================= Brief: nye kort ======================= */

private val CARD_IDS38 = listOf("packages", "family", "school", "birthdays", "aurora")

@Composable
private fun BxCard38(title: String, kick: String, content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(p.card).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, modifier = Modifier.weight(1f), maxLines = 1)
            Text(kick, color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.1.sp, maxLines = 1)
        }
        content()
    }
}

@Composable
private fun BxRow38(lead: @Composable () -> Unit, title: String, sub: String, right: String?, rightUnit: String?, rightRed: Boolean, mono: Boolean, onClick: (() -> Unit)?) {
    val p = PaperPal.current
    Column {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().heightIn(min = 50.dp).then(if (onClick != null) Modifier.clickable(role = Role.Button) { Haptics.tap(); onClick() } else Modifier).padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            lead()
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (sub.isNotBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (right != null) Column(horizontalAlignment = Alignment.End) {
                if (mono) Text(right, color = if (rightRed) RED38 else p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1)
                else Text(right, color = if (rightRed) RED38 else p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                if (rightUnit != null) Text(rightUnit, color = p.mut, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun Badge38(text: String, color: Color, round: Boolean, dot: Color? = null) {
    val p = PaperPal.current
    Box(Modifier.size(36.dp)) {
        Box(Modifier.fillMaxSize().clip(if (round) CircleShape else RoundedCornerShape(11.dp)).background(color), contentAlignment = Alignment.Center) {
            Text(text, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp, maxLines = 1)
        }
        if (dot != null) Box(Modifier.align(Alignment.BottomEnd).size(13.dp).clip(CircleShape).background(p.card).padding(2.dp).clip(CircleShape).background(dot))
    }
}

private fun carrier38(c: String): Pair<String, Color> {
    val l = c.lowercase()
    return when {
        "postnord" in l -> "PN" to Color(0xFF00A0D6)
        "posten" in l || "bring" in l -> "P" to Color(0xFFE32D22)
        "dhl" in l -> "DHL" to Color(0xFFD40511)
        "helthjem" in l -> "HH" to Color(0xFF2F7A4F)
        "ups" in l -> "UPS" to Color(0xFF5B3A1A)
        "dao" in l -> "DAO" to Color(0xFF1B1A17)
        c.isBlank() -> "📦" to Color(0xFF6B665C)
        else -> c.take(2).uppercase() to Color(0xFF6B665C)
    }
}

private fun famDot38(state: String): Color {
    val l = state.lowercase()
    return when { "hjemme" in l -> GREEN38; "vei" in l -> Color(0xFFD9A400); "skole" in l || "jobb" in l -> BLUE38; else -> Color(0xFF8F897C) }
}

/** De nye kortene (etter Abonnementer, før Nyheter), i rekkefølgen fra Innstillinger → Glimt → Brief. */
@Composable
internal fun BriefCards38(vm: AppViewModel, kind: String) {
    val s = vm.p38
    LaunchedEffect(vm.account?.id) { vm.loadBriefCards38() }
    val x = s.bx
    val cards = x?.cards?.takeIf { it.isNotEmpty() } ?: s.cards
    val order = if (cards.isEmpty()) CARD_IDS38 else cards.filter { it.second }.map { it.first }.filter { it in CARD_IDS38 } +
        CARD_IDS38.filter { id -> cards.none { it.first == id } }
    order.forEach { id ->
        when (id) {
            "packages" -> x?.packages?.takeIf { it.isNotEmpty() }?.let { BxPackages38(vm, it, x.pkLabel) }
            "family" -> x?.family?.takeIf { it.isNotEmpty() }?.let { BxFamily38(it, x.famLabel) }
            "school" -> x?.school?.takeIf { it.isNotEmpty() }?.let { BxSchool38(vm, it) }
            "birthdays" -> (x?.birthdays ?: vm.localBirthdays38()).takeIf { it.isNotEmpty() }?.let { BxBirthdays38(vm, it) }
            "aurora" -> x?.aurora?.let { a ->
                val h = LocalTime.now(OSLO38).hour
                val evening = kind == "evening" || kind == "night" || h >= 15 || h < 4
                if (a.show && evening && (a.kp ?: 0.0) >= 3.0) BxAurora38(a)
            }
        }
    }
}

@Composable
private fun BxPackages38(vm: AppViewModel, l: List<BxPkg38>, label: String?) = BxCard38("Pakker", label ?: "${l.size} PÅ VEI") {
    l.take(4).forEach { k ->
        val (ini, col) = carrier38(k.carrier)
        BxRow38({ Badge38(ini, col, round = false) }, k.name, k.status, day38(k.due)?.let { if (k.due?.length ?: 0 >= 10) "Hent innen $it" else it }, null, k.dueRed, mono = true) {
            vm.stopSay35(); vm.closeBrief34(); vm.go(Screen.Tracking)
        }
    }
}

@Composable
private fun BxFamily38(l: List<BxFam38>, label: String?) {
    val p = PaperPal.current
    BxCard38("Familie", label ?: if (l.size == 1) "1 DELER POSISJON" else "${l.size} DELER POSISJON") {
        l.take(6).chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                row.forEach { f ->
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Badge38(f.name.take(1).uppercase(), f.color?.let { Color(it) } ?: BLUE38, round = true, dot = f.dot?.let { Color(it) } ?: famDot38(f.state))
                        Column(Modifier.weight(1f)) {
                            Text(f.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
                            Text(listOfNotNull(f.state.takeIf { it.isNotBlank() }, f.place ?: f.since).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun BxSchool38(vm: AppViewModel, l: List<BxSchool38>) = BxCard38("Skole og jobb", "NESTE 7 DAGER") {
    l.take(5).forEach { k ->
        BxRow38({ Box(Modifier.width(6.dp).height(34.dp).clip(RoundedCornerShape(3.dp)).background(k.color?.let { Color(it) } ?: GREEN38)) },
            k.title, listOfNotNull(day38(k.date), k.kind?.let { when (it) { "prove" -> "Prøve"; "frist" -> "Frist"; "mote", "møte" -> "Møte"; else -> null } }).joinToString(" · "),
            k.daysLeft?.toString(), k.daysLeft?.let { if (it == 1) "dag" else "dager" }, k.red, mono = false) {
            vm.stopSay35(); vm.closeBrief34(); vm.openKal26()
        }
    }
}

@Composable
private fun BxBirthdays38(vm: AppViewModel, l: List<BxBd38>) {
    val p = PaperPal.current
    val first = l.first()
    val added = first.name in vm.p38.gifts
    BxCard38("Bursdager", "NESTE") {
        l.take(3).forEach { b ->
            BxRow38({ Badge38(b.name.take(1).uppercase(), b.color?.let { Color(it) } ?: BLUE38, round = true) }, b.name,
                b.text ?: listOfNotNull(b.age?.let { "Fyller $it" }, day38(b.date)).joinToString(" · "), b.daysLeft?.toString(), b.daysLeft?.let { if (it == 1) "dag" else "dager" },
                b.red ?: ((b.daysLeft ?: 99) <= 3), mono = false) { vm.stopSay35(); vm.closeBrief34(); vm.openBirthdays24() }
        }
        Box(Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, p.line, RoundedCornerShape(16.dp)).clickable(enabled = !added, role = Role.Button) { vm.addGift38(first) }
            .padding(horizontal = 13.dp), contentAlignment = Alignment.Center) {
            Text(if (added) "✓ Lagt i Gjøremål" else "+ Gave til ${first.name} i Gjøremål", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
        }
    }
}

@Composable
private fun BxAurora38(a: BxAurora38) {
    val kp = a.kp ?: 0.0
    val good = kp >= 4
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(listOf(Color(0xFF0F1A2E), Color(0xFF1B2340))))
            .drawBehind {
                drawRect(Brush.radialGradient(listOf(Color(0xE69C6AE0), Color.Transparent), Offset(size.width * .85f, 0f), size.width * .7f))
                drawRect(Brush.radialGradient(listOf(Color(0xD93FC79A), Color.Transparent), Offset(size.width * .1f, size.height), size.width * .6f))
            }.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Nordlys i natt", color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, modifier = Modifier.weight(1f), maxLines = 1)
            Text(a.label ?: "KP ${fmt38(kp)} · ${if (good) "GODE" else "MULIGE"} SJANSER", color = Color(0xFFBFF5DF), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.1.sp, maxLines = 1)
        }
        Text(a.text ?: if (good) "Glimt anbefaler å se nordover etter kl. 22." else "Nordlys er mulig lavt i nord om det klarner. Følg med på varselet.",
            color = Color.White.copy(alpha = .9f), fontSize = 14.5.sp, lineHeight = 21.sp)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("KP-INDEKS" to fmt38(kp), "SKYDEKKE" to (a.cloud?.let { "$it %" } ?: "–"), "BEST" to (a.best ?: "–")).forEach { (k, v) ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = .1f)).padding(12.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(k, color = Color.White.copy(alpha = .7f), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, letterSpacing = 1.sp, maxLines = 1)
                    Text(v, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, maxLines = 1)
                }
            }
        }
        Text(a.source ?: "Kilde: NOAA SWPC · MET (skydekke)", color = Color.White.copy(alpha = .65f), fontSize = 12.sp)
    }
}

private fun fmt38(d: Double): String = if (d % 1.0 == 0.0) d.toInt().toString() else String.format(java.util.Locale("nb", "NO"), "%.1f", d)

/* ======================= Domener: Glimt-oppsummering ======================= */

@Composable
internal fun DomGlimt38(vm: AppViewModel) {
    val s = vm.p38
    if (!s.domSumOpen) return
    val p = PaperPal.current
    LaunchedEffect(vm.domain) { vm.loadDomSum38() }
    val sum = s.domSum
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("✦ GLIMT · OPPSUMMERING", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.2.sp, modifier = Modifier.weight(1f))
            Box(Modifier.height(28.dp).clip(CircleShape).background(p.surf2).clickable(enabled = !s.domSumBusy, role = Role.Button) { Haptics.select(); vm.loadDomSum38(fresh = true) }
                .padding(horizontal = 10.dp), contentAlignment = Alignment.Center) { Text("↻ Lag ny", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
            Box(Modifier.size(28.dp).clip(CircleShape).background(p.surf2).clickable(role = Role.Button, onClickLabel = "Lukk") { Haptics.dismiss(); s.domSumOpen = false },
                contentAlignment = Alignment.Center) { Text("✕", color = p.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        }
        if (sum == null || (s.domSumBusy && sum.domain != (vm.domain ?: "*"))) Text("Glimt ser på domenene …", color = p.mut, fontSize = 14.sp)
        else {
            Text(sum.head, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 19.sp, lineHeight = 25.sp)
            sum.pts.forEach { (t, c) ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.padding(top = 6.dp).size(7.dp).clip(CircleShape).background(c?.let { Color(it) } ?: p.mut))
                    Text(t, color = p.ink, fontSize = 13.5.sp, lineHeight = 19.sp)
                }
            }
            sum.meta?.let { Text(it, color = p.mut, fontSize = 11.5.sp, fontFamily = PaperFonts.mono) }
        }
    }
}

/* ======================= AI-kontroll ======================= */

private fun gb38(v: Double, dec: Int = 1): String = String.format(java.util.Locale("nb", "NO"), "%.${dec}f", v).replace(",0", "").let { if (dec == 0) it else it }

/** «Mac mini M4 · 16 GB samlet minne · 2 TB ekstern disk» med minne til modeller (GPU) og ekstern disk. */
@Composable
internal fun AiHw38(vm: AppViewModel, T: AcT34): Boolean {
    val h = vm.p38.hw ?: return false
    AcHead34(T, "AI-MASKIN")
    AcCard34(T) {
        val disk = h.diskTotalGb?.let { t -> (if (t >= 1000) gb38(t / 1000, 1) + " TB" else gb38(t, 0) + " GB") + if (h.external) " ekstern disk" else " disk" }
        Text(h.label ?: listOfNotNull(h.model, h.memGb?.let { gb38(it, 0) + " GB samlet minne" }, disk).joinToString(" · "), color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
        h.chip?.takeIf { it.isNotBlank() && it !in h.model }?.let { Text(it, color = T.mut, fontSize = 12.sp) }
        val b = h.gpuBudgetGb
        if (b != null && b > 0) {
            val u = h.gpuUsedGb ?: 0.0
            Row { Text("Minne til modeller (GPU)", color = T.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f)); Text("${gb38(u)} / ${gb38(b)} GB", color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp) }
            AcBar34(T, (u / b).toFloat().coerceIn(0f, 1f), if (u > b - 1.2) T.warn else T.ok)
        }
        val t = h.diskTotalGb
        if (t != null && t > 0) {
            val used = h.diskUsedGb ?: (t - (h.diskFreeGb ?: t)).coerceAtLeast(0.0)
            Row { Text(if (h.external) "Modeller på ekstern disk" else "Modeller på disk", color = T.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f)); Text("${gb38(used, 0)} / ${gb38(t, 0)} GB", color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp) }
            AcBar34(T, (used / t).toFloat().coerceIn(0f, 1f), T.ink)
        }
        (h.warnings.ifEmpty { if (h.mounted == false) listOf("Ekstern disk mangler · Ollama finner ikke modellene") else emptyList() }).forEach { w ->
            Text(w, color = T.bad, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
        }
        Text("Første svar etter at en modell er lastet ut kan ta opptil 60 s (lastes fra disk).", color = T.mut, fontSize = 12.sp, lineHeight = 16.sp)
    }
    val rec = vm.p38.recommend
    if (rec.isNotEmpty()) {
        AcHead34(T, "ANBEFALT FOR DENNE MASKINEN")
        AcCard34(T) {
            rec.forEachIndexed { i, r ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
                Text(r.text, color = T.ink, fontSize = 13.sp, lineHeight = 18.sp)
                r.env?.let { Text(it, color = T.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp) }
            }
        }
    }
    return true
}

/** «HVILKEN MODELL GJØR HVA I FINANS»: alltid 4 rader (Modell + Reserve), rød advarsel ved sky + finansdata lokalt, tom tilstand. */
@Composable
internal fun AiFinRouting38(vm: AppViewModel, T: AcT34) {
    val s = vm.p38
    LaunchedEffect(vm.account?.id) { vm.loadFinRouting38() }
    val rows = s.finRt ?: FIN_RT38
    val finLocal = vm.p34.aiRules["finLocal"] == true
    AcHead34(T, "HVILKEN MODELL GJØR HVA I FINANS")
    val anyOpts = rows.any { vm.finOptions38(it).isNotEmpty() }
    AcCard34(T) {
        if (s.finEmpty || (!anyOpts && vm.p34.aiModels != null)) {
            Text("Ingen modeller ennå", color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
            Text("Installer en lokal modell eller koble til en sky-modell, så kan du velge hvem som gjør hva i Finans.", color = T.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
            AcPill34(T, "Installer modell ›", solid = true) { vm.setAiTab34("mod") }
            return@AcCard34
        }
        rows.forEachIndexed { i, r ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
            val opts = vm.finOptions38(r)
            val list = opts.map { it.id to (it.label + if (it.local) " · LOKAL" else " · SKY") }
            Text(r.name, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
            if (r.sub.isNotBlank()) Text(r.sub, color = T.mut, fontSize = 12.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AcDrop34(T, "Modell", r.model, list, Modifier.weight(1f)) { vm.setFinRoute38(r.key, it, null) }
                AcDrop34(T, "Reserve", r.fallback, listOf("" to "Ingen") + list, Modifier.weight(1f)) { vm.setFinRoute38(r.key, null, it) }
            }
            val cloud = opts.firstOrNull { it.id == r.model }?.local == false
            when {
                r.warning != null -> Text(r.warning, color = if (finLocal && cloud) T.bad else T.warn, fontSize = 12.sp, lineHeight = 17.sp)
                finLocal && cloud -> Text("«Finansdata forlater aldri huset» er på, men modellen er i skyen. Velg en lokal modell. Reserve i skyen brukes ikke.",
                    color = T.bad, fontSize = 12.sp, lineHeight = 17.sp)
            }
        }
    }
}
