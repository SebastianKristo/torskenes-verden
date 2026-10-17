package no.kristo.finanshub.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/* ---------------- Felles ---------------- */

/** Transportørmerket: initialer på merkefargen. */
@Composable
internal fun CarrierBadge(ini: String, color: Long, fg: Long, size: Int = 40) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape((size * 0.28f).dp)).background(Color(color)), contentAlignment = Alignment.Center) {
        Text(ini, color = Color(fg), fontWeight = FontWeight.Black, fontSize = (size * if (ini.length > 2) 0.28f else 0.36f).sp, maxLines = 1)
    }
}

/** Fremdrift i 5 steg. */
@Composable
internal fun StepBar(step: Int, color: Color) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        repeat(5) { i -> Box(Modifier.weight(1f).height(5.dp).clip(CircleShape).background(if (i <= step) color else C.surface3)) }
    }
}

private fun Shipment.tint(): Color = when { ready -> C.accentLight; done -> C.positive; status == "delayed" -> C.red; else -> C.text }

private val TRK_FILTERS = listOf("active" to "Aktive", "pickup" to "Klar for henting", "out" to "Utgående", "done" to "Levert")
internal val TRK_PREFS = listOf(Triple("found", "Nytt sporingsnummer funnet", "Fra e-post eller Finn"), Triple("out", "Ute for levering", null),
    Triple("pickup", "Klar for henting", null), Triple("delivered", "Levert", null), Triple("delayed", "Forsinket", "Av som standard"))

@Composable
private fun TCard(content: @Composable ColumnScope.() -> Unit) =
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)

/* ---------------- Sporing (Homelab-fane) ---------------- */

@Composable
internal fun TrackingScreen(vm: AppViewModel) {
    val ctx = LocalContext.current
    val t = vm.tracking
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) { if (Build.VERSION.SDK_INT >= 33 && !Notify.allowed(ctx)) ask.launch(Manifest.permission.POST_NOTIFICATIONS) }
    Page {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(vm.hlName(Screen.Tracking), style = MaterialTheme.typography.headlineMedium)
                    Text(t?.let { d -> listOfNotNull(if (d.activeCount > 0) "${d.activeCount} på vei" else "Ingen på vei", if (d.pickupCount > 0) "${d.pickupCount} klar for henting" else null).joinToString(" · ") } ?: "Pakker på vei",
                        color = C.text2, fontSize = 13.sp)
                }
                Avatar(vm)
            }
        }
        vm.moduleError?.let { e -> item { Empty(e) } }
        item { AddCard(vm, t) }
        if (t == null) { if (vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) } }; return@Page }
        item { SourcesCard(vm, t) }
        item {
            val counts = mapOf("active" to t.activeCount, "pickup" to t.pickupCount, "out" to t.items.count { it.outgoing && it.active }, "done" to t.items.count { it.archived || it.done })
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TRK_FILTERS.forEach { (k, l) ->
                    val n = counts[k] ?: 0
                    FilterChip(selected = vm.trkFilter == k, onClick = { Haptics.select(); vm.trkFilter = k }, label = { Text(if (n > 0) "$l $n" else l) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = C.container, selectedLabelColor = C.onContainer))
                }
            }
        }
        val shown = t.items.filter { s ->
            when (vm.trkFilter) { "pickup" -> !s.archived && s.ready; "out" -> s.outgoing && s.active; "done" -> s.archived || s.done; else -> s.active }
        }
        if (shown.isEmpty()) item { Empty("Ingen sendinger her.") }
        shown.forEach { s -> item(key = "trk-${s.id}") { ShipmentCard(vm, s) } }
        item { PrefsCard(vm, t) }
        item { CarriersCard(t) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddCard(vm: AppViewModel, t: TrackingData?) {
    val clip = LocalClipboardManager.current
    var no by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var carrier by remember { mutableStateOf<String?>(null) }
    var out by remember { mutableStateOf(false) }
    val clean = no.trim()
    val guess = Carrier.detect(clean)
    val pick = carrier ?: guess
    val carriers = t?.carriers ?: Carrier.KNOWN
    val colors = TextFieldDefaults.colors(focusedContainerColor = C.surface2, unfocusedContainerColor = C.surface2, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent)
    TCard {
        TextField(no, { no = it; carrier = null }, placeholder = { Text("Lim inn sporingsnummer") }, singleLine = true,
            leadingIcon = { Icon(Icons.Filled.LocalShipping, null, tint = C.primary) },
            trailingIcon = {
                if (no.isEmpty()) TextButton(onClick = { clip.getText()?.text?.let { no = it.trim() } }) { Text("Lim inn") }
                else IconButton(onClick = { no = "" }) { Icon(Icons.Filled.Close, "Tøm") }
            },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false),
            shape = RoundedCornerShape(28.dp), colors = colors, modifier = Modifier.fillMaxWidth())
        if (clean.isNotEmpty()) {
            TextField(name, { name = it }, placeholder = { Text("Navn (valgfritt), f.eks. Zalando · jakke") }, singleLine = true, shape = RoundedCornerShape(28.dp), colors = colors, modifier = Modifier.fillMaxWidth())
            Text(if (guess == "other") "Ukjent format. Velg transportør, eller la reservetjenesten finne den." else "Gjenkjent: ${carriers.firstOrNull { it.id == guess }?.name ?: guess}. Trykk for å velge en annen.",
                color = C.text2, fontSize = 12.sp)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                carriers.forEach { c ->
                    FilterChip(selected = pick == c.id, onClick = { Haptics.select(); carrier = c.id }, label = { Text(c.name) },
                        leadingIcon = { CarrierBadge(c.ini, c.color, c.fg, 20) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = C.container, selectedLabelColor = C.onContainer))
                }
            }
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(selected = !out, onClick = { out = false }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text("Til meg") }
                SegmentedButton(selected = out, onClick = { out = true }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text("Utgående") }
            }
        }
        Button(onClick = { Haptics.tap(); vm.addTracking(clean, name, pick, out); no = ""; name = ""; carrier = null; out = false }, enabled = clean.length >= 6,
            modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(25.dp), colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) {
            Text("Spor", fontWeight = FontWeight.Bold)
        }
    }
}

private fun stamp(i: java.time.Instant?): String {
    i ?: return "Ikke sjekket ennå"
    val today = i.atZone(ZoneId.systemDefault()).toLocalDate() == LocalDate.now()
    return "Sist sjekket " + fmtTime(i, if (today) "HH:mm" else "dd.MM HH:mm")
}

@Composable
private fun SourcesCard(vm: AppViewModel, t: TrackingData) {
    TCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Kilder", fontWeight = FontWeight.SemiBold)
                Text(stamp(t.lastCheck), color = C.text2, fontSize = 12.sp)
            }
            FilledTonalButton(onClick = { Haptics.tap(); vm.checkTracking() }, enabled = !vm.trkChecking) {
                if (vm.trkChecking) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else Icon(Icons.Filled.Refresh, null, Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp)); Text(if (vm.trkChecking) "Sjekker …" else "Sjekk nå")
            }
        }
        SwitchRow("Finn", "Fiks ferdig-handler med sporingsnummer", t.finn.on) { vm.setTrackingSource("finn", it) }
        SwitchRow("E-post (Proton Mail)", "Ordre- og fraktbekreftelser hvert 15. minutt", t.email.on) { vm.setTrackingSource("email", it) }
    }
}

@Composable
internal fun SwitchRow(label: String, sub: String?, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!on) }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label)
            sub?.let { Text(it, color = C.text2, fontSize = 12.sp) }
        }
        Switch(checked = on, onCheckedChange = onChange, colors = SwitchDefaults.colors(checkedTrackColor = C.primary, checkedThumbColor = C.onPrimary))
    }
}

@Composable
private fun ShipmentCard(vm: AppViewModel, s: Shipment) {
    val uri = LocalUriHandler.current
    val open = vm.trkSel == s.id
    var confirm by remember(s.id) { mutableStateOf(false) }
    LaunchedEffect(confirm) { if (confirm) { delay(4000); confirm = false } }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).animateContentSize()) {
        Column(Modifier.fillMaxWidth().clickable { Haptics.select(); vm.trkSel = if (open) null else s.id }.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CarrierBadge(s.carrierIni, s.carrierColor, s.carrierFg)
                Column(Modifier.weight(1f)) {
                    Text(s.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${s.carrierName} · ${s.trackingNo}", color = C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Chip(if (s.outgoing) "Ut · ${s.sourceLabel}" else s.sourceLabel)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.statusText, color = s.tint(), fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1)
                Text(s.etaText, color = C.text2, fontSize = 12.sp, maxLines = 1)
            }
            StepBar(s.step, if (s.done) C.positive else C.primary)
            Row(Modifier.fillMaxWidth()) {
                s.steps.forEachIndexed { i, l ->
                    Text(l, fontSize = 9.sp, color = if (i <= s.step) C.text else C.text2.copy(alpha = .5f), fontWeight = if (i == s.step) FontWeight.SemiBold else FontWeight.Normal,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                }
            }
            if (!open) s.events.firstOrNull()?.let { e ->
                Text(listOf(e.status, e.location, e.whenText).filter { it.isNotBlank() }.joinToString(" · "), color = C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (open) Column(Modifier.fillMaxWidth().padding(16.dp, 0.dp, 16.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            HorizontalDivider(color = C.surface3)
            if (s.events.isEmpty()) Text("Ingen hendelser ennå.", color = C.text2, fontSize = 13.sp)
            s.events.forEachIndexed { i, e ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.padding(top = 5.dp).size(10.dp).clip(CircleShape).background(if (i == 0) s.tint() else C.outline))
                    Column(Modifier.weight(1f)) {
                        Text(e.status, fontWeight = if (i == 0) FontWeight.SemiBold else FontWeight.Normal, fontSize = 14.sp)
                        Text(listOf(e.whenText, e.location).filter { it.isNotBlank() }.joinToString(" · "), color = C.text2, fontSize = 12.sp)
                    }
                }
            }
            if (s.sourceRef.isNotBlank()) Text("✦ ${s.sourceRef}", color = C.accentLight, fontSize = 12.sp)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (s.url.isNotBlank()) Button(onClick = { Haptics.tap(); runCatching { uri.openUri(s.url) } }, colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) {
                    Text("Åpne hos ${s.carrierName} ↗")
                }
                FilledTonalButton(onClick = { Haptics.tap(); vm.archiveTracking(s, !s.archived) }) { Text(if (s.archived) "Hent tilbake" else "Arkiver") }
                OutlinedButton(onClick = {
                    if (confirm) { confirm = false; vm.deleteTracking(s) } else { Haptics.error(); confirm = true }
                }) { Text(if (confirm) "Bekreft sletting" else "Slett", color = C.red) }
            }
        }
    }
}

@Composable
private fun PrefsCard(vm: AppViewModel, t: TrackingData) {
    TCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Varsler og haptikk", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text("Varsel når appen henter status", color = C.text2, fontSize = 12.sp)
        }
        TRK_PREFS.forEach { (k, l, sub) -> SwitchRow(l, sub, t.prefs[k] ?: (k != "delayed")) { vm.setTrackingPref(k, it) } }
        SwitchRow("Haptikk ved pakkevarsler", "Lagres på denne enheten", vm.flag(Haptics.PKG, true)) { vm.setPref(Haptics.PKG, it) }
        Text("Ekte push fra serveren er ikke bygget ennå. Varslene kommer når appen er åpen eller henter status.", color = C.text2, fontSize = 12.sp)
    }
}

@Composable
private fun CarriersCard(t: TrackingData) {
    val list = t.carriers.filter { it.id != "other" } + t.carriers.filter { it.id == "other" }
    TCard {
        Column {
            Text("Transportører", fontWeight = FontWeight.SemiBold)
            Text("Nøkler legges inn i Innstillinger → Integrasjoner → Sporing (web)", color = C.text2, fontSize = 12.sp)
        }
        list.forEach { c ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CarrierBadge(c.ini, c.color, c.fg, 30)
                Text(c.name, modifier = Modifier.weight(1f), maxLines = 1)
                c.configured?.let { ok -> Text(if (ok) "Nøkkel ✓" else "Mangler nøkkel", color = if (ok) C.positive else C.text2, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
            }
        }
    }
}

/* ---------------- Homelab-hjem: karusell med klokke og vær + pakker ---------------- */

/** Ikon for en MET-symbolkode («partlycloudy_day», «rainshowers_night» …), ellers ut fra teksten. */
internal fun weatherIcon(code: String, text: String = ""): ImageVector {
    val c = code.lowercase()
    val night = c.endsWith("_night") || c.endsWith("_polartwilight")
    val t = text.lowercase()
    return when {
        "thunder" in c || "torden" in t -> Icons.Filled.FlashOn
        "snow" in c || "sleet" in c || "snø" in t || "sludd" in t -> Icons.Filled.AcUnit
        "rain" in c || "regn" in t || "byger" in t -> Icons.Filled.Umbrella
        "fog" in c || "tåke" in t -> Icons.Filled.Dehaze
        "clearsky" in c || (c.isEmpty() && ("klar" in t || "sol" in t)) -> if (night) Icons.Filled.NightsStay else Icons.Filled.WbSunny
        "partlycloudy" in c || "fair" in c || "lettskyet" in t || "delvis" in t -> if (night) Icons.Filled.NightsStay else Icons.Filled.WbCloudy
        else -> Icons.Filled.Cloud
    }
}

private fun deg(v: Double?) = v?.let { "${Math.round(it)}°" } ?: "–"
private fun mm(v: Double) = String.format(java.util.Locale("nb", "NO"), if (v < 10) "%.1f" else "%.0f", v)

/** Klokke og vær (kompakt, like stort som Pakker-kortet). */
@Composable
internal fun WeatherCard(vm: AppViewModel, modifier: Modifier = Modifier) {
    var now by remember { mutableStateOf(LocalTime.now()) }
    LaunchedEffect(Unit) { while (true) { now = LocalTime.now(); delay(1000) } }
    val w = vm.mobileHome?.weather
    val x = vm.mobileHome?.weatherX
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface1).padding(18.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(now.format(DateTimeFormatter.ofPattern("HH:mm")), fontSize = 44.sp, fontWeight = FontWeight.Light, fontFamily = Mono)
                Text(longDate(), color = C.text2, fontSize = 13.sp, maxLines = 1)
            }
            if (w == null) Text("Vær mangler", color = C.text2, fontSize = 13.sp)
            else Column(horizontalAlignment = Alignment.End) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(weatherIcon(x?.symbol ?: "", w.text ?: ""), null, tint = C.primary, modifier = Modifier.size(26.dp))
                    Text(deg(w.temp), fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
                }
                w.text?.let { Text(it, color = C.text2, fontSize = 13.sp, maxLines = 1) }
                val extra = listOfNotNull(x?.feels?.let { "Føles ${deg(it)}" }, (x?.hi ?: w.max)?.let { "↑ ${deg(it)}" }, (x?.lo ?: w.min)?.let { "↓ ${deg(it)}" })
                if (extra.isNotEmpty()) Text(extra.joinToString(" · "), color = C.text2, fontSize = 12.sp, maxLines = 1)
            }
        }
        if (x != null) {
            val line = listOfNotNull((x.wind ?: w?.wind)?.let { "Vind ${Math.round(it)} m/s${if (x.windDir.isNotBlank()) " ${x.windDir}" else ""}${x.gust?.let { g -> " (kast ${Math.round(g)})" } ?: ""}" },
                x.precip24?.let { "Nedbør ${mm(it)} mm" }, x.humidity?.let { "Fukt ${Math.round(it)} %" })
            if (line.isNotEmpty()) Text(line.joinToString(" · "), color = C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (x.hours.isNotEmpty()) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.surface2).padding(vertical = 6.dp)) {
                x.hours.take(6).forEach { h ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(h.label, color = C.text2, fontSize = 11.sp, maxLines = 1)
                        Icon(weatherIcon(h.symbol), null, tint = C.primary, modifier = Modifier.size(16.dp))
                        Text(deg(h.temp), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text(if (h.mm > 0) mm(h.mm) else " ", fontSize = 9.sp, color = tc(0xFF8FC1FF))
                    }
                }
            }
            if (x.nowcast.isNotBlank()) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Filled.Umbrella, null, tint = C.accentLight, modifier = Modifier.size(14.dp))
                Text(x.nowcast, color = C.accentLight, fontSize = 12.sp, maxLines = 2)
            }
            val days = if (x.days.size > 3) x.days.drop(1).take(3) else x.days
            days.forEach { d ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(d.label, fontSize = 12.sp, modifier = Modifier.width(52.dp), maxLines = 1)
                    Icon(weatherIcon(d.symbol), null, tint = C.primary, modifier = Modifier.size(16.dp))
                    Text("${deg(d.max)} / ${deg(d.min)}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    if (d.mm > 0) Text("${mm(d.mm)} mm", fontSize = 11.sp, color = tc(0xFF8FC1FF))
                }
            }
            val chips = listOfNotNull(x.sunrise?.let { "↑ " + fmtTime(it, "HH:mm") }, x.sunset?.let { "↓ " + fmtTime(it, "HH:mm") }, x.uv?.let { "UV ${Math.round(it)}" },
                x.pressure?.let { "${Math.round(it)} hPa" + when (x.pressureTrend) { "Stigende" -> " ↑"; "Synkende" -> " ↓"; else -> "" } })
            if (chips.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { chips.forEach { Chip(it, C.surface2, C.text) } }
        }
    }
}

/** «Pakker» i karusellen: de 2 viktigste. Trykk åpner Sporing. */
@Composable
internal fun PackagesCard(vm: AppViewModel, modifier: Modifier = Modifier) {
    val items = vm.homePackages ?: vm.tracking?.top(2) ?: emptyList()
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface1).clickable { Haptics.tap(); vm.go(Screen.Tracking) }.padding(18.dp, 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.LocalShipping, null, tint = C.primary)
            Text("Pakker", fontWeight = FontWeight.SemiBold, fontSize = 17.sp, modifier = Modifier.weight(1f))
            vm.tracking?.activeCount?.takeIf { it > 0 }?.let { Chip("$it", C.container, C.onContainer) }
        }
        if (items.isEmpty()) Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) { Text("Ingen pakker på vei.", color = C.text2) }
        else {
            items.take(2).forEach { s ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(C.surface2).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CarrierBadge(s.carrierIni, s.carrierColor, s.carrierFg, 34)
                        Column(Modifier.weight(1f)) {
                            Text(s.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(s.statusText + if (s.etaText.isBlank()) "" else " · ${s.etaText}", color = if (s.ready) C.accentLight else C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    StepBar(s.step, if (s.done) C.positive else C.primary)
                }
            }
            Spacer(Modifier.weight(1f))
        }
        Text("Åpne sporing ›", color = C.primary, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.align(Alignment.End))
    }
}

/** Sveip sideveis mellom klokke og vær og pakkene, med prikker under (kan trykkes). Flyttes og skjules med «Klokke og vær». */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun HomeCarousel(vm: AppViewModel) {
    val state = rememberPagerState(pageCount = { 2 })
    val scope = rememberCoroutineScope()
    LaunchedEffect(state) { snapshotFlow { state.currentPage }.drop(1).collect { Haptics.select() } }
    val h = if (vm.mobileHome?.weatherX != null) 420.dp else 240.dp
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HorizontalPager(state, Modifier.fillMaxWidth().height(h), pageSpacing = 12.dp) { p ->
            if (p == 0) WeatherCard(vm, Modifier.fillMaxHeight()) else PackagesCard(vm, Modifier.fillMaxHeight())
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(2) { i ->
                val on = state.currentPage == i
                Box(Modifier.height(24.dp).clickable { scope.launch { state.animateScrollToPage(i) } }, contentAlignment = Alignment.Center) {
                    Box(Modifier.height(7.dp).width(if (on) 18.dp else 7.dp).clip(CircleShape).background(if (on) C.primary else C.surface3))
                }
            }
        }
    }
}
