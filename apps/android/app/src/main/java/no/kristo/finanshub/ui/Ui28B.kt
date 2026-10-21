package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.*

/*
 * Prompt 28 (ANDROID-B), etter Mobil Papir App.dc.html og Abonnement Legg til ark.dc.html:
 *  - «Legg til abonnement»-arket (én grep-strek, Papir-farger, liste) med «Skriv inn selv» og «Fra transaksjon»
 *  - kortet for «Fra skjermbilde»: «Laster bildemodellen …» etter 5 s og feilkort med Prøv igjen · Les med Gemini · Installer qwen2.5vl · Skriv inn selv
 *  - Mer: hold inne → redigeringsmodus (minus, ≡-dra, SKJULT, Innstillinger låst), lagret per konto
 *  - wiggle-modus som iOS: flytende ＋/✓-piller, minus-sirkel øverst til venstre, «✎ Rediger widget» og «Legg til widget»-arket
 * Alle farger fra PaperPal (lys/mørk); mørk-aksenten brukes bare i mørkt tema.
 */

private const val IC_PLUS28 = "M12 5v14M5 12h14"
private const val IC_MINUS28 = "M5 12h14"
private const val IC_CHECK28 = "M5 12.5l4.5 4.5L19 7"
private const val IC_RESET28 = "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"
private const val IC_PEN28 = "M4 20h4L19 9l-4-4L4 16v4z"
private const val IC_X28 = "M6 6l12 12M18 6L6 18"
private const val IC_LOCK28 = "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3"
private const val IC_GRIP28 = "M4 8h16M4 12h16M4 16h16"
private const val IC_CHEV28 = "M9 6l6 6-6 6"
private const val IC_BACK28 = "M15 18l-6-6 6-6"

/** Tekst på et linjemerke: mørk på lys linjefarge (relativ luminans > 0,4), ellers hvit. */
internal fun lineInk28(c: Long): Color = if (Color(0xFF000000 or (c and 0xFFFFFF)).luminance() > 0.4f) Color(0xFF1B1A17) else Color.White

/* ======================= Legg til abonnement ======================= */

private class AddOpt28(val key: String, val title: String, val desc: String, val icon: String, val ai: Boolean)

private val ADD_OPTS28 = listOf(
    AddOpt28("shot", "Skjermbilde", "Fra App Store, e-post eller kontoside. Tjeneste, pris og trekkdato fylles ut.", "M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 12h8", true),
    AddOpt28("rc", "Kvittering", "Ta bilde eller velg PDF. Ollama leser beløp og syklus.", "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6", true),
    AddOpt28("tx", "Fra transaksjon", "Velg et gjentakende trekk fra banken.", "M4 8h13l-3-3M20 16H7l3 3", false),
    // Prompt 31: gratis prøveperiode med varsel før den blir betalt (ui/Nordlys31.kt → TrialForm31).
    AddOpt28("trial", "Gratis prøveperiode", "Få varsel før prøven går over til betalt. Skriv det med egne ord eller fyll ut.", "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", true),
    AddOpt28("form", "Skriv inn selv", "Tjeneste, beløp, syklus og trekkdag.", "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4", false),
)

/** Kantlinja rundt det hvite kortet (#e4ddcf i lyst) og skillelinjene (#eee8dc), avledet fra paletten. */
private fun cardEdge28(p: PaperPal) = lerp(p.line, p.card, .38f)
private fun rowLine28(p: PaperPal) = lerp(p.line, p.card, .55f)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AddSubSheet28(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b28
    val ctx = LocalContext.current
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val shot = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) vm.subFromShot28(ctx, uri) }
    val receipt = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) { vm.subAdding = false; vm.uploadSubReceipt(uri) } }
    val close: () -> Unit = { vm.subAdding = false; s.addStep = "menu" }
    ModalBottomSheet(
        onDismissRequest = close, sheetState = state, containerColor = p.bg, contentColor = p.ink,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        // Én grep-strek: bare systemets (ingen egen strek i innholdet).
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) },
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(start = 16.dp, end = 16.dp, bottom = 26.dp),
        ) {
            val step = s.addStep
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Prompt 30: felles piller (‹ Tilbake til venstre, Lukk til høyre) i stedet for røde tekstlenker.
                if (step != "menu") SheetButton30("Tilbake", "back") { s.addStep = "menu" }
                PSerif(when (step) { "form" -> "Skriv inn selv"; "tx" -> "Fra transaksjon"; "trial" -> "Prøveperiode"; else -> "Legg til abonnement" }, 26.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Lukk", "secondary", onClick = close)
            }
            Text(
                when (step) { "form" -> "Du kan endre alt senere."; "tx" -> "Gjentakende trekk fra banken som ikke er registrert."; "trial" -> "Vi minner deg på å avslutte før den blir betalt."; else -> "Velg hvordan du vil legge det inn." },
                color = p.mut, fontFamily = PaperFonts.sans, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 2.dp, bottom = 16.dp),
            )
            when (step) {
                "form" -> AddSubForm28(vm)
                "tx" -> AddSubTx28(vm)
                "trial" -> TrialForm31(vm) { close() }
                else -> {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).border(1.dp, cardEdge28(p), RoundedCornerShape(20.dp))) {
                        ADD_OPTS28.forEachIndexed { i, o ->
                            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(rowLine28(p)))
                            AddSubRow28(o) {
                                Haptics.select()
                                when (o.key) {
                                    "shot" -> shot.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                    "rc" -> receipt.launch(arrayOf("image/*", "application/pdf"))
                                    "tx" -> { s.addStep = "tx"; vm.loadSubCandidates() }
                                    "trial" -> { vm.resetTrialForm31(); s.addStep = "trial" }
                                    else -> s.addStep = "form"
                                }
                            }
                        }
                    }
                    Text("Bilder og kvitteringer leses lokalt av Ollama. Ingenting sendes ut av Homelab.", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, lineHeight = 18.sp,
                        modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 14.dp))
                }
            }
        }
    }
}

@Composable
private fun AddSubRow28(o: AddOpt28, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).press24(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(lerp(p.card, p.lab, .13f)), contentAlignment = Alignment.Center) { WxIcon(o.icon, p.lab, 22.dp, stroke = 1.8f) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(o.title, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1)
                if (o.ai) Box(Modifier.clip(CircleShape).background(p.ink).padding(horizontal = 7.dp, vertical = 2.dp)) {
                    Text("✦ AI", color = p.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 10.5.sp, letterSpacing = .6.sp, maxLines = 1)
                }
            }
            Text(o.desc, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 13.5.sp, lineHeight = 18.sp)
        }
        WxIcon(IC_CHEV28, lerp(p.mut, p.card, .25f), 16.dp, stroke = 2.2f)
    }
}

@Composable
private fun AddSubForm28(vm: AppViewModel) {
    val p = PaperPal.current
    var name by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var day by remember { mutableStateOf("") }
    var cyc by remember { mutableStateOf("mnd") }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).border(1.dp, cardEdge28(p), RoundedCornerShape(20.dp))) {
            FormField28("Tjeneste", name, "HBO Max", KeyboardType.Text, top = false) { name = it }
            FormField28("Beløp", amount, "129 kr", KeyboardType.Decimal) { amount = it.filter { c -> c.isDigit() || c == ',' || c == '.' } }
            FormField28("Trekkdag", day, "15.", KeyboardType.Number) { day = it.filter { c -> c.isDigit() }.take(2) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("SYKLUS", color = p.lab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 11.5.sp, letterSpacing = 1.4.sp, modifier = Modifier.padding(horizontal = 4.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.surf2).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf("uke" to "Uke", "mnd" to "Måned", "år" to "År").forEach { (k, n) ->
                    val on = cyc == k
                    Box(
                        Modifier.weight(1f).heightIn(min = 40.dp).then(if (on) Modifier.shadow(2.dp, RoundedCornerShape(10.dp)) else Modifier).clip(RoundedCornerShape(10.dp))
                            .background(if (on) p.card else Color.Transparent).clickable(role = Role.RadioButton) { Haptics.select(); cyc = k },
                        contentAlignment = Alignment.Center,
                    ) { Text(n, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
                }
            }
        }
        val price = amount.replace(',', '.').toDoubleOrNull() ?: 0.0
        val ok = name.isNotBlank() && price > 0
        Box(
            Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp)).background(if (ok) p.lab else p.line)
                .clickable(enabled = ok, role = Role.Button) { Haptics.tap(); vm.addManualSub28(name.trim(), price, day.toIntOrNull(), cyc) },
            contentAlignment = Alignment.Center,
        ) { Text("Legg til abonnement", color = if (ok) p.onLab else p.mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 16.sp) }
    }
}

@Composable
private fun FormField28(label: String, value: String, ph: String, kb: KeyboardType, top: Boolean = true, onChange: (String) -> Unit) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(rowLine28(p)))
        Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(label, color = p.mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.width(92.dp))
            BasicTextField(
                value, onChange, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = kb),
                textStyle = TextStyle(color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 16.sp), cursorBrush = SolidColor(p.lab),
                modifier = Modifier.weight(1f).heightIn(min = 44.dp).wrapContentHeight(Alignment.CenterVertically),
                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (value.isEmpty()) Text(ph, color = p.mut.copy(alpha = .7f), fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 16.sp); inner() } },
            )
        }
    }
}

@Composable
private fun AddSubTx28(vm: AppViewModel) {
    val p = PaperPal.current
    val list = vm.subCandidates
    when {
        list == null -> Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink, modifier = Modifier.size(22.dp), strokeWidth = 2.dp) }
        list.isEmpty() -> Text("Fant ingen nye faste trekk. Alt ser ut til å være registrert.", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 4.dp))
        else -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).border(1.dp, cardEdge28(p), RoundedCornerShape(20.dp))) {
            list.forEachIndexed { i, c ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(rowLine28(p)))
                val have = vm.subsX?.items?.any { it.name.equals(c.merchant, ignoreCase = true) } == true
                Row(Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(36.dp).clip(CircleShape)) { Logo(vm, c.domain, c.merchant, 0xFFB23A2A, 36) }
                    Column(Modifier.weight(1f)) {
                        Text(c.merchant, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val d = c.lastDate.takeIf { it.length >= 10 }?.substring(8, 10)?.toIntOrNull()
                        Text("${d?.let { "Trekkes $it. " } ?: ""}${if (c.cycle == "yearly") "hvert år" else "hver måned"} · ${n0(c.amount)} kr · sett ${c.count} ganger",
                            color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, maxLines = 2)
                    }
                    Box(
                        Modifier.heightIn(min = 36.dp).clip(RoundedCornerShape(18.dp)).background(if (have) Color.Transparent else p.lab)
                            .clickable(enabled = !have) { Haptics.tap(); vm.addSubCandidate(c) }.padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text(if (have) "✓ Lagt til" else "+ Legg til", color = if (have) p.pos else p.onLab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                }
            }
        }
    }
}

/* ======================= Fra skjermbilde: lesing og feil ======================= */

/** Kortet øverst i Subscription OS mens bildet leses, og feilkortet. Resultatet tegnes av SubShotCard27. */
@Composable
internal fun SubShotCard28(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b27
    val t = vm.b28
    if (!s.shotOpen) return
    if (s.shot != null && !s.shotBusy) {
        SubShotCard27(vm, p.card, p.ink, p.mut, p.line, p.lab, p.pos)
        return
    }
    val err = t.shotErr
    Column(
        Modifier.fillMaxWidth().shadow(10.dp, RoundedCornerShape(20.dp), ambientColor = Color.Black.copy(alpha = .2f), spotColor = Color.Black.copy(alpha = .2f))
            .clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PLabel(if (t.shotEngine == "gemini") "✦ Gemini leser skjermbildet" else "✦ Ollama leser skjermbildet", modifier = Modifier.weight(1f))
            SheetButton30("Lukk", "secondary") { vm.closeShot28() }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.size(64.dp, 110.dp).clip(RoundedCornerShape(12.dp)).background(p.surf2).border(1.dp, p.line, RoundedCornerShape(12.dp))) {
                s.shotThumb?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, alignment = Alignment.TopCenter, modifier = Modifier.fillMaxSize()) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                when {
                    s.shotBusy -> ShotBusy28(vm)
                    err != null -> {
                        Text(err.message, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 21.sp)
                        if (err.code == "no_vision" && (t.installing || t.installText != null)) {
                            t.installText?.let { Text(it, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp) }
                            if (t.installing) {
                                val pct = t.installPct
                                if (pct != null) LinearProgressIndicator(progress = { pct }, color = p.lab, trackColor = p.line, modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)))
                                else LinearProgressIndicator(color = p.lab, trackColor = p.line, modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)))
                            }
                        }
                    }
                    else -> Text(s.shotName, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 13.sp)
                }
            }
        }
        if (err != null && !s.shotBusy) ShotErrButtons28(vm, err)
        Text(
            if (t.shotEngine == "gemini") "Bildet ble sendt til Google Gemini fordi du ba om det. Det lagres ikke i Homelab."
            else "Leses lokalt av en bildemodell (qwen2.5vl) på hjemmeserveren. Bildet slettes etter lesing.",
            color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp, lineHeight = 17.sp,
        )
    }
}

@Composable
private fun ShotBusy28(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.b28
    var slow by remember(t.shotStart) { mutableStateOf(false) }
    LaunchedEffect(t.shotStart) { slow = false; delay(5_000); slow = true }
    Text(if (slow) "Laster bildemodellen …" else "Finner tjeneste, plan, pris og trekkdato …", color = p.ink, fontFamily = PaperFonts.sans, fontSize = 14.sp, lineHeight = 20.sp)
    LinearProgressIndicator(color = p.lab, trackColor = p.line, modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)))
    Text(if (slow) "Første lesing kan ta opptil ett minutt." else vm.b27.shotName, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ShotErrButtons28(vm: AppViewModel, e: ShotErr28) {
    val t = vm.b28
    val gem = e.canGemini && e.code in setOf("ollama_down", "timeout", "no_vision")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when (e.code) {
            "no_vision" -> if (!t.installing) ShotBtn28("Installer qwen2.5vl", true) { vm.installVision28() }
            "not_found" -> ShotBtn28("Skriv inn selv", true) { vm.shotManual28() }
            "bad_image" -> ShotBtn28("Velg et annet bilde", true) { vm.closeShot28(); vm.subAdding = true }
            "no_gemini", "gemini_failed" -> { ShotBtn28("Prøv igjen", true) { vm.retryShot28("ollama") }; ShotBtn28("Skriv inn selv", false) { vm.shotManual28() } }
            else -> ShotBtn28("Prøv igjen", true) { vm.retryShot28("ollama") }
        }
        if (gem) ShotBtn28("Les med Gemini", false) { vm.retryShot28("gemini") }
        if (e.code != "not_found" && e.code != "no_gemini" && e.code != "gemini_failed") ShotBtn28("Skriv inn selv", false) { vm.shotManual28() }
    }
}

@Composable
private fun ShotBtn28(text: String, primary: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(22.dp)).background(if (primary) p.lab else Color.Transparent)
            .then(if (primary) Modifier else Modifier.border(1.dp, p.line, RoundedCornerShape(22.dp)))
            .clickable(role = Role.Button) { Haptics.tap(); onClick() }.padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (primary) p.onLab else p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1) }
}

/* ======================= Mer: hold inne for å flytte og skjule ======================= */

internal class MerItem28(val key: String, val title: String, val sub: String, val index: Int, val go: () -> Unit)

/** Mer i Papir: vanlig liste, eller redigeringsmodus etter langt trykk (0,48 s). Lagres per konto (/api/prefs/mer). */
@Composable
internal fun MerList28(vm: AppViewModel, rows: List<MerItem28>, navBottom: Dp, barSpace: Dp) {
    val p = PaperPal.current
    val s = vm.b28
    LaunchedEffect(vm.account?.id, vm.base) { vm.loadMer28() }
    // Ut av siden: redigeringen avsluttes.
    DisposableEffect(Unit) { onDispose { s.merEdit = false } }
    val sorted = merSort28(s.mer, rows) { it.key }
    val hidSet = s.mer.h.toSet()
    val vis = sorted.filter { it.key !in hidSet || it.key == "innst" }
    val hid = sorted.filter { it.key in hidSet && it.key != "innst" }
    val edit = s.merEdit
    var drag by remember { mutableStateOf<String?>(null) }
    var dy by remember { mutableFloatStateOf(0f) }
    var work by remember { mutableStateOf<List<String>?>(null) }
    val heights = remember { HashMap<String, Int>() }
    val visKeys = work ?: vis.map { it.key }
    // Dra-håndtakene lever på tvers av rekomponeringer: les gjeldende rekkefølge og skjulte derfra.
    val visNow by rememberUpdatedState(vis.map { it.key })
    val hidNow by rememberUpdatedState(hid.map { it.key })
    val byKey = rows.associateBy { it.key }
    BackHandler(enabled = edit) { s.merEdit = false; drag = null; work = null }
    fun hide(k: String) {
        Haptics.select()
        val o = if (s.mer.o.isEmpty()) vis.map { it.key } + hid.map { it.key } else s.mer.o
        vm.saveMer28(MerPref28(o, s.mer.h + k))
    }
    fun show(k: String) { Haptics.select(); vm.saveMer28(s.mer.copy(h = s.mer.h - k)) }
    // Prompt 30: samme wiggle som Hjem: separate kort som vugger, minus-/lås-merke, ＋ N · ✓ som flytende verktøylinje og 64 dp luft.
    val wobble = rememberInfiniteTransition(label = "merWob").animateFloat(-1f, 1f, infiniteRepeatable(tween(300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "w")
    val add30 = vm.p30.merAdd && hid.isNotEmpty()
    DisposableEffect(Unit) { onDispose { vm.p30.merAdd = false } }
    MerLoad44(vm) // prompt 44: data til de levende kortene
    BoxWithConstraints(Modifier.fillMaxSize()) {
    val wide44 = maxWidth >= 600.dp
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, barSpace + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!edit) {
            // Prompt 44 (claude-code-mer-ny-design.md): søk, levende kort (Store) eller én liste (Lave), Innstillinger nederst (ui/Mer44.kt).
            mer44(vm, vis, wide44, onLong = { Haptics.tap(); s.merEdit = true })
            return@LazyColumn
        }
        item(key = "mer-space") { WiggleSpace30(true, extra = (-10).dp) }
        item(key = "mer-tsz") { MerSize44(vm) } // prompt 44: Store · Lave bare i wiggle-redigering
        itemsIndexed(visKeys, key = { _, k -> "mer-$k" }) { i, k ->
            val r = byKey[k] ?: return@itemsIndexed
            val on = drag == k
            val shape = RoundedCornerShape(18.dp)
            Box(
                Modifier.fillMaxWidth().then(if (on) Modifier else Modifier.animateItem(fadeInSpec = null, fadeOutSpec = null, placementSpec = tween(180)))
                    .zIndex(if (on) 5f else 0f)
                    .graphicsLayer {
                        translationY = if (on) dy else 0f
                        val sc = if (on) 1.02f else 1f; scaleX = sc; scaleY = sc
                        rotationZ = if (on) 0f else wobble.value * (if (i % 2 == 0) .45f else -.45f)
                    }
                    .onSizeChanged { heights[k] = it.height },
            ) {
                Row(
                    Modifier.fillMaxWidth().shadow(if (on) 18.dp else 8.dp, shape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                        .clip(shape).background(p.card).padding(start = 14.dp, end = 6.dp, top = 5.dp, bottom = 5.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    MerIcon25(vm, r.index, r.key)
                    Column(Modifier.weight(1f)) {
                        PSerif(r.title, 19.sp, maxLines = 1)
                        Text(r.sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Box(
                        Modifier.size(44.dp).semantics { contentDescription = "Flytt ${r.title}" }.pointerInput(k) {
                            detectDragGestures(
                                onDragStart = { drag = k; dy = 0f; work = visNow; Haptics.select() },
                                onDragEnd = { drag = null; dy = 0f; work?.let { w -> vm.saveMer28(s.mer.copy(o = w + hidNow)) }; work = null },
                                onDragCancel = { drag = null; dy = 0f; work?.let { w -> vm.saveMer28(s.mer.copy(o = w + hidNow)) }; work = null },
                            ) { ch, amount ->
                                ch.consume()
                                dy += amount.y
                                val l = (work ?: visNow).toMutableList()
                                val at = l.indexOf(k)
                                val h = (heights[k] ?: 140).toFloat()
                                val sw = when { dy > h / 2 && at in 0 until l.size - 1 -> 1; dy < -h / 2 && at > 0 -> -1; else -> 0 }
                                // Prompt 37 (krasjfiksen): maks ett bytte per 140 ms; lagres først ved slipp.
                                val now37 = android.os.SystemClock.uptimeMillis()
                                if (sw != 0 && now37 - vm.p37.lastSw >= 140) {
                                    vm.p37.lastSw = now37
                                    val o = l[at + sw]; l[at + sw] = k; l[at] = o
                                    dy -= sw * (heights[o] ?: h.toInt())
                                    work = l
                                    Haptics.select()
                                }
                            }
                        },
                        contentAlignment = Alignment.Center,
                    ) { WxIcon(IC_GRIP28, p.mut, 20.dp, stroke = 2f) }
                }
                if (!on) {
                    if (k == "innst") LockDot30(Modifier.align(Alignment.TopStart))
                    else MinusDot28(r.title, Modifier.align(Alignment.TopStart)) { hide(k) }
                }
            }
        }
        if (add30) {
            item(key = "mer-hid-label") {
                Text("SKJULT · TRYKK + FOR Å VISE", color = p.lab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 11.5.sp, letterSpacing = 1.4.sp,
                    modifier = Modifier.padding(start = 4.dp, top = 8.dp))
            }
            itemsIndexed(hid, key = { _, r -> "mer-h-${r.key}" }) { _, r ->
                Box(Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth().shadow(8.dp, RoundedCornerShape(18.dp), ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                            .clip(RoundedCornerShape(18.dp)).background(p.card).clickable(role = Role.Button, onClickLabel = "Vis ${r.title}") { show(r.key) }
                            .padding(horizontal = 14.dp, vertical = 13.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.alpha(.5f)) { MerIcon25(vm, r.index, r.key) }
                        Column(Modifier.weight(1f).alpha(.5f)) {
                            PSerif(r.title, 19.sp, maxLines = 1)
                            Text(r.sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    PlusDot30("Vis ${r.title}", Modifier.align(Alignment.TopStart)) { show(r.key) }
                }
            }
        }
    }
    if (edit) WiggleBar28(
        Modifier.align(Alignment.TopCenter).padding(top = 8.dp), left = if (hid.isNotEmpty()) "add" else null, hidden = hid.size,
        onLeft = { vm.p30.merAdd = !vm.p30.merAdd; Haptics.select() },
        onDone = { Haptics.success(); s.merEdit = false; vm.p30.merAdd = false; drag = null; work = null },
    )
    }
}

/** Vanlig rad: kort trykk åpner, hold inne 0,48 s (uten å flytte > 8 dp) → redigeringsmodus; slipp etter det åpner ikke. */
@Composable
internal fun MerRowNormal28(vm: AppViewModel, r: MerItem28, top: Boolean, onLong: () -> Unit) {
    val p = PaperPal.current
    var pressed by remember { mutableStateOf(false) }
    val go by rememberUpdatedState(r.go)
    val long by rememberUpdatedState(onLong)
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().alpha(if (pressed) .6f else 1f).semantics { contentDescription = r.title }
                .pointerInput(r.key) {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        pressed = true
                        val slop = 8.dp.toPx()
                        val res = withTimeoutOrNull(480L) {
                            while (true) {
                                val ev = awaitPointerEvent()
                                val ch = ev.changes.firstOrNull { it.id == down.id } ?: return@withTimeoutOrNull 2
                                if (!ch.pressed) return@withTimeoutOrNull if (ch.isConsumed) 2 else 1
                                if ((ch.position - down.position).getDistance() > slop) return@withTimeoutOrNull 2
                            }
                            @Suppress("UNREACHABLE_CODE") 2
                        }
                        pressed = false
                        when (res) {
                            null -> {
                                long()
                                // Resten av trykket spises, så slippet ikke åpner modulen.
                                while (true) {
                                    val ev = awaitPointerEvent()
                                    ev.changes.forEach { it.consume() }
                                    if (ev.changes.none { it.pressed }) break
                                }
                            }
                            1 -> { Haptics.select(); go() }
                            else -> {}
                        }
                    }
                }
                .padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MerIcon25(vm, r.index, r.key)
            Column(Modifier.weight(1f)) {
                PSerif(r.title, 19.sp, maxLines = 1)
                Text(r.sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text("›", color = p.mut, fontSize = 17.sp)
        }
    }
}

/* ======================= Wiggle-modus (Hjem, Finans, Mat, Sporing, Finans → Mer) ======================= */

/** Pillene ligger 31 dp ned i innholdsområdet (8 dp under kanten som klippes når siden scrolles); listene får like mye luft øverst. */
internal val WIGGLE_TOP28 = 31.dp
/** Luft øverst i listene i redigeringsmodus, så pillene ikke dekker første kort. */
internal val WIGGLE_SPACE28 = 74.dp

@Composable
private fun Pill28(label: String, primary: Boolean, onClick: () -> Unit, content: @Composable RowScope.(Color) -> Unit) {
    val p = PaperPal.current
    val fg = if (primary) p.bg else p.ink
    Row(
        Modifier.height(40.dp).widthIn(min = 64.dp)
            .shadow(10.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(CircleShape).background(if (primary) p.ink else p.card).border(1.dp, if (primary) p.ink else p.line, CircleShape)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick).semantics { contentDescription = label }.padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
    ) { content(fg) }
}

/** Raden med pillene: venstre (＋ N, ↺ Tilbakestill eller ingenting) og ✓ til høyre. */
@Composable
internal fun WiggleBar28(modifier: Modifier = Modifier, left: String?, hidden: Int = 0, onLeft: () -> Unit = {}, onDone: () -> Unit) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        when (left) {
            "add" -> Pill28("Legg til widget", false, onLeft) { c ->
                WxIcon(IC_PLUS28, c, 16.dp, stroke = 2.6f)
                if (hidden > 0) Text("$hidden", color = c, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            "reset" -> Pill28("Tilbakestill", false, onLeft) { c ->
                WxIcon(IC_RESET28, c, 15.dp, stroke = 2.4f)
                Text("Tilbakestill", color = c, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            else -> Spacer(Modifier.width(1.dp))
        }
        Pill28("Ferdig", true, onDone) { c -> WxIcon(IC_CHECK28, c, 18.dp, stroke = 2.8f) }
    }
}

/** Pillene for sidene med vm.editPage (Hjem, Finans, Mat: ＋ og ✓; Sporing: bare ✓), og «Legg til widget»-arket. */
@Composable
internal fun WigglePills28(vm: AppViewModel, modifier: Modifier = Modifier) {
    val page = vm.editPage ?: return
    // Bare på siden som redigeres (ikke når en annen side, et skjema eller detaljer ligger øverst).
    val base = vm.paperPage == null && vm.original == null && vm.editing == null && vm.detail == null && vm.selectedTx == null
    val here = base && when (page) {
        "hjem" -> vm.screen == Screen.Homelab
        "finans" -> vm.screen == Screen.Home
        "mat" -> vm.screen == Screen.Mat
        "sporing" -> vm.screen == Screen.Tracking
        else -> false
    }
    if (!here) return
    val secs = vm.b28.pageSecs[page] ?: emptyList()
    val hidden = vm.pageHidden(page).count { h -> secs.any { it.first == h } }
    WiggleBar28(
        modifier, left = if (page == "sporing") null else "add", hidden = hidden,
        onLeft = { Haptics.select(); vm.b28.addWidgetFor = page },
        onDone = { Haptics.success(); vm.editPage = null },
    )
    if (vm.b28.addWidgetFor == page) AddWidgetSheet28(vm, page)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddWidgetSheet28(vm: AppViewModel, page: String) {
    val p = PaperPal.current
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val secs = vm.b28.pageSecs[page] ?: emptyList()
    val hid = vm.pageHidden(page)
    val list = secs.filter { it.first in hid }
    val close = { vm.b28.addWidgetFor = null }
    ModalBottomSheet(
        onDismissRequest = close, sheetState = state, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) },
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                PSerif("Legg til widget", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Ferdig", onClick = close)
            }
            if (list.isEmpty()) Text("Alle widgets vises allerede. Trykk − på en widget for å skjule den.", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 14.sp,
                modifier = Modifier.padding(start = 4.dp, end = 4.dp, bottom = 8.dp))
            else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                list.forEachIndexed { i, (k, n) ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button, onClickLabel = "Vis $n") {
                            vm.showPageItemLast28(page, secs.map { it.first }, k)
                            if (vm.pageHidden(page).none { h -> secs.any { it.first == h } }) close()
                        }.padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(n, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 15.5.sp, modifier = Modifier.weight(1f))
                        Box(Modifier.size(28.dp).clip(CircleShape).background(p.pos), contentAlignment = Alignment.Center) { WxIcon(IC_PLUS28, Color.White, 13.dp, stroke = 3f) }
                    }
                }
            }
        }
    }
}

/** Minus-sirkelen øverst til venstre på et kort (28, Papir: card, line-kant, ink −), 9 dp utenfor kanten. */
@Composable
internal fun MinusDot28(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        modifier.offset((-9).dp, (-9).dp).size(28.dp)
            .shadow(5.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
            .clickable(role = Role.Button, onClickLabel = "Skjul $label") { onClick() }.semantics { contentDescription = "Skjul $label" },
        contentAlignment = Alignment.Center,
    ) { WxIcon(IC_MINUS28, p.ink, 12.dp, stroke = 3.4f) }
}

/** «✎ Rediger widget» midt på kortet (32 høy, ink/bg). */
@Composable
internal fun EditWidgetPill28(modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        modifier.height(32.dp).shadow(8.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f)).clip(CircleShape).background(p.ink)
            .clickable(role = Role.Button, onClickLabel = "Rediger widget") { Haptics.select(); onClick() }.padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        WxIcon(IC_PEN28, p.bg, 13.dp, stroke = 2.2f)
        Text("Rediger widget", color = p.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
    }
}

/** ▲ ▼ i Papir-stil (card, line-kant, ink) – Sporing, til dra er på plass der. */
@Composable
internal fun UpDown28(text: String, enabled: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.size(30.dp).shadow(4.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .25f), spotColor = Color.Black.copy(alpha = .25f)).clip(CircleShape)
            .background(p.card).border(1.dp, p.line, CircleShape).alpha(if (enabled) 1f else .4f).clickable(enabled = enabled, role = Role.Button) { onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(text, color = p.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
}

/** Kortene på Hjem som har egne innstillinger («✎ Rediger widget»). */
internal fun editWidgetAction28(vm: AppViewModel, page: String, key: String): (() -> Unit)? = when {
    page == "hjem" && key == "h3" -> ({ vm.b27.homeSheet = true })
    page == "hjem" && key == "h2" -> ({ vm.p37.h2Menu = true }) // prompt 37: vis bare når det er pakker, 1–3 pakker
    else -> null
}

/* ======================= Chat → Legg ved ======================= */

/** «Legg ved»: grep-strek, tittel + ✕ på samme linje, tre fliser (Kamera · Bilder · Filer), kunnskapsbase-rad og fotnote. */
@Composable
internal fun ChatAttach28(vm: AppViewModel, v: ChatV27, close: () -> Unit, camera: () -> Unit, images: () -> Unit, files: () -> Unit, kb: () -> Unit) {
    val s = vm.chat27
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Box(Modifier.size(36.dp, 5.dp).clip(RoundedCornerShape(3.dp)).background(v.line)) }
    Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Legg ved", color = v.ink, fontFamily = v.head, fontWeight = FontWeight.Medium, fontSize = 24.sp, lineHeight = 26.sp, modifier = Modifier.weight(1f), maxLines = 1)
        Box(Modifier.size(36.dp).clip(CircleShape).background(v.card).press24(onClick = close).ch27Label("Lukk"), contentAlignment = Alignment.Center) {
            WxIcon(IC_X28, v.ink, 14.dp, stroke = 2.6f)
        }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(
            Triple("Kamera", "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", camera),
            Triple("Bilder", "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15.5 9h.01", images),
            Triple("Filer", "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6", files),
        ).forEach { (n, ic, go) ->
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(v.card).press24(onClick = go).ch27Label(n).padding(start = 6.dp, end = 6.dp, top = 16.dp, bottom = 14.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(v.bg), contentAlignment = Alignment.Center) { WxIcon(ic, v.ink, 23.dp, stroke = 1.8f) }
                Text(n, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
            }
        }
    }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clip(RoundedCornerShape(18.dp)).background(v.card).press24(onClick = kb).padding(start = 9.dp, top = 9.dp, end = 14.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(v.bg), contentAlignment = Alignment.Center) {
            WxIcon("M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7.5h6", v.ink, 23.dp, stroke = 1.8f)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Fra kunnskapsbasen", color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1)
            Text(s.kb?.let { "${it.size} dokumenter" } ?: "Dokumenter på serveren", color = v.mut, fontFamily = v.sans, fontSize = 12.5.sp, maxLines = 1)
        }
        WxIcon(IC_CHEV28, v.mut, 16.dp, stroke = 2.2f)
    }
    Text("Bilder leses av en bildemodell, f.eks. qwen2.5vl. Filer kan være PDF, Word, tekst eller CSV.", color = v.mut, fontFamily = v.sans, fontSize = 12.sp, lineHeight = 17.sp,
        modifier = Modifier.padding(horizontal = 4.dp))
}
