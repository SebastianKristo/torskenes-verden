package no.kristo.finanshub.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import no.kristo.finanshub.*
import kotlin.math.abs

/*
 * Prompt 48 (ANDROID48): dokumentskanneren (ML Kit Document Scanner) og kvitteringsarket med redigerbart skjema (Del 5).
 * Logikken ligger i ReceiptScan48.kt (ReceiptScanViewModel48 med StateFlow) og ReceiptOcr48.kt (felles OCR-format).
 */

private fun Context.activity48(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) { if (c is Activity) return c; c = c.baseContext }
    return null
}

/**
 * Kameraknappen. «Dokumentskanner» på (AV som standard) og en kvittering (ikke oppskrift): Googles dokumentskanner med
 * automatisk kantfinning, perspektivretting og beskjæring (kjører i Play-tjenester på telefonen, ingen kameratillatelse).
 * Mangler Play-tjenester/modulen, eller valget er av: systemkameraet som før ([fallback]).
 */
@Composable
internal fun rememberDocScan48(vm: AppViewModel, fallback: () -> Unit): () -> Unit {
    val ctx = LocalContext.current
    val latest by rememberUpdatedState(fallback)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { res ->
        if (res.resultCode != Activity.RESULT_OK) return@rememberLauncherForActivityResult
        val pages = runCatching { GmsDocumentScanningResult.fromActivityResultIntent(res.data)?.getPages()?.mapNotNull { it.getImageUri() } }.getOrNull() ?: emptyList()
        if (pages.isNotEmpty()) vm.scanUris(pages.take(1))
    }
    return remember(vm, launcher) {
        {
            val act = ctx.activity48()
            if (!vm.flag(PREF_DOCSCAN48, false) || vm.scanTarget == "recipe" || act == null) latest()
            else {
                val opts = GmsDocumentScannerOptions.Builder()
                    .setGalleryImportAllowed(true)
                    .setPageLimit(1)
                    .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
                    .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                    .build()
                runCatching {
                    GmsDocumentScanning.getClient(opts).getStartScanIntent(act)
                        .addOnSuccessListener { sender -> runCatching { launcher.launch(IntentSenderRequest.Builder(sender).build()) }.onFailure { latest() } }
                        .addOnFailureListener {
                            vm.message = "Dokumentskanneren er ikke tilgjengelig (krever Google Play-tjenester). Kameraet brukes i stedet."
                            latest()
                        }
                }.onFailure { latest() }
            }
        }
    }
}

/* ======================= Kvitteringsarket ======================= */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReceiptSheet48(vm: AppViewModel) {
    val st by vm.scan48.state.collectAsState()
    val visible by vm.scan48.visible.collectAsState()
    if (!visible || st == ReceiptScanState48.Idle) return
    val p = PaperPal.current
    ModalBottomSheet(
        onDismissRequest = { vm.scan48.close() }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) },
    ) {
        Column(
            Modifier.fillMaxWidth().imePadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(start = 18.dp, end = 18.dp, bottom = 26.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PSerif("Kvittering", 24.sp, maxLines = 1)
            when (val s = st) {
                ReceiptScanState48.Idle -> Unit
                is ReceiptScanState48.Scanning -> Busy48(s.note)
                is ReceiptScanState48.Uploading -> Uploading48(s)
                is ReceiptScanState48.Draft -> Draft48(vm, s)
                is ReceiptScanState48.Done -> Done48(vm, s)
                is ReceiptScanState48.Error -> Error48(vm, s)
            }
        }
    }
}

@Composable
private fun Busy48(text: String) {
    val p = PaperPal.current
    Text(text, color = p.mut, fontSize = 13.sp)
    LinearProgressIndicator(Modifier.fillMaxWidth(), color = p.ink, trackColor = p.line)
}

@Composable
private fun Uploading48(s: ReceiptScanState48.Uploading) {
    val p = PaperPal.current
    Busy48(if (s.withOcr) "Glimt kontrollerer teksten fra telefonen …" else "Glimt leser kvitteringen …")
    s.note?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
    Text("Du kan lukke arket. Kvitteringen leses ferdig og havner under Til gjennomgang.", color = p.mut, fontSize = 12.5.sp)
}

@Composable
private fun Done48(vm: AppViewModel, s: ReceiptScanState48.Done) {
    val p = PaperPal.current
    Text(s.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    Text(s.text, color = p.mut, fontSize = 13.sp)
    PButton("Ferdig", Modifier.fillMaxWidth()) { vm.scan48.close() }
}

@Composable
private fun Error48(vm: AppViewModel, s: ReceiptScanState48.Error) {
    val p = PaperPal.current
    Text(s.message, color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PButton("Last opp bildet", Modifier.weight(1f), kind = "line") { vm.scan48.uploadPlain() }
        if (s.retry) PButton("Prøv igjen", Modifier.weight(1f)) { vm.scan48.retry() }
        else PButton("Lukk", Modifier.weight(1f)) { vm.scan48.close() }
    }
}

/* ---------- Skjemaet ---------- */

private fun conf48(c: String) = when (c) { "high" -> "Sikker"; "medium" -> "Middels sikker"; else -> "Usikker" }
private fun ms48(ms: Long) = if (ms < 1000) "$ms ms" else String.format(java.util.Locale("nb", "NO"), "%.1f s", ms / 1000.0)
private fun sym48(status: String) = when (status) { "ok" -> "✓"; "failed", "error" -> "✕"; "compare" -> "≈"; else -> "–" }
private fun status48(status: String) = when (status) {
    "ok" -> "godkjent"; "failed" -> "feilet kontrollen"; "error" -> "feil"; "skipped" -> "hoppet over"; "unavailable" -> "utilgjengelig"; "compare" -> "sammenlignet"; else -> status
}

@Composable
private fun Draft48(vm: AppViewModel, s: ReceiptScanState48.Draft) {
    val p = PaperPal.current
    val r = s.result
    val f = s.form
    Path48(r)
    if (r.receipt == null) Text("Glimt fant ingen tolkning som besto kontrollen. Fyll ut feltene selv.", color = p.lab, fontSize = 13.sp)
    (r.errors + r.warnings).take(3).forEach { Text(it, color = p.mut, fontSize = 12.sp, maxLines = 3) }
    Field48("Butikk", f.merchant, r.unsure("merchant")) { v -> vm.scan48.edit { it.copy(merchant = v) } }
    if (f.merchant.trim() == (r.receipt?.optStr("merchant") ?: "")) MerchantSource51(r.merchantSource, r.merchantLabel) // prompt 51
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Field48("Dato (ÅÅÅÅ-MM-DD)", f.date, r.unsure("date"), Modifier.weight(1.4f)) { v -> vm.scan48.edit { it.copy(date = v) } }
        Field48("Klokken", f.time, r.unsure("time"), Modifier.weight(1f)) { v -> vm.scan48.edit { it.copy(time = v) } }
    }
    Field48("Total (kr)", f.total, r.unsure("total"), keyboard = KeyboardType.Decimal) { v -> vm.scan48.edit { it.copy(total = v) } }
    Category48(vm, f, r.unsure("category_suggestion"))
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Field48("Org.nr.", f.orgNumber, r.unsure("org_number"), Modifier.weight(1f), KeyboardType.Number) { v -> vm.scan48.edit { it.copy(orgNumber = v) } }
        Field48("Betaling", f.payment, r.unsure("payment_method"), Modifier.weight(1f)) { v -> vm.scan48.edit { it.copy(payment = v) } }
    }
    Items48(vm, r, f)
    RawData51(vm, r.receiptId, r.ocrRaw) // prompt 51: «Rådata» (OCR-motor, rader, bildestørrelse)
    s.error?.let { Text(it, color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
    if (s.saving) Busy48("Lagrer …")
    else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PButton("Til gjennomgang", Modifier.weight(1f), kind = "line") { vm.scan48.save(book = false) }
        PButton("Bokfør", Modifier.weight(1f)) { vm.scan48.save(book = true) }
    }
}

/** Merkelapp for veien («Android + Glimt», «Mac», «Glimt (Tesseract)», «Gemini») + sikkerhet, og stegene på serveren. */
@Composable
private fun Path48(r: ScanResult48) {
    val p = PaperPal.current
    var open by remember(r.receiptId) { mutableStateOf(false) }
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Pill48(r.label?.let { "Lest av $it" } ?: "Ikke tolket", if (r.label == null) p.lab else p.ink)
        Pill48(conf48(r.confidence), if (r.confidence == "high") p.pos else p.lab)
        if (r.sentOcr) Pill48("Tekst fra telefonen", p.mut)
    }
    if (r.pipeline.isNotEmpty()) {
        Text(
            r.pipeline.joinToString("   ") { "${it.step} ${sym48(it.status)}${if (it.ms > 0) " " + ms48(it.ms) else ""}" } + if (open) "   ▴" else "   ▾",
            color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp,
            modifier = Modifier.clickable(role = Role.Button) { open = !open },
        )
        if (open) r.pipeline.forEach { st ->
            val extra = listOfNotNull(st.engine, st.reason, if (st.ms > 0) ms48(st.ms) else null).joinToString(" · ")
            Text("${st.step} · ${st.name.ifBlank { st.step }} · ${status48(st.status)}${if (extra.isNotEmpty()) " · $extra" else ""}", color = p.mut, fontSize = 12.sp)
        }
    }
}

@Composable
private fun Pill48(text: String, color: Color) {
    Box(Modifier.clip(CircleShape).border(1.dp, color, CircleShape).padding(horizontal = 11.dp, vertical = 5.dp)) {
        Text(text, color = color, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1)
    }
}

/** Understreket felt. Usikre felt (failed_fields/uncertain_fields fra serveren) har rød etikett og strek. */
@Composable
private fun Field48(label: String, value: String, unsure: Boolean, modifier: Modifier = Modifier, keyboard: KeyboardType = KeyboardType.Text, onChange: (String) -> Unit) {
    val p = PaperPal.current
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        PLabel(if (unsure) "$label · sjekk" else label, if (unsure) p.lab else p.mut, 10.sp)
        BasicTextField(
            value, onChange, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 17.sp, fontFamily = PaperFonts.serif),
            cursorBrush = SolidColor(p.lab), keyboardOptions = KeyboardOptions(keyboardType = keyboard), modifier = Modifier.fillMaxWidth(),
        )
        Box(Modifier.fillMaxWidth().height(if (unsure) 2.dp else 1.dp).background(if (unsure) p.lab else p.line))
    }
}

/** Kategori fra brukerens egne utgiftskategorier (samme liste som serveren velger category_suggestion fra). */
@Composable
private fun Category48(vm: AppViewModel, f: ScanForm48, unsure: Boolean) {
    val p = PaperPal.current
    val cats = vm.boot?.categories?.filter { it.kind == "expense" }?.map { it.name } ?: emptyList()
    val all = if (f.category.isNotBlank() && cats.none { it.equals(f.category, true) }) listOf(f.category) + cats else cats
    if (all.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel(if (unsure) "Kategori · sjekk" else "Kategori", if (unsure) p.lab else p.mut, 10.sp)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            all.forEach { c -> PChip(c, c.equals(f.category, true)) { vm.scan48.edit { it.copy(category = c, categoryTouched = true) } } }
        }
    }
}

@Composable
private fun Items48(vm: AppViewModel, r: ScanResult48, f: ScanForm48) {
    val p = PaperPal.current
    val unsure = r.unsure("items")
    val sum = f.items.sumOf { amount48(it.amount) ?: 0.0 }
    val disc = r.receipt?.optJSONArray("discounts")?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } } ?: emptyList()
    val discSum = disc.sumOf { it.optDouble("amount", 0.0).let { v -> if (v.isNaN()) 0.0 else v } }
    val total = amount48(f.total)
    PLabel(if (unsure) "Varelinjer · ${f.items.size} · sjekk" else "Varelinjer · ${f.items.size}", if (unsure) p.lab else p.mut, 10.sp)
    f.items.forEachIndexed { i, it -> ItemRow48(vm, i, it) }
    disc.forEach { d ->
        Row(Modifier.fillMaxWidth()) {
            Text(d.optString("description").ifBlank { "Rabatt" }, color = p.mut, fontSize = 13.sp, modifier = Modifier.weight(1f), maxLines = 1)
            Text(amountText48(d.optDouble("amount")), color = p.mut, fontFamily = PaperFonts.mono, fontSize = 13.sp)
        }
    }
    Text("+ Legg til linje", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
        modifier = Modifier.clickable(role = Role.Button) { vm.scan48.edit { it.copy(items = it.items + ScanItem48("", "")) } }.padding(vertical = 4.dp))
    if (total != null && f.items.isNotEmpty()) {
        val diff = sum + discSum - total
        val ok = abs(diff) <= 1.0
        Text(
            if (ok) "Linjene summerer til totalen" else "Linjene summerer ${amountText48(sum + discSum)} kr – avvik ${amountText48(diff)} kr",
            color = if (ok) p.pos else p.lab, fontSize = 12.5.sp,
        )
    }
}

@Composable
private fun ItemRow48(vm: AppViewModel, i: Int, it: ScanItem48) {
    val p = PaperPal.current
    val style = TextStyle(color = p.ink, fontSize = 14.sp, fontFamily = PaperFonts.sans)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        BasicTextField(it.description, { v -> vm.scan48.edit { f -> f.copy(items = f.items.mapIndexed { j, x -> if (j == i) x.copy(description = v) else x }) } },
            singleLine = true, textStyle = style, cursorBrush = SolidColor(p.lab), modifier = Modifier.weight(1f).border(1.dp, p.line, RoundedCornerShape(8.dp)).padding(8.dp, 6.dp))
        BasicTextField(it.amount, { v -> vm.scan48.edit { f -> f.copy(items = f.items.mapIndexed { j, x -> if (j == i) x.copy(amount = v) else x }) } },
            singleLine = true, textStyle = style.copy(fontFamily = PaperFonts.mono), cursorBrush = SolidColor(p.lab), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.width(92.dp).border(1.dp, p.line, RoundedCornerShape(8.dp)).padding(8.dp, 6.dp))
        Text("×", color = p.mut, fontSize = 18.sp, modifier = Modifier.clickable(role = Role.Button) { vm.scan48.edit { f -> f.copy(items = f.items.filterIndexed { j, _ -> j != i }) } }.padding(6.dp))
    }
}
