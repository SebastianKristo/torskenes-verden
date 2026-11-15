@file:JvmName("DomeneOkonomi")

package no.kristo.finanshub.ui

import android.content.Intent
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import kotlin.math.abs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.Screen
import no.kristo.finanshub.loadTrials31
import no.kristo.finanshub.logos52
import no.kristo.finanshub.trialDays32b
import no.kristo.finanshub.uiErr73
import org.json.JSONObject

/*
 * Økonomi: kode som lå i blandingsfilene (Ui28B.kt, Ui32b.kt, Ui34.kt, Ui39.kt, Ui40.kt, Ui41.kt, Ui46b.kt, Ui52B.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av ØKONOMI-Android.
 */

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

/* ======================= Hjem: Prøveperioder (h11) ======================= */

@Composable
private fun TrialLogo32b(vm: AppViewModel, name: String, size: Dp, inner: Dp, radius: Dp, frame: Boolean) {
    val p = PaperPal.current
    val dom = trialDomain32b(name)
    val bmp by produceState<Bitmap?>(null, dom) { value = runCatching { vm.logo(dom) }.getOrNull() }
    Box(
        Modifier.size(size).clip(RoundedCornerShape(radius)).background(if (frame) Color.White else Color.Transparent)
            .then(if (frame) Modifier.border(1.dp, p.line, RoundedCornerShape(radius)) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, Modifier.size(inner).clip(RoundedCornerShape(4.dp)), contentScale = ContentScale.Fit)
        else Text(name.take(1).uppercase(), color = p.ink, fontFamily = PaperFonts.serif, fontSize = (inner.value * .7f).sp)
    }
}

/**
 * «PRØVEPERIODER · 3 AKTIVE» · logo · navn (Newsreader) · «Avslutt før … · deretter 149 kr/mnd» · stort tall · fremdrift ·
 * chips for de neste · Jeg har avsluttet / Behold. Trykk åpner Abonnement.
 */
@Composable
internal fun HomeTrials32b(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.account?.id) { if (vm.p31.trials.isEmpty()) vm.loadTrials31() }
    val today = LocalDate.now(OSLO31)
    val list = vm.p31.trials.filter { it.status == "active" && trialDays32b(it.endsAt, today) >= 0 }.sortedBy { it.endsAt }
    val top = list.firstOrNull()
    val openAbo = { Haptics.select(); vm.openFromMer(Screen.Sub) }
    PCard(onClick = openAbo) {
        Column(Modifier.padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                PLabel("Prøveperioder · " + if (list.isEmpty()) "ingen" else "${list.size} aktive", modifier = Modifier.weight(1f))
                Text("alle ›", color = p.mut, fontSize = 12.sp)
            }
            if (top == null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    // Prompt 46 (claude-code-provperioder-skjul-tom.md): kortet vises bare i wiggle når det ikke finnes aktive prøver.
                    Text("Vises når du har en aktiv prøveperiode", color = p.mut, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Box(
                        Modifier.height(34.dp).clip(CircleShape).background(p.bg).clickable(role = Role.Button) {
                            Haptics.select(); vm.openFromMer(Screen.Sub); vm.resetTrialForm31(); vm.b28.addStep = "trial"; vm.subAdding = true
                        }.padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("+ Legg til", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                }
                return@Column
            }
            val dd = trialDays32b(top.endsAt, today)
            val c = trialColor32b(dd)?.let { Color(it) } ?: p.ink
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TrialLogo32b(vm, top.service, 40.dp, 24.dp, 12.dp, frame = true)
                Column(Modifier.weight(1f)) {
                    PSerif(top.service, 20.sp, maxLines = 1)
                    Text("Avslutt før ${dShort31(top.endsAt)}" + (top.priceAfter.takeIf { it.isNotBlank() }?.let { " · deretter $it" } ?: ""),
                        color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Column(horizontalAlignment = Alignment.End) {
                    PSerif(if (dd == 0) "I dag" else "$dd", 28.sp, color = c, maxLines = 1)
                    Text(when (dd) { 0 -> "siste dag"; 1 -> "dag igjen"; else -> "dager igjen" }, color = c, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                }
            }
            val pct = trialPct32b(top.endsAt, vm.p32b.trialStart[top.id], today)
            Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(3.dp)).background(p.line)) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(pct).clip(RoundedCornerShape(3.dp)).background(c))
            }
            val more = list.drop(1).take(2)
            if (more.isNotEmpty()) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                more.forEach { x ->
                    val xd = trialDays32b(x.endsAt, today)
                    Row(
                        Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(p.bg).padding(horizontal = 9.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        TrialLogo32b(vm, x.service, 16.dp, 16.dp, 4.dp, frame = false)
                        Text(x.service, color = p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Text("$xd d", color = trialColor32b(xd)?.let { Color(it) } ?: p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier.weight(1f).height(38.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button) {
                        Haptics.success(); vm.patchTrial31(top.id, "cancelled"); vm.flash("✓ ${top.service} avsluttet · påminnelsen er fjernet")
                    },
                    contentAlignment = Alignment.Center,
                ) { Text("Jeg har avsluttet", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                Box(
                    Modifier.height(38.dp).clip(CircleShape).background(p.bg).clickable(role = Role.Button) {
                        Haptics.select(); vm.patchTrial31(top.id, "kept"); vm.flash("${top.service} beholdes · flyttet til Abonnement")
                    }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("Behold", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            }
        }
    }
}

/* ---------------- Kvitteringer: «✦ ANALYSERES AV AI · N» ---------------- */

/** Seksjonen over KØ og TIL GJENNOMGANG. Tom liste = ingenting vises. */
@Composable
internal fun RcAiSection34(vm: AppViewModel) {
    val p = PaperPal.current
    val l = vm.p34.rcAi
    LaunchedEffect(vm.base, vm.jobs.size, vm.uploading) { vm.loadRcAi34() }
    if (l.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("✦ ANALYSERES AV GLIMT · ${l.size}", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp,
            modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        l.forEach { r -> RcAiCard34(vm, r) }
    }
}

@Composable
private fun RcAiCard34(vm: AppViewModel, r: RcAi34) {
    val p = PaperPal.current
    val t = rememberInfiniteTransition(label = "scan34")
    val y by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1600, easing = LinearEasing), RepeatMode.Reverse), label = "scan34y")
    val title = r.store ?: "Leser kvittering …"
    val sub = when {
        r.category != null -> r.category + (r.confidence?.let { " · $it % sikker" } ?: "")
        r.lines != null -> "${r.lines} varelinjer"
        else -> r.file
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).border(1.dp, p.lab.copy(alpha = .22f), RoundedCornerShape(20.dp)).padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(46.dp, 58.dp).clip(RoundedCornerShape(8.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(8.dp))) {
                ServerImage(vm, r.thumb ?: "/finans/api/receipts/${r.id}/thumb", Modifier.matchParentSize())
                // Rød skannelinje som glir over bildet.
                Box(Modifier.fillMaxWidth().height(2.dp).offset { IntOffset(0, (56 * y).dp.roundToPx()) }.background(p.lab)) // prompt 71: offset-lambda
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(sub, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                r.model?.let { m ->
                    Text(m, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, maxLines = 1,
                        modifier = Modifier.padding(top = 2.dp).clip(CircleShape).background(p.bg).padding(horizontal = 8.dp, vertical = 1.dp))
                }
            }
            r.sum?.let { s -> Text(String.format(java.util.Locale("nb", "NO"), "%.2f", s), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, maxLines = 1) }
        }
        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(p.bg)) {
            Box(Modifier.fillMaxHeight().fillMaxWidth((maxOf(r.pct, r.step * 20) / 100f).coerceIn(.04f, 1f)).clip(RoundedCornerShape(3.dp)).background(p.lab))
        }
        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
            r.steps.forEachIndexed { i, n ->
                val done = i < r.step
                val act = i == r.step
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        Modifier.size(15.dp).clip(CircleShape).background(if (done) p.pos else Color.Transparent)
                            .then(if (done) Modifier else Modifier.border(if (act) 2.dp else 1.5.dp, if (act) p.lab else p.line, CircleShape)),
                        contentAlignment = Alignment.Center,
                    ) { if (done) Text("✓", color = Color.White, fontSize = 8.5.sp, fontWeight = FontWeight.ExtraBold) }
                    Text(n, color = if (done || act) p.ink else p.mut, fontFamily = PaperFonts.sans, fontWeight = if (act) FontWeight.Bold else FontWeight.Medium, fontSize = 13.sp)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp)).press24 { vm.followRcChat34(r) }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center) { Text("Følg i Chat ›", color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).press24 { vm.cancelRcAi34(r) }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center) { Text("Avbryt", color = p.lab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        }
    }
}

/* ======================= Kvitteringer: «✦ På nytt» med fremdrift ======================= */

private const val RED39 = 0xFFB23A2A

private const val OK39 = 0xFF2F7A4F

/** Tynn rød linje under en lukket rad mens den leses på nytt. */
@Composable
internal fun ReLine39(pct: Int) {
    val p = PaperPal.current
    Box(Modifier.fillMaxWidth().height(2.dp).background(p.line)) {
        Box(Modifier.fillMaxWidth((pct.coerceIn(0, 100) / 100f).coerceAtLeast(.02f)).height(2.dp).background(Color(RED39)))
    }
}

/**
 * Panelet under knappene: nåværende steg (fet) + prosent (mono, rød), linje 6 dp og steglisten (✓ ferdig · • pågår · · venter).
 * Feil: rødt «✕ Gemini svarte ikke» med «Prøv igjen» og «Bruk lokal OCR». Avbryt mens den jobber.
 */
@Composable
internal fun ReProgress39(vm: AppViewModel, id: String, re: Re39) {
    val p = PaperPal.current
    val idx = RE_STEPS39.indexOfFirst { it.first == re.step }.let { if (re.done) RE_STEPS39.size else it }
    val label = { s: String -> s.replace("{motor}", re.engine) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            val now = when {
                re.cancelled -> re.msg ?: "Avbrutt · ingenting ble endret"
                re.error -> re.msg?.let { if (it.startsWith("✕")) it else "✕ $it" } ?: "✕ ${re.engine} svarte ikke"
                re.done -> re.msg ?: "✦ Glimt har analysert på nytt"
                else -> re.msg ?: RE_STEPS39.getOrNull(idx)?.second?.let(label) ?: "Starter …"
            }
            Text(now, color = if (re.error && !re.cancelled) Color(RED39) else p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp,
                maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (!re.error) Text("${re.pct} %", color = Color(RED39), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        }
        if (!re.error) Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(p.line)) {
            Box(Modifier.fillMaxWidth((re.pct.coerceIn(0, 100) / 100f).coerceAtLeast(.02f)).height(6.dp).clip(RoundedCornerShape(3.dp)).background(Color(RED39)))
        }
        if (!re.cancelled) RE_STEPS39.forEachIndexed { i, (_, t) ->
            val st = when { i < idx -> "done"; i == idx && re.error -> "err"; i == idx -> "on"; else -> "wait" }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(when (st) { "done" -> "✓"; "on" -> "•"; "err" -> "✕"; else -> "·" }, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    color = when (st) { "done" -> Color(OK39); "err" -> Color(RED39); "on" -> p.ink; else -> p.mut }, modifier = Modifier.widthIn(min = 12.dp))
                Text(label(t), color = if (st == "wait") p.mut else p.ink, fontFamily = PaperFonts.sans, fontSize = 12.5.sp,
                    fontWeight = if (st == "on") FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (re.running) ReBtn39("Avbryt", false) { vm.cancelRe39(id) }
            if (re.error && !re.cancelled) {
                ReBtn39("Prøv igjen", true) { vm.reanalyze39(id) }
                ReBtn39("Bruk lokal OCR", false) { vm.reanalyze39(id, "tesseract") }
            }
        }
    }
}

@Composable
private fun ReBtn39(t: String, primary: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(if (primary) p.ink else Color.Transparent).border(1.dp, if (primary) p.ink else p.line, RoundedCornerShape(17.dp))
        .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
        Text(t, color = if (primary) p.bg else p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
    }
}

/* ======================= Økonomi-ikon 3c ======================= */

/** 3c: hvit lommebok med budsjettringen (gull, mint, rosa) som lås, på mørk blå #1B2A40. size = rutas side. */
@Composable
internal fun Okonomi40Icon(size: Dp, radius: Dp = size * .26f) {
    Box(Modifier.size(size).clip(RoundedCornerShape(radius)).background(Color(0xFF1B2A40)).semantics { contentDescription = "Økonomi" }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size * .78f)) { drawOkonomi40(this.size.width) }
    }
}

internal fun DrawScope.drawOkonomi40(px: Float) {
    val k = px / 48f
    val w = Color.White
    drawRoundRect(w, Offset(7 * k, 14 * k), Size(32 * k, 23 * k), androidx.compose.ui.geometry.CornerRadius(5 * k), style = Stroke(3.2f * k))
    svg40("M12 14 L28 8 L31 14", 0f, 0f, px, px, 48f, 48f, stroke = w, sw = 3.2f)
    drawCircle(Color(0xFF1B2A40), 6.5f * k, Offset(34 * k, 25.5f * k))
    drawCircle(w, 6.5f * k, Offset(34 * k, 25.5f * k), style = Stroke(2.5f * k))
    svg40("M34 21 A4.5 4.5 0 0 1 38.3 26.8", 0f, 0f, px, px, 48f, 48f, stroke = Color(0xFFF2C14E), sw = 3f)
    svg40("M38.3 26.8 A4.5 4.5 0 0 1 31 28.9", 0f, 0f, px, px, 48f, 48f, stroke = Color(0xFF7FD4C1), sw = 3f)
    svg40("M31 28.9 A4.5 4.5 0 0 1 34 21", 0f, 0f, px, px, 48f, 48f, stroke = Color(0xFFF6B7C8), sw = 3f)
}

/* ======================= Finans ======================= */

/** «Lagt til 16.10.2026 kl. 17.46 · skannet kvittering · Sebastian» (+ «Sist endret …») nederst i detaljen og på kvitteringen. */
@Composable
internal fun TxAdded40(vm: AppViewModel, txId: Int, receipt: Boolean = false) {
    val p = PaperPal.current
    var a by remember(txId) { mutableStateOf<Added40?>(null) }
    var r by remember(txId) { mutableStateOf<Added40?>(null) }
    LaunchedEffect(txId, vm.txDetail) { vm.loadAdded40(txId) { x, y -> a = x; r = y } }
    val v = (if (receipt) r ?: a else a) ?: return
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(v.line, color = p.sub, fontSize = 12.5.sp, textAlign = TextAlign.Center)
        v.edited?.let { Text(it, color = p.sub, fontSize = 12.5.sp, textAlign = TextAlign.Center) }
    }
}

/** «✦ La Glimt lese kvitteringen på nytt» + jobbkortet + resultatet (endringer / ingen endringer / summen stemmer ikke). */
@Composable
internal fun Reread40Section(vm: AppViewModel, t: Tx, receiptId: String?) {
    val p = PaperPal.current
    receiptId ?: return
    val r = vm.p40.rr[t.id]
    when {
        r == null -> Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(16.dp)).background(p.ink).clickable(role = Role.Button) { vm.reread40(t.id, receiptId) },
            contentAlignment = Alignment.Center) { Text("✦ La Glimt lese kvitteringen på nytt", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.5.sp) }
        r.busy -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            GlimtFig35("glimt", 34.dp, "talk")
            Column(Modifier.weight(1f)) {
                Text("Glimt leser kvitteringen på nytt …", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text("Sjekker butikk, dato, hver linje og at summen stemmer", color = p.mut, fontSize = 12.5.sp)
                ReadSecs50(r.started50, r.small50) // prompt 50: «Leser … 12 s» så det ikke ser hengt ut
            }
        }
        else -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PLabel("✦ GLIMT", p.lab)
            Text(r.error ?: r.text ?: "", color = if (r.error != null || r.sumOk == false) p.lab else p.ink, fontSize = 14.sp, lineHeight = 20.sp)
            r.changes.forEach { c ->
                Column {
                    Text(c.field, color = p.mut, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(c.old, color = p.mut, fontSize = 13.sp, textDecoration = TextDecoration.LineThrough, modifier = Modifier.weight(1f, fill = false))
                        Text("→", color = p.mut, fontSize = 13.sp)
                        Text(c.new, color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f, fill = false))
                    }
                }
            }
            if (r.error != null) RereadErr50Buttons(vm, t.id, receiptId, r) // prompt 50: Prøv igjen · Les mindre versjon · Lukk
            else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (r.changes.isNotEmpty() && r.candidateId != null) {
                    PButton("Bruk endringene", Modifier.weight(1f), height = 42.dp) { vm.rereadApply40(t.id, keep = true) }
                    PButton("Behold som før", Modifier.weight(1f), kind = "line", height = 42.dp) { vm.rereadApply40(t.id, keep = false) }
                } else if (r.sumOk == false) {
                    PButton("Rediger alt", Modifier.weight(1f), height = 42.dp) { vm.rereadApply40(t.id, keep = false); vm.p40.editAll = t.id }
                } else PButton("OK", Modifier.weight(1f), kind = "line", height = 42.dp) { if (r.candidateId != null) vm.rereadApply40(t.id, keep = false) else vm.p40.rr = vm.p40.rr - t.id }
            }
        }
    }
}

/** «Rediger alt»: alle felt, varelinjer med live sumkontroll og «Tilbakestill til slik Glimt leste den». */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun EditAll40Sheet(vm: AppViewModel, d: TxDetail) {
    val p = PaperPal.current
    val t = d.tx
    val nb = java.util.Locale("nb", "NO")
    val orig = remember(t.id) { (d.receipt?.lines?.ifEmpty { null } ?: t.lines).map { (n, v) -> EditLine40(n, String.format(nb, "%.2f", v)) } }
    var desc by remember(t.id) { mutableStateOf(t.description) }
    var merchant by remember(t.id) { mutableStateOf(t.merchant ?: "") }
    var date by remember(t.id) { mutableStateOf(t.date.take(10)) }
    var amount by remember(t.id) { mutableStateOf(String.format(nb, "%.2f", kotlin.math.abs(t.amount))) }
    var income by remember(t.id) { mutableStateOf(t.amount > 0) }
    var cat by remember(t.id) { mutableStateOf(t.categoryId) }
    var acc by remember(t.id) { mutableStateOf(t.accountId) }
    var note by remember(t.id) { mutableStateOf(t.note) }
    val lines = remember(t.id) { mutableStateListOf<EditLine40>().apply { addAll(orig) } }
    var linesTouched by remember(t.id) { mutableStateOf(false) }
    val ctx = LocalContext.current
    ModalBottomSheet(onDismissRequest = { vm.p40.editAll = null }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Rediger alt", 26.sp)
            PField("Butikk / beskrivelse", desc, { desc = it })
            PField("Motpart", merchant, { merchant = it }, placeholder = "F.eks. Rema 1000")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                Box(Modifier.weight(1f)) {
                    PField("Dato", date, { date = it }, placeholder = "ÅÅÅÅ-MM-DD")
                }
                PButton("Velg", height = 44.dp, kind = "line") {
                    val cur = runCatching { java.time.LocalDate.parse(date) }.getOrDefault(java.time.LocalDate.now())
                    android.app.DatePickerDialog(ctx, { _, y, m, dd -> date = "%04d-%02d-%02d".format(y, m + 1, dd) }, cur.year, cur.monthValue - 1, cur.dayOfMonth).show()
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                Box(Modifier.weight(1f)) { PField("Beløp", amount, { amount = it }, keyboard = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal)) }
                Seg40Small(listOf("ut" to "Utgift", "inn" to "Inntekt"), if (income) "inn" else "ut") { income = it == "inn" }
            }
            PLabel("KATEGORI", p.mut)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                (vm.boot?.categories ?: emptyList()).filter { it.kind == (if (income) "income" else "expense") || it.kind.isBlank() }.forEach { c -> PChip(c.name, c.id == cat) { cat = c.id } }
            }
            PLabel("KONTO", p.mut)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                (vm.boot?.accounts ?: emptyList()).forEach { a -> PChip(a.name, a.id == acc) { acc = a.id } }
            }
            PField("Notat", note, { note = it })
            PLabel("VARELINJER", p.mut)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                lines.forEachIndexed { i, l ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.weight(1f)) { PField("", l.name, { v -> lines[i] = l.copy(name = v); linesTouched = true }, placeholder = "Vare") }
                        Box(Modifier.width(96.dp)) { PField("", l.price, { v -> lines[i] = l.copy(price = v); linesTouched = true }, placeholder = "0,00",
                            keyboard = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal)) }
                        Box(Modifier.size(32.dp).clip(CircleShape).clickable(onClickLabel = "Fjern linje") { lines.removeAt(i); linesTouched = true }, contentAlignment = Alignment.Center) {
                            Text("×", modifier = Modifier.semantics { contentDescription = "Fjern linje" }, color = p.mut, fontSize = 20.sp)
                        }
                    }
                }
                Text("+ Legg til linje", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp,
                    modifier = Modifier.clip(CircleShape).clickable { lines.add(EditLine40("", "")); linesTouched = true }.padding(8.dp, 6.dp))
            }
            val sum = lines.sumOf { it.price.replace(',', '.').replace(" ", "").toDoubleOrNull() ?: 0.0 }
            val amt = amount.replace(',', '.').replace(" ", "").replace(" ", "").toDoubleOrNull() ?: 0.0
            if (lines.isNotEmpty()) {
                val ok = kotlin.math.abs(sum - amt) < 0.6
                Text("Sum linjer ${n2(sum)} kr · " + if (ok) "stemmer" else "stemmer ikke med beløpet", color = if (ok) p.pos else p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            if (orig.isNotEmpty()) Text("Tilbakestill til slik Glimt leste den", color = p.mut, fontSize = 13.sp, textDecoration = TextDecoration.Underline,
                modifier = Modifier.clickable { lines.clear(); lines.addAll(orig); linesTouched = false; amount = String.format(nb, "%.2f", kotlin.math.abs(t.amount)); desc = t.description; date = t.date.take(10) })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Avbryt", Modifier.weight(1f), kind = "line") { vm.p40.editAll = null }
                PButton(if (vm.p40.editBusy) "Lagrer …" else "Lagre", Modifier.weight(1f)) {
                    vm.saveAll40(t, desc, merchant, date, amount, income, cat, acc, note, if (linesTouched) lines.toList() else null) { vm.p40.editAll = null }
                }
            }
        }
    }
}

@Composable
private fun Seg40Small(opts: List<Pair<String, String>>, cur: String, pick: (String) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.height(44.dp).clip(RoundedCornerShape(22.dp)).background(p.surf2).padding(3.dp)) {
        opts.forEach { (k, n) ->
            val on = k == cur
            Box(Modifier.fillMaxHeight().clip(RoundedCornerShape(19.dp)).background(if (on) p.card else Color.Transparent).clickable { pick(k) }.padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center) { Text(n, color = if (on) p.ink else p.mut, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
        }
    }
}

/** Finans → Søk: Glimt-svaret i tre deler (oppsummering, tre nøkkeltall, kort per element) og «Åpne Subscription OS ›». */
@Composable
internal fun FinAsk40(vm: AppViewModel, a: Ask40) {
    val p = PaperPal.current
    val today = java.time.LocalDate.now()
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(20.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PLabel("✦ GLIMT", p.lab, modifier = Modifier.weight(1f))
            Text(a.source?.let { if (it.contains("Subscription", true)) "fra $it" else it } ?: "leste transaksjoner og kvitteringer", color = p.mut, fontSize = 11.5.sp, maxLines = 1)
        }
        PSerif(a.text, 19.sp, p.ink, weight = FontWeight.Normal)
        if (a.kpis.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            a.kpis.forEach { k ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(p.bg).padding(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(k.label, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, letterSpacing = 1.sp, maxLines = 1)
                    Text(k.value, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    k.sub?.let { Text(it, color = p.mut, fontSize = 11.sp, maxLines = 2, lineHeight = 14.sp) }
                }
            }
        }
        if (a.items.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.bg)) {
            a.items.forEachIndexed { i, it0 ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                val nd = it0.next?.let { n -> runCatching { java.time.LocalDate.parse(n.take(10)) }.getOrNull() }
                val days = nd?.let { java.time.temporal.ChronoUnit.DAYS.between(today, it).toInt() }
                Row(Modifier.fillMaxWidth().clickable { if (it0.kind == "sub") vm.openSubFromMer38() else it0.id?.toIntOrNull()?.let { id -> vm.openTxHl30(id, null) } }.padding(12.dp, 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Logo(vm, it0.domain, it0.name, 0xFF2B5D8A, 36, RoundedCornerShape(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(it0.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val nx = nd?.let { "Neste trekk ${it.dayOfMonth}. ${MON40[it.monthValue - 1]}" + (days?.let { d -> if (d == 0) " · i dag" else if (d > 0) " · om $d ${if (d == 1) "dag" else "dager"}" else "" } ?: "") }
                        (nx ?: it0.note)?.let { Text(it, color = if (days != null && days in 0..7) p.lab else p.mut, fontSize = 12.sp, maxLines = 1) }
                    }
                    it0.amount?.let { v ->
                        Column(horizontalAlignment = Alignment.End) {
                            Text("${if (v % 1.0 == 0.0) n0(v) else n2(v)} kr", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            val yearly = it0.cycle?.lowercase()?.let { c -> c.startsWith("year") || c.startsWith("år") } == true
                            Text(if (yearly) "per år · ${n0(v / 12)}/mnd" else "per mnd", color = p.mut, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
        a.action?.let { (label, target) ->
            PButton(label, Modifier.fillMaxWidth(), kind = "line", height = 44.dp) { if (target.contains("sub")) vm.openSubFromMer38() }
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
                    } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { vm.message = uiErr73(e, "Fikk ikke lagret") } finally { busy = false }
                }
            }
            PButton("↺ Til gjennomgang", Modifier, kind = "line", height = 42.dp) { vm.undo23(r) }
        }
        vm.p39.re[r.id]?.let { ReProgress39(vm, r.id, it) }
    }
}

/* ======================= Subscription OS → Historikk → Logg ======================= */

private val MON46 = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")

private fun kr46(v: Double) = "${n0(v)} kr"

/**
 * «Logg» under «Denne måneden»: N fakturaer · N prøveperioder · X kr betalt siste 12 mnd, filter Alle / Fakturaer / Prøveperioder,
 * gruppert per måned (nyeste først) med månedssum, 3 måneder om gangen og «Eksporter CSV».
 */
@Composable
internal fun SubLog46(vm: AppViewModel, fg: Color, mut: Color, card: Color, pos: Color) {
    val s = vm.p46.subLog
    val ctx = LocalContext.current
    LaunchedEffect(vm.account?.id) { if (s.events == null) vm.loadSubLog46() }
    val all = s.events
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Logg", color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, modifier = Modifier.weight(1f))
            if (!all.isNullOrEmpty()) Text("Eksporter CSV", color = fg, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clip(CircleShape).clickable {
                val list = filtered46(all, s.filter)
                runCatching { ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_SUBJECT, "Abonnementslogg").putExtra(Intent.EXTRA_TEXT, subLogCsv46(list)), "Eksporter CSV")) }
            }.padding(8.dp, 4.dp))
        }
        if (s.missing) { Text("Loggen finnes ikke på serveren ennå. Oppdater Homelab.", color = mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp)); return@Column }
        if (all == null) { Text(if (s.busy) "Henter loggen …" else "Ingen logg ennå.", color = mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp)); return@Column }
        val since = LocalDate.now().minusMonths(12)
        val nCh = all.count { it.type == "charge" }
        val nTr = all.count { it.type == "trial_start" }
        val paid = all.filter { (it.type == "charge" || it.type == "trial_converted") && it.date.isAfter(since) }.sumOf { kotlin.math.abs(it.amount ?: 0.0) }
        Text("$nCh fakturaer · $nTr prøveperioder · ${kr46(paid)} betalt siste 12 mnd", color = mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("alle" to "Alle", "fakturaer" to "Fakturaer", "prove" to "Prøveperioder").forEach { (k, n) ->
                Box(Modifier.height(32.dp).clip(CircleShape).background(if (s.filter == k) fg else card).clickable { Haptics.select(); s.filter = k; s.months = 3 }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center) { Text(n, color = if (s.filter == k) card else fg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
            }
        }
        val list = filtered46(all, s.filter)
        val groups = list.groupBy { it.date.withDayOfMonth(1) }.toSortedMap(compareByDescending { it })
        groups.entries.take(s.months).forEach { (m, ev) ->
            val sum = ev.filter { it.type == "charge" || it.type == "trial_converted" }.sumOf { kotlin.math.abs(it.amount ?: 0.0) }
            Row(Modifier.padding(start = 4.dp, end = 4.dp, top = 4.dp)) {
                Text(MON46[m.monthValue - 1].replaceFirstChar { it.uppercase() } + " ${m.year}", color = fg, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                if (sum > 0) Text("−" + kr46(sum), color = mut, fontFamily = PaperFonts.mono, fontSize = 13.sp)
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(card)) {
                ev.forEachIndexed { i, e ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(mut.copy(alpha = .2f)))
                    SubLogRow46(vm, e, fg, mut, pos)
                }
            }
        }
        val more = groups.size - s.months
        if (more > 0) Text("Vis eldre ($more ${if (more == 1) "måned" else "måneder"})", color = fg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp,
            modifier = Modifier.clip(CircleShape).clickable { Haptics.select(); s.months += 3 }.padding(8.dp))
        if (list.isEmpty()) Text("Ingen hendelser i loggen.", color = mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

private fun filtered46(all: List<SubEvent46>, f: String) = when (f) {
    "fakturaer" -> all.filter { it.type == "charge" || it.type == "price_change" }
    "prove" -> all.filter { it.type.startsWith("trial") }
    else -> all
}

@Composable
private fun SubLogRow46(vm: AppViewModel, e: SubEvent46, fg: Color, mut: Color, pos: Color) {
    val trial = e.type.startsWith("trial")
    val d = "${e.date.dayOfMonth}. ${MON46[e.date.monthValue - 1].take(3)}"
    val (desc, amount, green) = when (e.type) {
        "charge" -> Triple("Faktura · $d" + (e.account?.let { " · $it" } ?: "") + (if (e.oldPrice != null && e.amount != null && e.oldPrice < e.amount) " · gammel pris" else ""), e.amount?.let { "−" + kr46(it) } ?: "", false)
        "trial_start" -> Triple("$d · gratis" + (e.days?.let { " i $it dager" } ?: ""), "0 kr", false)
        "trial_cancelled", "trial_end" -> Triple("$d · sagt opp i tide", (e.saved ?: e.amount)?.let { "Spart " + kr46(it) } ?: "", true)
        "trial_converted" -> Triple("$d · " + (e.amount?.let { kr46(it) + "/mnd" } ?: "gikk over til betalt"), e.amount?.let { "−" + kr46(it) } ?: "", false)
        "price_change" -> Triple("$d · ny pris" + (e.oldPrice?.let { " (før ${kr46(it)})" } ?: ""), e.amount?.let { kr46(it) } ?: "", false)
        "cancelled" -> Triple("$d · sagt opp", "", false)
        else -> Triple(d, e.amount?.let { kr46(it) } ?: "", false)
    }
    Row(Modifier.fillMaxWidth().padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SubLogo(vm, null, e.service, 36)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(e.service, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (trial) Text("PRØVE", color = Color(0xFFFF7A3D), fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 9.5.sp,
                    modifier = Modifier.clip(RoundedCornerShape(5.dp)).border(1.dp, Color(0xFFFF7A3D), RoundedCornerShape(5.dp)).padding(horizontal = 5.dp, vertical = 1.dp))
            }
            Text(desc, color = mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(amount, color = if (green) pos else fg, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
    }
}

/* ======================= Butikklogo (Finans → Søk/Filter) ======================= */

/** 36 dp logo foran butikknavnet: serverens lokale logo-cache (logos52), forbokstaven som reserve. */
@Composable
internal fun StoreLogo52(vm: AppViewModel, name: String, size: Dp = 36.dp) {
    val p = PaperPal.current
    val n = name.trim()
    LaunchedEffect(n) { if (n.isNotEmpty()) vm.logos52(listOf(n)) }
    LaunchedEffect(Unit) { LogoOv73.ensure(vm) }
    val lg = vm.p52b.logos[n]
    val shape = RoundedCornerShape(size / 4)
    // Prompt 73 (LOGO73): brukerens eget valg vinner ("" = forbokstaven).
    val ov73 = LogoOv73.value(n)
    val url73 = if (ov73 != null) ov73.takeIf { it.startsWith("/") } else lg?.url
    ServerImage(vm, url73, Modifier.size(size).clip(shape).background(lg?.color?.let { Color(it) } ?: p.surf2)) {
        Text((lg?.initial ?: n.take(1)).uppercase(), color = if (lg?.color != null) Color.White else p.ink, fontWeight = FontWeight.ExtraBold, fontSize = (size.value * .4f).sp,
            modifier = Modifier.align(Alignment.Center))
    }
}
