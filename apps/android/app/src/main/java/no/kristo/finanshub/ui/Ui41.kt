package no.kristo.finanshub.ui

import android.content.Context
import android.content.ContextWrapper
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import org.json.JSONObject

/*
 * Prompt 41 (ANDROID41): flatene i appen. Logikken ligger i P41.kt, Fold 1c i Fold41.kt.
 */

/* ======================= Globalt (Paper.kt) ======================= */

@Composable
internal fun Global41(vm: AppViewModel) {
    val s = vm.p41
    LaunchedEffect(Unit) { vm.initP41() }
    LaunchedEffect(vm.account?.id) {
        if (vm.account == null) return@LaunchedEffect
        vm.appAuthAfterLogin41()
        vm.loadServer41()
        vm.loadJourney41()
        vm.loadZones41() // skolesonene registreres som geofence (Live41.kt)
    }
    // Oslo-bakgrunnen: sjekk hvert minutt om timen/tidsrommet er endret; Min reise: sanntid hvert 30. s mens kortet vises.
    LaunchedEffect(Unit) { while (true) { delay(60_000); vm.osloTick41(); if (s.journey != null) vm.loadJourney41() } }
    LaunchedEffect(s.journey?.leftAt) { while (s.journey != null) { vm.loadTrip41(); delay(30_000) } }
    s.appAuth?.let { AppAuthSheet41(vm, it) }
    s.srvSheet?.let { ServerSheet41(vm, it) }
    s.sfKind?.let { SiFraSheet41(vm, it) }
    TripToast41(vm)
    PillGrow41(vm)
    Confetti41(vm)
    if (s.srcOpen) SourcesSheet41(vm)
}

private tailrec fun Context.activity41(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.activity41()
    else -> null
}

/** Fingeravtrykk/ansikt (PIN som reserve). */
private fun confirm41(ctx: Context, title: String, sub: String, onOk: () -> Unit, onFail: (String) -> Unit) {
    val act = ctx.activity41() ?: return onFail("Fikk ikke åpnet bekreftelsen")
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Sheet41(onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    ModalBottomSheet(onDismissRequest = onClose, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(start = 18.dp, end = 18.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
private fun Pill41(text: String, on: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) p.ink else Color.Transparent)
            .border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(18.dp)).clickable(role = Role.Button) { Haptics.select(); onClick() }.padding(horizontal = 15.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
}

/* ======================= Skanneknapp på Hjem ======================= */

/** Rad med rødt skanne-ikon, «Skanneknapp på Hjem» og bryter (samme valg i Tilpass og i «Rediger fanelinjen»). */
@Composable
internal fun ScanHomeRow41(vm: AppViewModel, top: Boolean = false) {
    val p = PaperPal.current
    val on = vm.p41.scanHome
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().clickable(role = Role.Switch) { vm.setScanHome41(!on) }.padding(14.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(p.lab), contentAlignment = Alignment.Center) { Text("+", color = p.onLab, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
            Column(Modifier.weight(1f)) {
                Text("Skanneknapp på Hjem", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1)
                Text(if (on) "Vises på Hjem" else "Skjult på Hjem · vises i de andre fanene", color = p.mut, fontSize = 12.5.sp, maxLines = 2)
            }
            Box(Modifier.size(42.dp, 24.dp).clip(CircleShape).background(if (on) p.pos else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
                Box(Modifier.size(18.dp).clip(CircleShape).background(Color.White))
            }
        }
    }
}

/* ======================= Konto → SERVER ======================= */

@Composable
internal fun Server41(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p41
    LaunchedEffect(vm.account?.id) { vm.loadServer41() }
    val a = vm.account ?: return
    val srv = s.srv ?: Srv41(a.local, a.external.ifBlank { a.server }, vm.flag(AppPrefs.USE_LOCAL, true))
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Server", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PRow("Lokal adresse", "Brukes når du er hjemme på Wi-Fi", srv.local.ifBlank { "Ikke satt" }.removePrefix("http://").removePrefix("https://") + " ›", serif = false) { s.srvTest = null; s.srvSheet = "local" }
            PRow("Ekstern adresse", "Når du er borte", srv.external.ifBlank { DEFAULT_SERVER41 }.removePrefix("https://").removePrefix("http://") + " ›", serif = false, top = true) { s.srvTest = null; s.srvSheet = "external" }
            PToggle("Bytt automatisk", "Lokal når den svarer raskt, ellers ekstern · nå: ${vm.route}", srv.auto, top = true) { vm.saveServer41(srv.local, srv.external, it) }
        }
        Text("Lagres på kontoen din og brukes også av Kalender-appen.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
private fun ServerSheet41(vm: AppViewModel, which: String) {
    val p = PaperPal.current
    val s = vm.p41
    val a = vm.account
    val srv = s.srv ?: Srv41(a?.local.orEmpty(), a?.external?.ifBlank { a.server }.orEmpty(), true)
    var v by remember(which) { mutableStateOf(if (which == "local") srv.local else srv.external.ifBlank { DEFAULT_SERVER41 }) }
    Sheet41({ s.srvSheet = null; s.srvTest = null }) {
        PSerif(if (which == "local") "Lokal adresse" else "Ekstern adresse", 24.sp)
        Text(if (which == "local") "F.eks. http://192.168.1.40:8080. Brukes når du er hjemme på Wi-Fi." else "F.eks. https://home.kristo.no.", color = p.mut, fontSize = 13.sp)
        PField("Adresse", v, { v = it.trim() }, placeholder = if (which == "local") "http://192.168.1.40:8080" else DEFAULT_SERVER41,
            keyboard = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false))
        s.srvTest?.let { Text(it, color = if (s.srvTestOk) p.pos else p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton(if (s.srvBusy) "Tester …" else "Test", Modifier.weight(1f), kind = "line") { vm.testServer41(v) }
            PButton("Lagre", Modifier.weight(1f)) {
                if (which == "local") vm.saveServer41(v, srv.external, srv.auto) else vm.saveServer41(srv.local, v, srv.auto)
            }
        }
    }
}

/** Innlogging: «Får ikke kontakt med Homelab» + «Prøv igjen» og «Endre serveradresse» (serverfeltet vises ikke som standard). */
@Composable
internal fun LoginNoContact41(onRetry: () -> Unit, onEdit: () -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Får ikke kontakt med Homelab", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Text("Sjekk nettet, eller bruk en annen adresse.", color = p.mut, fontSize = 13.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Prøv igjen", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, modifier = Modifier.clickable(role = Role.Button, onClick = onRetry).padding(vertical = 4.dp))
            Text("Endre serveradresse", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.clickable(role = Role.Button, onClick = onEdit).padding(vertical = 4.dp))
        }
    }
}

/* ======================= Kalender ber om innlogging ======================= */

@Composable
private fun AppAuthSheet41(vm: AppViewModel, a: AppAuth41) {
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

/* ======================= Bakgrunn: kreditering i Tilpass ======================= */

/** «Foto: {forfatter} · {lisens} · Wikimedia Commons» med lenke til filsiden, under valgt bilde. Aldri på Hjem. */
@Composable
internal fun BgCredit41(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val line = vm.photoCredit ?: return
    val file = if (vm.photoKind == "oslo") vm.p41.osloFile else null
    Text(
        line + if (file != null) " ↗" else "", color = p.mut, fontSize = 11.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(horizontal = 6.dp).then(if (file != null) Modifier.clickable { openLink(ctx, commonsPage41(file)) } else Modifier),
    )
    if (vm.photoKind == "oslo") Text("Oslo fra lufta · skifter gjennom dagen", color = p.mut, fontSize = 11.5.sp, modifier = Modifier.padding(horizontal = 6.dp))
}

/* ======================= AI-jobber: klokkeslett ======================= */

@Composable
internal fun JobTime41(j: AiJob34, ink: Color, mut: Color) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(j.id) { while (true) { delay(60_000); now = System.currentTimeMillis() } }
    val t = jobTime41(j, now) ?: return
    Column(horizontalAlignment = Alignment.End) {
        Text(t.first, color = ink, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, maxLines = 1)
        t.second?.let { Text(it, color = mut, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, maxLines = 1) }
    }
}

/* ======================= Hjemlys: Si fra ======================= */

/** Tre knapper øverst på Hjemlys: Sjekket inn · Drar snart · Drar nå. */
@Composable
internal fun SiFra41(vm: AppViewModel, night: Boolean) {
    val p = PaperPal.current
    val ink = if (night) Color(0xFFF3EFE6) else p.ink
    val card = if (night) Color(0x1FFFFFFF) else p.card
    PLabel("SI FRA", if (night) Color(0xFFB9B2A4) else p.mut)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(Triple("checkin", "Sjekket inn", "jeg er fremme"), Triple("leaving_soon", "Drar snart", "om litt"), Triple("leaving_now", "Drar nå", "på vei")).forEach { (k, n, sub) ->
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(card).clickable(role = Role.Button) { Haptics.tap(); vm.p41.sfSent = null; vm.p41.sfErr = null; vm.p41.sfKind = k }.padding(12.dp, 12.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(when (k) { "checkin" -> Color(0xFFF2A93B); "leaving_soon" -> Color(0xFF6FA8DC); else -> Color(0xFF3FAE6A) }))
                Text(n, color = ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
                Text(sub, color = if (night) Color(0xFFB9B2A4) else p.mut, fontSize = 11.5.sp, maxLines = 1)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SiFraSheet41(vm: AppViewModel, kind: String) {
    val p = PaperPal.current
    val s = vm.p41
    LaunchedEffect(Unit) { vm.loadSfPeople41(); if (vm.family == null) vm.loadFamily() }
    val people = vm.sfPeople41()
    var to by remember(kind, people.size) { mutableStateOf(vm.sfLastTo41(kind)?.filter { id -> people.any { it.first == id } }?.toSet()?.takeIf { it.isNotEmpty() } ?: people.map { it.first }.toSet()) }
    var place by remember(kind) { mutableStateOf(vm.sfPlace41() ?: "") }
    var mins by remember(kind) { mutableStateOf<Int?>(30) }
    var dest by remember(kind) { mutableStateOf("none") }
    val title = when (kind) { "checkin" -> "Sjekket inn"; "leaving_soon" -> "Drar snart"; else -> "Drar nå" }
    Sheet41({ s.sfKind = null }) {
        PSerif(title, 26.sp)
        val sent = s.sfSent
        if (sent != null) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("✓ SENDT", color = p.pos, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                Text(sent, color = p.ink, fontSize = 15.sp, lineHeight = 21.sp)
            }
            if (kind == "leaving_soon") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("+ 15 min", Modifier.weight(1f), kind = "line") { mins = (mins ?: 30) + 15; vm.plusNotice41(15); s.sfSent = "«${firstName37(vm.displayName)} drar om ca. $mins min» er sendt." }
                PButton("Drar nå", Modifier.weight(1f)) { vm.nowNotice41() }
            }
            PButton("Ferdig", Modifier.fillMaxWidth(), kind = if (kind == "leaving_soon") "line" else "ink") { s.sfKind = null; s.sfSent = null }
            return@Sheet41
        }
        PLabel(if (kind == "checkin") "Hvor er du? (valgfritt)" else "Fra (valgfritt)", p.mut)
        PField("Sted", place, { place = it }, placeholder = "F.eks. Bursdag hos Mari")
        if (kind == "leaving_soon") {
            PLabel("Når drar du?", p.mut)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf<Pair<Int?, String>>(15 to "15 min", 30 to "30 min", 60 to "1 t", null to "Ukjent").forEach { (m, n) -> Pill41(n, mins == m) { mins = m } }
            }
        }
        if (kind == "leaving_now") {
            PLabel("Mål", p.mut)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("home" to "Hjem", "place" to "Annet sted", "none" to "Ikke oppgi").forEach { (k, n) -> Pill41(n, dest == k) { dest = k } }
            }
            if (dest != "none") Text("Med mål starter Vel fremme en tur med forventet tid og «Alt OK?». Uten mål sendes bare beskjeden.", color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
        }
        PLabel("Hvem får beskjed?", p.mut)
        if (people.isEmpty()) Text("Ingen i husstanden ennå. Legg til personer i Familie.", color = p.mut, fontSize = 13.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            people.forEach { (id, n) -> Pill41((if (id in to) "✓ " else "") + firstName37(n), id in to) { to = if (id in to) to - id else to + id } }
        }
        Text("Bare beskjeden og stedet du skriver sendes. Posisjonen din deles ikke.", color = p.mut, fontSize = 12.sp, lineHeight = 16.sp)
        s.sfErr?.let { Text(it, color = p.lab, fontSize = 13.sp) }
        PButton(if (s.sfBusy) "Sender …" else "Send til ${to.size}", Modifier.fillMaxWidth(), kind = "lab", height = 52.dp) {
            // Drar nå med mål = vanlig Hjemlys-tur (serveren starter økta; Hjemlys-skjermen tar over med tid og fremdrift).
            vm.sendNotice41(kind, place, if (kind == "leaving_soon") mins else null, to.toList(), dest = if (kind == "leaving_now") dest else null)
        }
    }
}

/* ======================= Min reise ======================= */

private fun modeColor41(l: Leg41): Color = when (l.mode) {
    "foot", "walk", "gå" -> Color.Transparent
    else -> Color(ruterModeColor(l.mode, l.line ?: ""))
}

/** Etappe-stripen: «Gå 6 › Trikk 19 · 9 min › Gå 2 › 45». */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LegStrip41(legs: List<Leg41>) {
    val p = PaperPal.current
    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        legs.forEachIndexed { i, l ->
            if (i > 0) Text("›", color = p.mut, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterVertically))
            val walk = modeColor41(l) == Color.Transparent
            Box(Modifier.height(22.dp).clip(RoundedCornerShape(6.dp)).background(if (walk) p.bg else modeColor41(l)).padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
                Text(legLabel41(l) + if (l.delayMin >= 3) " +${l.delayMin}" else "", color = if (walk) p.ink else Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}

/**
 * «MIN REISE · SEBASTIAN» (Ruter-siden, over transportfilteret) og «MIN REISE · FORLOT SKOLEN HH:MM» (Hjem, sveip bort).
 * Vises bare når serveren har forhåndsruter for brukeren.
 */
@Composable
internal fun MinReise41(vm: AppViewModel, home: Boolean) {
    val s = vm.p41
    LaunchedEffect(home) { vm.initP41(); if (!home) vm.loadTrip41(force = true) }
    if (!home) LaunchedEffect(Unit) { while (true) { delay(30_000); vm.loadTrip41() } }
    val t = s.trip ?: return
    if (t.options.isEmpty()) return
    if (home) {
        if (!vm.tripOnHome41()) return
        SwipeDismiss39(enabled = true, radius = 22.dp, idle = "Sveip for å skjule", armed = "Slipp for å skjule", done = "Min reise skjult",
            sub = "Kommer tilbake neste gang du forlater skolen", onGone = { vm.hideTrip41() }, onTap = { vm.openRuter() }) { TripCard41(vm, t, true) }
    } else TripCard41(vm, t, false)
}

@Composable
private fun TripCard41(vm: AppViewModel, t: Trip41, home: Boolean) {
    val p = PaperPal.current
    val s = vm.p41
    val first = firstName37(vm.displayName).uppercase()
    // Prompt 46 (claude-code-ruter-innstillinger-i-wiggle.md): innstillingene vises bare i redigering (hold inne / «Rediger stopp»).
    val edit46 = !home && vm.stopEdit
    Column(Modifier.fillMaxWidth().wiggle46(edit46).clip(RoundedCornerShape(22.dp)).background(p.card).then(if (home) Modifier.clickable { vm.openRuter() } else Modifier.longPressEdit(!vm.stopEdit) { Haptics.tap(); vm.stopEdit = true }).padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Prompt 42 (claude-code-ruter-snu-knapp.md): raden er sentrert loddrett mot etikett + tittel, med 10 dp mellomrom.
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                PLabel(if (home) "Min reise · forlot skolen ${hm41(s.journey?.leftAt)}" else "Min reise · $first")
                PSerif("${t.from} → ${t.to}", 21.sp, p.ink, maxLines = 1)
            }
            // «⇄ Snu» som i designet: 36 dp høy pille, 13 dp sidemarg, 1 dp kant, Manrope 700 12,5; treffflate minst 48 dp.
            if (!home) Box(
                Modifier.minimumInteractiveComponentSize().clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Snu retning") { Haptics.select(); vm.flipTrip41() },
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(horizontal = 13.dp), contentAlignment = Alignment.Center) {
                    Text("⇄ Snu", color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1, softWrap = false)
                }
            }
        }
        t.alert?.let { a ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0x1FC0392B)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(a.text, color = Color(0xFFC0392B), fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                a.body?.let { Text(it, color = p.ink, fontSize = 13.sp, lineHeight = 18.sp) }
                val walk = listOfNotNull(a.walkMin?.let { "Gå $it min" }, a.km?.let { String.format(java.util.Locale("nb", "NO"), "%.1f km", it) }).joinToString(" · ")
                if (walk.isNotBlank() || a.catches != null) Text(listOfNotNull(walk.ifBlank { null }, a.catches?.let { "rekker $it" }, a.homeAt?.let { "hjemme ${hm41(it).ifBlank { it }}" }).joinToString(" · "),
                    color = p.ink, fontSize = 13.sp)
            }
        }
        // Prompt 45 (claude-code-ruter-anbefalt-antall.md): nøyaktig N rader (1 · 2 · 3, standard 2), færre hvis det finnes færre.
        LaunchedEffect(Unit) { vm.loadRecoCount45() }
        val opts = t.options.take(vm.p45.recoCount)
        opts.forEachIndexed { i, o ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            val open = s.tripOpen == i && !home
            Column(Modifier.fillMaxWidth().then(if (!home) Modifier.clickable { s.tripOpen = if (open) null else i } else Modifier), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PSerif(hm41(o.dep).ifBlank { "–" }, 24.sp, maxLines = 1)
                    Text("→ ${hm41(o.arr)}" + (o.minutes?.let { " · $it min" } ?: ""), color = p.mut, fontSize = 13.sp, modifier = Modifier.weight(1f).padding(bottom = 3.dp))
                    if (o.preferred) Text("Foretrukket", color = p.pos, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    o.badges.filter { it != "Foretrukket" }.take(2).forEach { b -> Text(b, color = Color(0xFFC0392B), fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                }
                LegStrip41(o.legs)
                if (open) Column(Modifier.fillMaxWidth().padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    o.legs.forEach { l ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(hm41(l.dep), color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.width(44.dp))
                            val walk = modeColor41(l) == Color.Transparent
                            Text(
                                if (walk) "Gå ${l.walkMin ?: ""} min".replace("  ", " ") + (l.meters?.let { " · $it m" } ?: "") + (l.to?.let { " til $it" } ?: "")
                                else "${legLabel41(l)} fra ${l.from ?: "–"} til ${l.to ?: "–"}" + if (l.delayMin >= 1) " · +${l.delayMin} min" else "",
                                color = if (l.delayMin >= 3) Color(0xFFC0392B) else p.ink, fontSize = 13.sp, modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }
        if (!home && !edit46) TripLocNote46(vm)
        if (!home) AnimatedVisibility(edit46, enter = androidx.compose.animation.expandVertically(tween(300)) + fadeIn(tween(300)),
            exit = androidx.compose.animation.shrinkVertically(tween(300)) + fadeOut(tween(200))) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                PLabel("Innstillinger for kortet", p.mut)
                Zones41(vm) // skolesoner (chips, «+ Sone», siste kan ikke slettes)
                PLabel("Antall anbefalte reiser", p.mut)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(1, 2, 3).forEach { n -> Pill41("$n", vm.p45.recoCount == n) { vm.setRecoCount45(n) } }
                }
                PLabel("På Hjem når du forlater skolen", p.mut)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("over" to "Over Ruter-kortet", "instead" to "I stedet", "off" to "Av").forEach { (k, n) -> Pill41(n, s.homeCard == k) { vm.setHomeCard41(k) } }
                }
            }
        }
    }
}

@Composable
private fun TripToast41(vm: AppViewModel) {
    val s = vm.p41
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(s.rtToast, Modifier.navigationBarsPadding().padding(bottom = 100.dp), enter = fadeIn(tween(300)) + slideInVertically(tween(300)) { it / 2 }, exit = fadeOut(tween(200))) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp)).background(Color(0xFF1B1A17)).padding(start = 16.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Min reise skjult til neste gang du forlater skolen", color = Color(0xFFF3EFE6), fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
                Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(Color(0xFFF3EFE6)).clickable(role = Role.Button) { vm.undoHideTrip41() }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center) { Text("Angre", color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            }
        }
    }
}

/* ======================= Gjøremål: Glimt i bakgrunnen ======================= */

/** Stiplet rad øverst i lista: «Glimt deler opp beskjeden …», og «✓ Glimt lagde 3 punkter …» i 10 s. */
@Composable
internal fun GlimtJobs41(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p41
    s.glimtJobs.forEach { j ->
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).border(1.dp, p.line, RoundedCornerShape(16.dp)).padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("✦ Glimt deler opp beskjeden …", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
            Text("«${j.text}»", color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic)
        }
    }
    s.glimtDone?.let { d ->
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(d, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
            // Prompt 42: «Angre» slår delingen sammen igjen, «Endre» åpner «Laget med Glimt».
            if (s.glimtUndo42 != null || s.glimtUndoIds42.isNotEmpty()) Text("Angre", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable { vm.undoGlimt42() }.padding(6.dp))
            Text(if (s.glimtUndo42 != null || s.glimtUndoIds42.isNotEmpty()) "Endre" else "Se", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable { vm.loadSources41(); s.srcOpen = true }.padding(6.dp))
            Text("✕", color = p.mut, modifier = Modifier.clickable { s.glimtDone = null }.padding(6.dp))
        }
    }
}

/* ======================= Finans: åpne bokførte kvitteringer ======================= */

/**
 * Bokført rad utvidet: bildet av kvitteringen, navn og beløp, kategori, «Lagre endringer» og «↺ Til gjennomgang».
 * «✦ På nytt» står på raden (ny lesing lager bare et forslag, endrer ingenting før «Bruk endringene»).
 */
@Composable
internal fun BookedEditor41(vm: AppViewModel, r: Receipt, cats: List<Category>) {
    val p = PaperPal.current
    var name by remember(r.id) { mutableStateOf(r.merchant.orEmpty()) }
    var amount by remember(r.id) { mutableStateOf(r.total?.let { String.format(java.util.Locale("nb", "NO"), "%.2f", it) } ?: "") }
    var cat by remember(r.id) { mutableStateOf(r.categoryId) }
    var busy by remember(r.id) { mutableStateOf(false) }
    val field = Modifier.height(42.dp).clip(RoundedCornerShape(12.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp)
    Column(Modifier.fillMaxWidth().padding(bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.fillMaxWidth().height(180.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(14.dp))) {
            ServerImage(vm, r.thumb ?: "/finans/api/receipts/${r.id}/thumb", Modifier.matchParentSize()) {
                Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(r.merchant ?: "Kvittering", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    r.lines.take(4).forEach { (n, v) -> Text("$n  ${String.format(java.util.Locale("nb", "NO"), "%.2f", v)}", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.sp, maxLines = 1) }
                    Text("SUM ${amount}", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(field.weight(1f), contentAlignment = Alignment.CenterStart) {
                BasicTextField(name, { name = it }, singleLine = true, cursorBrush = SolidColor(p.ink),
                    textStyle = TextStyle(color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp), modifier = Modifier.fillMaxWidth())
            }
            Box(field.width(120.dp), contentAlignment = Alignment.CenterEnd) {
                BasicTextField(amount, { amount = it }, singleLine = true, cursorBrush = SolidColor(p.ink), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textStyle = TextStyle(color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, textAlign = TextAlign.End), modifier = Modifier.fillMaxWidth())
            }
        }
        if (cats.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            cats.forEach { c -> Pill41(c.name, cat == c.id) { cat = c.id } }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton(if (busy) "Lagrer …" else "Lagre endringer", Modifier.weight(1f), height = 42.dp) {
                if (busy) return@PButton
                busy = true
                vm.launch41 {
                    try {
                        val body = JSONObject()
                        if (name.isNotBlank() && name != r.merchant) body.put("merchant", name.trim())
                        amount.replace(" ", "").replace(',', '.').toDoubleOrNull()?.takeIf { it != r.total }?.let { body.put("total", it) }
                        if (cat != r.categoryId) body.put("categoryId", cat ?: JSONObject.NULL)
                        if (body.length() > 0) {
                            vm.api41 { patch("/receipts/${r.id}", body) }
                            // Koblet til en bokført transaksjon: oppdater den også (PATCH /finans/api/transactions/:id).
                            r.match?.let { tx ->
                                val tb = JSONObject()
                                if (body.has("merchant")) tb.put("merchant", name.trim()).put("counterparty", name.trim())
                                if (body.has("total")) tb.put("amount", kotlin.math.abs(body.getDouble("total"))).put("type", if (tx.amount > 0) "income" else "expense")
                                if (body.has("categoryId")) tb.put("categoryId", cat ?: JSONObject.NULL)
                                vm.api41 { patch("/transactions/${tx.id}", tb) }
                            }
                            vm.message = "Endringen er lagret og logget"
                            vm.refreshFinance40()
                        } else vm.message = "Ingen endringer"
                        vm.loadBooked23()
                    } catch (e: Exception) { vm.message = e.message ?: "Fikk ikke lagret" } finally { busy = false }
                }
            }
            PButton("↺ Til gjennomgang", Modifier, kind = "line", height = 42.dp) { vm.undo23(r) }
        }
        vm.p39.re[r.id]?.let { ReProgress39(vm, r.id, it) }
    }
}

/* ======================= Bursdager: last opp bilde ======================= */

/** «Last opp bilde» (uten bilde) eller «Bytt bilde» / «Fjern bilde» øverst i detaljene til en person. Android Photo Picker. */
@Composable
internal fun BdPhotoActions41(vm: AppViewModel, b: Bd24) {
    val p = PaperPal.current
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> if (u != null) vm.bdPhoto41(b, u) }
    val has = !b.avatarUrl.isNullOrBlank()
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp))
            .clickable(role = Role.Button) { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text(if (has) "📷 Bytt bilde" else "📷 Last opp bilde", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        }
        if (has) Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp))
            .clickable(role = Role.Button) { vm.bdPhotoRemove41(b) }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Fjern bilde", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        }
    }
}

/** Lite «+»-merke nede til høyre på avataren for personer uten bilde. */
@Composable
internal fun BoxScope.BdPlus41(size: Int) {
    val p = PaperPal.current
    Box(Modifier.align(Alignment.BottomEnd).size((size * .38f).dp).clip(CircleShape).background(p.bg).padding(1.5.dp).clip(CircleShape).background(p.ink), contentAlignment = Alignment.Center) {
        Text("+", color = p.bg, fontSize = (size * .26f).sp, fontWeight = FontWeight.Bold)
    }
}

/* ======================= 17. mai: sløyfe og flagg ======================= */

private val FLAG_R41 = Color(0xFFBA0C2F)
private val FLAG_B41 = Color(0xFF00205B)

/** Norsk flagg (22:16, kors 4/2) med øvre venstre hjørne i (x, y) og bredde w. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.flag41(x: Float, y: Float, w: Float) {
    val u = w / 22f
    drawRect(FLAG_R41, androidx.compose.ui.geometry.Offset(x, y), androidx.compose.ui.geometry.Size(w, 16 * u))
    drawRect(Color.White, androidx.compose.ui.geometry.Offset(x + 6 * u, y), androidx.compose.ui.geometry.Size(4 * u, 16 * u))
    drawRect(Color.White, androidx.compose.ui.geometry.Offset(x, y + 6 * u), androidx.compose.ui.geometry.Size(w, 4 * u))
    drawRect(FLAG_B41, androidx.compose.ui.geometry.Offset(x + 7 * u, y), androidx.compose.ui.geometry.Size(2 * u, 16 * u))
    drawRect(FLAG_B41, androidx.compose.ui.geometry.Offset(x, y + 7 * u), androidx.compose.ui.geometry.Size(w, 2 * u))
}

/** Ankerpunkter for tilbehør per figur (glimt-figurer.js → dress AN). Runde figurer bruker standard. */
internal class FigAnchor41(val hT: Float = -.44f, val hX: Float = .5f, val hS: Float = 1f, val sB: Float = -.2f, val sW: Float = 1.05f, val gB: Float = -.16f, val gR: Float = -.2f)
private val ANCHORS41 = mapOf(
    "spire" to FigAnchor41(hT = -.08f, hX = .56f, hS = .8f, sB = -.13f, sW = .98f, gB = -.1f, gR = -.12f),
    "sky" to FigAnchor41(hT = -.18f, hX = .6f, hS = .78f, sB = .07f, sW = .92f, gB = .05f, gR = -.08f),
)
private val ANCHOR_DEF41 = FigAnchor41()
internal fun figAnchor41(id: String): FigAnchor41 = ANCHORS41[id] ?: ANCHOR_DEF41

/**
 * 17. mai (glimt-figurer.js): rød sløyfe med hvit kant og blå knute (left hX, top S·(hT+0,36), +S·0,12, rotert 14°) og flagg på pinne
 * til høyre (right −S·0,2, bottom S·(sB+0,16), 0,32 × 0,46) som vaier (gfSway 1,6 s, origo nede til venstre).
 */
internal fun androidx.compose.ui.graphics.drawscope.DrawScope.drawMai41(S: Float, H: Float, t: Float, anim: Boolean, id: String = "") {
    val an = figAnchor41(id)
    val sway = if (anim) (kotlin.math.sin(2 * Math.PI * (t % 1.6f) / 1.6f).toFloat() * 6f) else 0f
    // Sløyfe (viewBox 36 × 22)
    val bw = S * .36f; val bh = S * .22f
    val bx = S * an.hX + S * .12f; val by = S * (an.hT + .36f)
    rotate(14f, androidx.compose.ui.geometry.Offset(bx + bw / 2, by + bh / 2)) {
        val u = bw / 36f; val v = bh / 22f
        fun pt(x: Float, y: Float) = androidx.compose.ui.geometry.Offset(bx + x * u, by + y * v)
        listOf(listOf(18f to 11f, 2f to 2f, 4f to 20f), listOf(18f to 11f, 34f to 2f, 32f to 20f)).forEach { tri ->
            val path = androidx.compose.ui.graphics.Path().apply { tri.forEachIndexed { k, (x, y) -> val o = pt(x, y); if (k == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y) }; close() }
            drawPath(path, Color(0xFFC8302A))
            drawPath(path, Color(0xFFFBF7EE), style = androidx.compose.ui.graphics.drawscope.Stroke(1.6f * u))
        }
        drawCircle(Color(0xFF1F2F6B), 3.5f * u, pt(18f, 11f))
    }
    // Flagg på pinne
    val fw = S * .32f; val fh = S * .46f
    val fx = S + S * .2f - fw; val fy = H - S * (an.sB + .16f) - fh
    rotate(sway, androidx.compose.ui.geometry.Offset(fx, fy + fh)) {
        drawRoundRect(Color(0xFF8A6A3A), androidx.compose.ui.geometry.Offset(fx, fy), androidx.compose.ui.geometry.Size(S * .028f, fh), androidx.compose.ui.geometry.CornerRadius(2 * density))
        flag41(fx + S * .028f, fy, S * .3f)
    }
}

/** Innstillinger → Glimt → HØYTIDER → «17. mai»: Automatisk 17. mai / Vis nå / Av. */
@Composable
internal fun Mai41Card(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(Unit) { Mai41.ensure(vm.appCtx40) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFFFBE3DF)), contentAlignment = Alignment.Center) {
                androidx.compose.foundation.Canvas(Modifier.size(26.dp, 19.dp)) { flag41(0f, 0f, size.width) }
            }
            Column(Modifier.weight(1f)) {
                Text("17. mai", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.5.sp)
                Text(if (Mai41.on) "På · Glimt har flagg" else if (Mai41.mode == "av") "Av" else "Automatisk 14.–17. mai", color = if (Mai41.on) p.pos else p.mut, fontSize = 12.5.sp)
            }
            GlimtFig35("glimt", 30.dp, "idle", still = true)
        }
        Seg40(listOf("auto" to "Automatisk", "pa" to "Vis nå", "av" to "Av"), Mai41.mode) { vm.setMai41(it) }
        Text("Figurene får sløyfe og norsk flagg 14.–17. mai. Av = vanlige figurer uten flagg.", color = p.mut, fontSize = 12.sp, lineHeight = 16.5.sp)
    }
}

/* ======================= Bursdager: jenka-tog med Glimt ======================= */

private val CONF41 = listOf(0xFFFFD84D, 0xFFFFFFFF, 0xFF9FE3C9, 0xFFA8D4FF, 0xFFFFC2A0, 0xFFC9B2FF)

/**
 * I det røde toppkortet når noen har bursdag i dag: konfetti (30 biter, gul/hvit/mint/lyseblå/fersken/lilla) og jenka-toget
 * langs bunnen – Glimt først med trompet og noter, så Stjerne, Gris, Ugle, Boble og Spire. 11 s over kortet, hopp 0,42 s.
 * Redusert bevegelse: toget står stille midt i kortet, ingen konfetti. Trykk starter på nytt (via nøkkel).
 */
@Composable
internal fun Jenka41(modifier: Modifier = Modifier) {
    val reduce = reduceMotion31()
    var seq by remember { mutableIntStateOf(0) }
    var t by remember { mutableFloatStateOf(0f) }
    if (!reduce) LaunchedEffect(seq) {
        val t0 = androidx.compose.runtime.withFrameNanos { it }
        while (true) androidx.compose.runtime.withFrameNanos { n -> t = (n - t0) / 1e9f }
    }
    val pieces = remember { List(30) { i -> floatArrayOf((i * 37 % 100) / 100f, (i * 53 % 100) / 100f, .6f + (i % 5) * .15f, (i % 6).toFloat(), (i % 2).toFloat()) } }
    BoxWithConstraints(modifier.fillMaxWidth().height(74.dp).clip(RoundedCornerShape(16.dp))
        .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .14f))))
        .clickable(interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, indication = null) { seq++ }) {
        val w = maxWidth
        if (!reduce) androidx.compose.foundation.Canvas(Modifier.matchParentSize()) {
            pieces.forEachIndexed { i, pc ->
                val y = ((pc[1] + t * .18f * pc[2]) % 1f) * size.height
                val x = pc[0] * size.width + kotlin.math.sin(t * 1.3f + i) * 6f
                val c = Color(CONF41[pc[3].toInt()])
                rotate(t * 120f * pc[2] + i * 20, androidx.compose.ui.geometry.Offset(x, y)) {
                    if (pc[4] == 0f) drawCircle(c, 3.2f * density, androidx.compose.ui.geometry.Offset(x, y))
                    else drawRect(c, androidx.compose.ui.geometry.Offset(x - 3 * density, y - 2 * density), androidx.compose.ui.geometry.Size(6 * density, 4 * density))
                }
            }
        }
        val train = listOf("glimt", "stjerne", "gris", "ugle", "boble", "spire")
        val trainW = 50f + 5 * 44f
        val prog = if (reduce) .5f else (t % 11f) / 11f
        val startX = -trainW + prog * (w.value + trainW)
        train.forEachIndexed { i, id ->
            val sz = if (i == 0) 50f else 40f
            val x = startX + trainW - (if (i == 0) 50f else 50f + i * 44f)
            val hop = if (reduce) 0f else kotlin.math.abs(kotlin.math.sin((t - i * .12f) * Math.PI.toFloat() / .42f)) * 7f
            val tilt = if (reduce) 0f else kotlin.math.sin((t - i * .12f) * Math.PI.toFloat() / .42f) * 6f
            Box(Modifier.offset(x = x.dp, y = (74f - sz - 4f - hop).dp).graphicsLayer21(tilt)) {
                GlimtFig35(id, sz.dp, "happy", still = true, noJul = true)
                // Festhatt (svart med gule striper og dusk), skrått på hodet – også i julemodus.
                androidx.compose.foundation.Canvas(Modifier.size((sz * .42f).dp, (sz * .44f).dp).offset(x = (sz * .34f).dp, y = (-sz * .3f).dp).graphicsLayer21(14f)) {
                    val w = size.width; val h = size.height
                    drawPath(androidx.compose.ui.graphics.Path().apply { moveTo(w * .1f, h * .92f); lineTo(w * .5f, h * .12f); lineTo(w * .9f, h * .92f); close() }, Color(0xFF1B1A17))
                    listOf(.42f to .58f, .62f to .78f).forEach { (a1, _) -> drawLine(Color(0xFFF2C14E), androidx.compose.ui.geometry.Offset(w * (.5f - (a1 - .1f) * .5f), h * a1 + h * .1f), androidx.compose.ui.geometry.Offset(w * (.5f + (a1 - .1f) * .5f), h * a1 + h * .1f), strokeWidth = h * .07f) }
                    drawCircle(Color(0xFFF2C14E), w * .11f, androidx.compose.ui.geometry.Offset(w * .5f, h * .1f))
                }
                if (i == 0) Text("🎺", fontSize = 16.sp, modifier = Modifier.offset(x = (sz - 6).dp, y = (sz * .45f).dp))
            }
        }
        if (!reduce) listOf("♪", "♫", "♪").forEachIndexed { k, n ->
            val ph = ((t + k * .7f) % 2f) / 2f
            Text(n, color = Color(CONF41[k]).copy(alpha = 1f - ph), fontSize = 14.sp,
                modifier = Modifier.offset(x = (startX + trainW + 10f + k * 8f).dp, y = (30f - ph * 26f).dp))
        }
    }
}

private fun Modifier.graphicsLayer21(rot: Float): Modifier = this.then(Modifier.graphicsLayer { rotationZ = rot })

/* ======================= Søkepillen vokser inn i Chat ======================= */

/** Starter animasjonen fra pillens ramme (p38.ansRect). Uten ramme: rett til Chat. */
internal fun AppViewModel.growToChat41(q: String) {
    val r = p38.ansRect
    if (r == null) { openChatWith41(q); return }
    p41.grow = r to q
}

/**
 * Pillen vokser fra sin egen ramme til fullskjerm på 0,4 s (hjørner 26 → 0, mørk glass → appens bakgrunn). Pilleinnholdet tones ut
 * på 0,15 s, Chat-innholdet (Glimt-tittel, spørsmålet som din boble, «skriver»-prikker) tones inn etter 0,12 s. Ved 0,4 s: ekte Chat.
 * Redusert bevegelse: 0,2 s krysstoning.
 */
@Composable
internal fun PillGrow41(vm: AppViewModel) {
    val g = vm.p41.grow ?: return
    val p = PaperPal.current
    val reduce = reduceMotion31()
    val t = remember(g) { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(g) {
        t.animateTo(1f, tween(if (reduce) 200 else 400, easing = androidx.compose.animation.core.CubicBezierEasing(.2f, .8f, .2f, 1f)))
        vm.openChatWith41(g.second)
        delay(80)
        vm.p41.grow = null
    }
    val dens = androidx.compose.ui.platform.LocalDensity.current.density
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val W = constraints.maxWidth.toFloat(); val H = constraints.maxHeight.toFloat()
        val k = if (reduce) 1f else t.value
        val r = g.first
        val l = r.left * (1 - k); val tp = r.top * (1 - k); val w = r.width + (W - r.width) * k; val h = r.height + (H - r.height) * k
        val bg = androidx.compose.ui.graphics.lerp(Color(0xF0161412), p.bg, k)
        Box(Modifier.offset(x = (l / dens).dp, y = (tp / dens).dp).size((w / dens).dp, (h / dens).dp)
            .graphicsLayer { alpha = if (reduce) t.value else 1f }
            .clip(RoundedCornerShape((26f * (1 - k)).dp)).background(bg)) {
            Text("Åpner i Chat …", color = Color.White.copy(alpha = (1f - t.value / .375f).coerceIn(0f, 1f)), fontWeight = FontWeight.SemiBold, fontSize = 15.sp,
                modifier = Modifier.padding(18.dp))
            val inA = ((t.value - .3f) / .7f).coerceIn(0f, 1f)
            Column(Modifier.fillMaxSize().statusBarsPadding().padding(18.dp).graphicsLayer { alpha = inA }, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("✦ Glimt", color = p.ink, fontFamily = PaperFonts.serif, fontSize = 22.sp)
                Box(Modifier.align(Alignment.End).clip(RoundedCornerShape(18.dp)).background(p.ink).padding(14.dp, 10.dp)) {
                    Text(g.second, color = p.bg, fontSize = 15.sp)
                }
                Text("• • •", color = p.mut, fontSize = 18.sp)
            }
        }
    }
}
