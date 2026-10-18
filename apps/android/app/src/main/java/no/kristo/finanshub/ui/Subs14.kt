package no.kristo.finanshub.ui

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate

/* ---------------- Subscription OS: rediger og legg til (prompt 14) ---------------- */

private val MONTH_NAMES = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")

/** «Neste trekk 21. oktober, deretter hvert år» ut fra dag, måned og syklus. */
internal fun nextChargeText(day: Int?, month: Int?, cycle: String): String {
    val d = day?.coerceIn(1, 31) ?: return "Velg faktureringsdag"
    val now = LocalDate.now()
    val next: LocalDate = if (cycle == "monthly" || month == null) {
        var x = now.withDayOfMonth(minOf(d, now.lengthOfMonth()))
        if (x.isBefore(now)) { val m = now.plusMonths(1); x = m.withDayOfMonth(minOf(d, m.lengthOfMonth())) }
        x
    } else {
        val m = month.coerceIn(1, 12)
        var x = now.withMonth(m).let { it.withDayOfMonth(minOf(d, it.lengthOfMonth())) }
        if (x.isBefore(now)) x = x.plusYears(1).let { it.withDayOfMonth(minOf(d, it.lengthOfMonth())) }
        x
    }
    val then = when (cycle) { "yearly" -> "hvert år"; "biennial" -> "hvert 2. år"; else -> "hver måned" }
    return "Neste trekk ${next.dayOfMonth}. ${MONTH_NAMES[next.monthValue - 1]}, deretter $then"
}

/** Logoen til et abonnement: egen opplastet / funnet av AI, ellers tjenestens logo fra domenet. */
@Composable
internal fun SubLogo(vm: AppViewModel, s: SubItem?, name: String, size: Int) {
    val url = s?.logoUrl
    var bmp by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url) { bmp = url?.let { vm.subLogo(it) } }
    val b = bmp
    if (b != null) Image(b.asImageBitmap(), name, contentScale = ContentScale.Crop, modifier = Modifier.size(size.dp).clip(RoundedCornerShape((size / 4).dp)))
    else Logo(vm, s?.domain, name.ifBlank { "?" }, 0xFFFF7A3D, size)
}

/**
 * Arket for å redigere eller legge til: logo (last opp eller ✦ Finn logo med AI), navn, pris, plan, kategori,
 * hvor ofte, faktureringsdato som dag + måned, og status. Lagre og Slett.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun SubEditForm(vm: AppViewModel, s: SubItem?, close: () -> Unit, embedded: Boolean = false) {
    var name by remember(s?.id) { mutableStateOf(s?.name ?: "") }
    var price by remember(s?.id) { mutableStateOf(s?.price?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString().replace('.', ',') } ?: "") }
    var plan by remember(s?.id) { mutableStateOf(s?.plan ?: "") }
    var category by remember(s?.id) { mutableStateOf(s?.category ?: "Annet") }
    var cycle by remember(s?.id) { mutableStateOf(s?.cycle ?: "monthly") }
    var day by remember(s?.id) { mutableStateOf((s?.billDay ?: s?.chargeDay)?.toString() ?: "") }
    var month by remember(s?.id) { mutableStateOf(s?.billMonth ?: s?.nextDate?.takeIf { it.length >= 7 }?.substring(5, 7)?.toIntOrNull()) }
    var status by remember(s?.id) { mutableStateOf(if (s != null && !s.active) "cancelled" else "active") }
    var pendingLogo by remember { mutableStateOf<Uri?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) { if (s != null) vm.subLogoUpload(s.id, uri) else pendingLogo = uri }
    }
    val cats = (vm.subsX?.categories ?: emptyList()).ifEmpty { listOf("Strømming", "Musikk", "Programvare", "Lagring", "Trening", "Nyheter", "Annet") }
    val p = parseAmount(price)
    val colors = TextFieldDefaults.colors(focusedContainerColor = C.surface2, unfocusedContainerColor = C.surface2, focusedIndicatorColor = C.primary, focusedLabelColor = C.primary)
    // Inne i «Legg til abonnement» (som allerede ruller) brukes ikke egen rulling eller overskrift.
    Column(
        if (embedded) Modifier.fillMaxWidth() else Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp, 0.dp, 20.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (!embedded) Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (s == null) "Nytt abonnement" else "Rediger abonnement", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            TextButton(onClick = close) { Text("Lukk", color = C.primary) }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SubLogo(vm, s, name, 56)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                FilledTonalButton(onClick = { pick.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                    Text(if (pendingLogo != null) "Logo valgt ✓" else "Last opp logo")
                }
                if (s != null) TextButton(onClick = { vm.subLogoAi(s.id) }) { Text("✦ Finn logo med AI", color = C.primary) }
                else Text("✦ AI kan finne logoen etter at abonnementet er lagret.", color = C.text2, fontSize = 12.sp)
            }
        }
        TextField(name, { name = it }, label = { Text("Navn") }, singleLine = true, colors = colors, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TextField(price, { price = it }, label = { Text("Pris i kr") }, singleLine = true, colors = colors, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
            TextField(plan, { plan = it }, label = { Text("Plan") }, singleLine = true, colors = colors, modifier = Modifier.weight(1f))
        }
        Text("Kategori", color = C.text2, fontSize = 13.sp)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            (cats + listOfNotNull(category.takeIf { it !in cats })).forEach { c -> FilterChip(selected = category == c, onClick = { category = c }, label = { Text(c) }) }
        }
        Text("Hvor ofte", color = C.text2, fontSize = 13.sp)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            listOf("monthly" to "Månedlig", "yearly" to "Årlig", "biennial" to "Hvert 2. år").forEachIndexed { i, (k, l) ->
                SegmentedButton(selected = cycle == k, onClick = { cycle = k }, shape = SegmentedButtonDefaults.itemShape(i, 3)) { Text(l, maxLines = 1) }
            }
        }
        Text("Faktureringsdato", color = C.text2, fontSize = 13.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            TextField(day, { day = it.filter(Char::isDigit).take(2) }, label = { Text("Dag") }, singleLine = true, colors = colors,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.width(90.dp))
            if (cycle != "monthly") Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MONTH_NAMES.forEachIndexed { i, m -> FilterChip(selected = month == i + 1, onClick = { month = i + 1 }, label = { Text(m.take(3)) }) }
            }
        }
        Text(if (s?.nextCharge != null && day == ((s.billDay ?: s.chargeDay)?.toString() ?: "") && month == s.billMonth && cycle == s.cycle) s.nextCharge
            else nextChargeText(day.toIntOrNull(), if (cycle == "monthly") null else month, cycle), color = C.text2, fontSize = 13.sp)
        Text("Status", color = C.text2, fontSize = 13.sp)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            listOf("active" to "Aktiv", "cancelled" to "Sagt opp").forEachIndexed { i, (k, l) ->
                SegmentedButton(selected = status == k, onClick = { status = k }, shape = SegmentedButtonDefaults.itemShape(i, 2)) { Text(l, maxLines = 1) }
            }
        }
        Button(
            onClick = {
                Haptics.tap()
                vm.saveSub(s?.id, name, plan, p ?: 0.0, cycle, day.toIntOrNull()?.coerceIn(1, 31), if (cycle == "monthly") null else month, category, status, pendingLogo)
                close()
            },
            enabled = name.isNotBlank() && p != null, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
            colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary),
        ) { Text("Lagre", fontWeight = FontWeight.Bold) }
        if (s != null) {
            if (!confirmDelete) OutlinedButton(onClick = { confirmDelete = true }, modifier = Modifier.fillMaxWidth().height(48.dp), shape = RoundedCornerShape(24.dp)) { Text("Slett", color = C.red) }
            else Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { confirmDelete = false }, modifier = Modifier.weight(1f)) { Text("Avbryt") }
                Button(onClick = { vm.deleteSub(s.id); close() }, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = C.red, contentColor = C.bg)) { Text("Slett for godt") }
            }
        }
    }
}

/** Arket rundt skjemaet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SubEditSheet(vm: AppViewModel, s: SubItem?, close: () -> Unit) {
    ModalBottomSheet(onDismissRequest = close, containerColor = sheetBg(), contentColor = sheetInk()) { SubEditForm(vm, s, close) }
}
