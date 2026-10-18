package no.kristo.finanshub.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/* ---------------- Subscription OS, nytt design: Hjem · Innsikt · Historikk ---------------- */

private val CAT_COLORS = listOf(0xFFFF7A3D, 0xFF7AA7FF, 0xFFF2C14E, 0xFF5FD3A8, 0xFFB79CFF, 0xFFFF8A80, 0xFF30B0C7, 0xFFA0A0AA)
private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des")
private fun kr0(v: Double) = "${neg0(v)} kr"
private val nbLocale: Locale = Locale.forLanguageTag("nb-NO")

@Composable
private fun SCard(content: @Composable ColumnScope.() -> Unit) =
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SubsMobileScreen(vm: AppViewModel) {
    var adding by remember { mutableStateOf(false) }
    var month by remember { mutableStateOf<Int?>(null) }
    var done by remember { mutableStateOf(vm.prefs.str("subs_done", "").split('\n').filter { it.isNotBlank() }.toSet()) }
    val toggle: (String) -> Unit = { id ->
        Haptics.select()
        done = if (id in done) done - id else (done + id).also { Haptics.success() }
        vm.prefs.set("subs_done", done.joinToString("\n"))
    }
    val x = vm.subsX
    Page {
        item {
            ModuleHeader(vm, "Subscription OS", actions = {
                FilledTonalIconButton(onClick = { Haptics.tap(); adding = true }) { Icon(Icons.Filled.Add, "Legg til abonnement") }
            })
        }
        item {
            Row(Modifier.fillMaxWidth().clip(CircleShape).background(C.surface1).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf(Triple("home", "Hjem", Icons.Filled.Home), Triple("ins", "Innsikt", Icons.Filled.BarChart), Triple("hist", "Historikk", Icons.Filled.History)).forEach { (k, n, ic) ->
                    val on = vm.subTab == k
                    Row(Modifier.weight(1f).height(40.dp).clip(CircleShape).background(if (on) C.primary else Color.Transparent).clickable { Haptics.select(); vm.subTab = k },
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                        Icon(ic, null, tint = if (on) C.onPrimary else C.text2, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(n, color = if (on) C.onPrimary else C.text2, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    }
                }
            }
        }
        vm.moduleError?.let { e -> item { Empty(e) } }
        if (x == null) { if (vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) } }; return@Page }
        when (vm.subTab) {
            "ins" -> {
                item { MonthsCard(x, month) { month = it } }
                x.score?.let { sc -> item { HealthCard(x, sc) } }
                item { CategoriesCard(x) }
            }
            "hist" -> {
                item { AgentCard(x, done, toggle) }
                item { ThisMonth(vm, x) }
            }
            else -> {
                item { SavingsCard(vm, x) }
                item { WeekCard(x) }
                val flagged = x.items.filter { it.flagged }
                if (flagged.isNotEmpty()) item {
                    SCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("♛ Abonnementssjekk", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            Text("Gå gjennom før fornyelse", color = C.text2, fontSize = 12.sp)
                        }
                        Text("${flagged.size} abonnement${if (flagged.size == 1) "" else "er"} trenger en titt · spar opptil ${kr0(x.saveMonthly)}/mnd", color = C.text2, fontSize = 13.sp)
                        flagged.forEach { s ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Logo(vm, s.domain, s.name, 0xFFFF7A3D, 34)
                                Column(Modifier.weight(1f)) {
                                    Text(s.name, fontWeight = FontWeight.Medium, maxLines = 1)
                                    Text(if (s.status == "price_up") "▲ Pris økt" else "⚠ Lite brukt", color = if (s.status == "price_up") C.red else C.accentLight, fontSize = 12.sp)
                                }
                                FilledTonalButton(onClick = { Haptics.tap(); vm.setSubItemActive(s, false) }) { Text("Si opp") }
                            }
                        }
                    }
                }
                if (x.upcoming.isNotEmpty()) {
                    item { SectionLabel("Kommende trekk") }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            x.upcoming.forEachIndexed { i, c -> ChargeRow(vm, x, c, i, x.upcoming.size, whenText(c.date)) }
                        }
                    }
                }
                item { SectionLabel("Alle abonnementer · ${x.items.count { it.active }} aktive") }
                if (x.items.isEmpty()) item { Empty("Ingen abonnementer ennå. Trykk + for å legge til.") }
                else item {
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) { x.items.forEachIndexed { i, s -> SubItemRow(vm, s, i, x.items.size) } }
                }
            }
        }
    }
    if (adding) ModalBottomSheet(onDismissRequest = { adding = false }, containerColor = C.surface1) { AddSubSheet(vm) { adding = false } }
}

private fun whenText(date: String): String {
    val d = runCatching { LocalDate.parse(date.take(10)) }.getOrNull() ?: return date
    val n = ChronoUnit.DAYS.between(LocalDate.now(), d)
    return when { n <= 0 -> "I dag"; n == 1L -> "I morgen"; n < 7 -> "Om $n dager · ${ddmm(date)}"; else -> ddmm(date) }
}

@Composable
private fun ChargeRow(vm: AppViewModel, x: SubsX, c: SubCharge, i: Int, n: Int, sub: String, dim: Boolean = false) {
    var edit by remember { mutableStateOf(false) }
    val item = x.item(c.id)
    if (edit && item != null) SubEditSheet(vm, item) { edit = false }
    Row(Modifier.fillMaxWidth().clip(itemShape(i, n)).background(C.surface1).clickable(enabled = item != null) { Haptics.select(); edit = true }.padding(16.dp, 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SubLogo(vm, item, c.name, 36)
        Column(Modifier.weight(1f)) { Text(c.name, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(sub, color = C.text2, fontSize = 12.sp) }
        Text(kr0(c.amount), fontFamily = Mono, fontWeight = FontWeight.SemiBold, color = if (dim) C.text2 else C.text)
    }
}

@Composable
private fun SubItemRow(vm: AppViewModel, s: SubItem, i: Int, n: Int) {
    var menu by remember { mutableStateOf(false) }
    val (pill, pc) = when {
        !s.active -> "Sagt opp" to C.text2
        s.status == "price_up" -> "▲ Pris økt" to C.red
        s.status == "low_use" -> "⚠ Lite brukt" to C.accentLight
        else -> "Aktiv" to C.positive
    }
    if (menu) SubEditSheet(vm, s) { menu = false }
    Box {
        // Trykk åpner redigering (navn, pris, plan, kategori, syklus, faktureringsdato, status og logo).
        Row(Modifier.fillMaxWidth().clip(itemShape(i, n)).background(C.surface1).clickable { Haptics.select(); menu = true }.padding(16.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SubLogo(vm, s, s.name, 36)
            Column(Modifier.weight(1f)) {
                Text(s.name + if (s.plan.isBlank()) "" else " · ${s.plan}", fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(s.cycleName, s.nextDate.takeIf { it.isNotBlank() }?.let { "Neste ${ddmm(it)}" }, s.category).joinToString(" · "), color = C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                AiLine(s.aiShort)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(n0(s.price), fontFamily = Mono, fontWeight = FontWeight.SemiBold)
                Chip(pill, pc.copy(alpha = .15f), pc)
            }
        }
    }
}

@Composable
private fun SavingsCard(vm: AppViewModel, x: SubsX) {
    // I Papir: AI-kortet i mørk gradient (som i Subscription OS-designet), ellers appens tonale farger.
    val bg = if (Tone.paper) Modifier.background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFF1B1A17), Color(0xFF3A2F4A))))
        else Modifier.background(C.heroAi)
    val fg = if (Tone.paper) Color(0xFFF3EFE6) else C.onContainer
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).then(bg).padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("✦ AI-SPARING", color = fg, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        Text(if (x.saveMonthly > 0) "Spar ${kr0(x.saveMonthly)} i måneden" else "Ingen sparetips akkurat nå", color = fg, style = MaterialTheme.typography.titleLarge)
        Text(x.suggestions.firstOrNull()?.text ?: x.healthText.ifBlank { "Alle abonnementene ser ut til å være i bruk." }, color = fg.copy(alpha = .85f), fontSize = 13.sp, maxLines = 3)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${kr0(x.monthly)}/mnd · ${kr0(x.yearly)}/år", color = fg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            if (x.suggestions.isNotEmpty()) Button(onClick = { Haptics.select(); vm.subTab = "hist" }, colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) {
                Text("Gå gjennom ${x.suggestions.size} forslag", fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun WeekCard(x: SubsX) {
    val today = LocalDate.now()
    val days = (0 until 7).map { today.plusDays(it.toLong()) }
    val sums = days.map { d -> x.upcoming.filter { it.date.startsWith(d.toString()) }.sumOf { it.amount } }
    val mx = (sums.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
    SCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Neste 7 dager", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text("${kr0(sums.sum())} · ${x.upcoming.size} trekk", color = C.text2, fontSize = 13.sp)
        }
        Row(Modifier.fillMaxWidth().height(104.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            days.forEachIndexed { i, d ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.Bottom)) {
                    if (sums[i] > 0) Text(n0(sums[i]), fontSize = 9.sp, color = C.text2, maxLines = 1)
                    Box(Modifier.fillMaxWidth().height((6 + sums[i] / mx * 64).dp).clip(RoundedCornerShape(5.dp)).background(if (sums[i] > 0) C.accent else C.surface3))
                    Text(if (i == 0) "I dag" else d.dayOfWeek.getDisplayName(TextStyle.SHORT, nbLocale).replaceFirstChar { it.uppercase() }, fontSize = 10.sp, color = C.text2, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun MonthsCard(x: SubsX, sel0: Int?, onPick: (Int) -> Unit) {
    val cur = LocalDate.now().monthValue - 1
    val months = if (x.byMonth.size == 12) x.byMonth.subList((cur - 5).coerceAtLeast(0), cur + 1) else x.byMonth.takeLast(6)
    val sel = sel0 ?: (months.size - 1)
    val mx = (months.maxOfOrNull { it.total } ?: 0.0).coerceAtLeast(1.0)
    SCard {
        Text("Abonnementer per måned", fontWeight = FontWeight.SemiBold)
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(kr0(x.monthly), style = MaterialTheme.typography.headlineSmall, fontFamily = Mono)
            x.prevMonthly?.takeIf { it > 0 && kotlin.math.abs(x.monthly - it) >= 1 }?.let { p ->
                Text("${if (x.monthly >= p) "▲" else "▼"} ${kr0(kotlin.math.abs(x.monthly - p))} fra forrige måned", color = if (x.monthly > p) C.accentLight else C.positive, fontSize = 12.sp)
            }
        }
        if (months.isNotEmpty()) Row(Modifier.fillMaxWidth().height(126.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            months.forEachIndexed { i, m ->
                val on = i == sel
                Column(Modifier.weight(1f).clickable { Haptics.select(); onPick(i) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.Bottom)) {
                    Text(if (on) n0(m.total) else " ", fontSize = 9.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Box(Modifier.fillMaxWidth().height((6 + m.total / mx * 84).dp).clip(RoundedCornerShape(6.dp)).background(if (on) C.accent else C.surface3))
                    val mi = m.month.takeLast(2).toIntOrNull() ?: 0
                    Text(if (mi in 1..12) MONTHS[mi - 1] else m.month, fontSize = 11.sp, color = if (on) C.text else C.text2)
                }
            }
        }
    }
}

@Composable
private fun HealthCard(x: SubsX, score: Double) {
    val accent = C.accent; val light = C.accentLight; val dark = tc(0xFFC85A26); val off = C.surface3
    SCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Abonnementshelse", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(x.healthLabel, color = C.accentLight, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
        Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.BottomCenter) {
            Canvas(Modifier.fillMaxSize()) {
                val cx = size.width / 2; val cy = size.height - 4f
                val r2 = minOf(size.width / 2, size.height) - 4f; val r1 = r2 * 0.78f
                for (i in 0 until 30) {
                    val a = Math.PI * (1 - i / 29.0)
                    val on = i / 29.0 <= score / 100
                    val c = if (on) (if (i < 10) dark else if (i < 20) accent else light) else off
                    drawLine(c, Offset(cx + r1 * kotlin.math.cos(a).toFloat(), cy - r1 * kotlin.math.sin(a).toFloat()), Offset(cx + r2 * kotlin.math.cos(a).toFloat(), cy - r2 * kotlin.math.sin(a).toFloat()), 4.dp.toPx(), StrokeCap.Round)
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${Math.round(score)}", fontSize = 34.sp, fontWeight = FontWeight.Bold)
                Text("/100", color = C.text2, fontSize = 12.sp)
            }
        }
        Text(x.healthText.ifBlank { x.notes.joinToString(" · ") }, color = C.text2, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun CategoriesCard(x: SubsX) {
    val per = x.items.filter { it.active }.groupBy { it.category }.mapValues { (_, v) -> v.sumOf { it.monthly } }
    val list = per.entries.sortedByDescending { it.value }
    val mx = (list.firstOrNull()?.value ?: 0.0).coerceAtLeast(1.0)
    val order = x.categories.ifEmpty { list.map { it.key } }
    SCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Per kategori", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text("per måned", color = C.text2, fontSize = 12.sp)
        }
        if (list.isEmpty()) Text("Ingen aktive abonnementer.", color = C.text2, fontSize = 13.sp)
        list.forEach { (k, v) ->
            val c = tc(CAT_COLORS[order.indexOf(k).let { if (it < 0) 7 else it } % CAT_COLORS.size])
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Row { Text(k, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1); Text(kr0(v), fontFamily = Mono, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
                Box(Modifier.fillMaxWidth().height(10.dp).clip(CircleShape).background(C.surface3)) {
                    // Stripete linje (diagonale striper) som i designet.
                    Canvas(Modifier.fillMaxHeight().fillMaxWidth((v / mx).toFloat().coerceIn(0.04f, 1f)).clip(CircleShape)) {
                        drawRect(c.copy(alpha = .75f))
                        var xs = -size.height
                        while (xs < size.width) { drawLine(c, Offset(xs, size.height), Offset(xs + size.height, 0f), 3f); xs += 7.dp.toPx() / 2 }
                    }
                }
            }
        }
    }
}

@Composable
private fun AgentCard(x: SubsX, done: Set<String>, toggle: (String) -> Unit) {
    val tasks = x.suggestions
    val n = tasks.count { it.id in done }
    val saved = tasks.filter { it.id in done }.sumOf { it.amount }
    SCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("✦ Smart sparing", fontWeight = FontWeight.SemiBold)
            Chip("AI-agent", C.surface2, C.text)
            Spacer(Modifier.weight(1f))
            Text("⏳ ${tasks.size - n} igjen", color = C.text2, fontSize = 12.sp)
        }
        LinearProgressIndicator(progress = { if (tasks.isEmpty()) 1f else n.toFloat() / tasks.size }, modifier = Modifier.fillMaxWidth().height(6.dp).clip(CircleShape), color = C.primary, trackColor = C.surface3)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Kpi("Spart per måned", kr0(saved), Modifier.weight(1f), fg = if (saved > 0) C.positive else C.text)
            Kpi("Mulig per måned", kr0(x.saveMonthly), Modifier.weight(1f))
        }
        if (tasks.isEmpty()) Text("Ingen forslag. Abonnementene ser ut til å være i bruk.", color = C.text2, fontSize = 13.sp)
        tasks.forEach { t ->
            val on = t.id in done
            Row(Modifier.fillMaxWidth().clickable { toggle(t.id) }.padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(if (on) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked, null, tint = if (on) C.positive else C.text2)
                Column(Modifier.weight(1f)) {
                    Text(t.text, color = if (on) C.text2 else C.text, fontSize = 14.sp, textDecoration = if (on) androidx.compose.ui.text.style.TextDecoration.LineThrough else null)
                    if (t.amount > 0) Text("−${kr0(t.amount)}/mnd", color = C.accentLight, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Text("Status: " + if (tasks.isEmpty()) "Ferdig" else if (n == tasks.size) "Alle forslag er gjennomgått ✓" else "Venter på ${tasks.size - n} forslag", color = C.text2, fontSize = 12.sp)
    }
}

@Composable
private fun ThisMonth(vm: AppViewModel, x: SubsX) {
    val today = LocalDate.now().toString()
    val list = x.thisMonth.ifEmpty {
        x.items.filter { it.active && it.cycle == "monthly" && it.chargeDay != null }.map { s ->
            val d = LocalDate.now().withDayOfMonth(minOf(s.chargeDay ?: 1, LocalDate.now().lengthOfMonth()))
            SubCharge(s.id, s.name, d.toString(), s.price)
        }.sortedBy { it.date }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel("Denne måneden")
            Spacer(Modifier.weight(1f))
            Text(kr0(x.monthTotal ?: list.sumOf { it.amount }), color = C.text2, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp, end = 8.dp))
        }
        if (list.isEmpty()) Empty("Ingen trekk denne måneden.")
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            list.forEachIndexed { i, c -> ChargeRow(vm, x, c, i, list.size, (if (c.date <= today) "Trukket " else "Kommer ") + ddmm(c.date), dim = c.date <= today) }
        }
    }
}

/** «+ Legg til abonnement»: Skriv inn selv · Fra kvittering · Fra transaksjoner. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddSubSheet(vm: AppViewModel, close: () -> Unit) {
    var mode by remember { mutableStateOf<String?>(null) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) { vm.uploadSubReceipt(uri); close() } }
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp, 0.dp, 20.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (mode != null) IconButton(onClick = { mode = null }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Tilbake") }
            Text(when (mode) { "manual" -> "Skriv inn selv"; "receipt" -> "Fra kvittering"; "tx" -> "Fra transaksjoner"; else -> "Legg til abonnement" }, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            TextButton(onClick = close) { Text("Lukk", color = C.primary) }
        }
        when (mode) {
            "manual" -> SubEditForm(vm, null, close, embedded = true)
            "receipt" -> {
                Text("✦ AI leser kvitteringen eller fakturaen, finner tjeneste, beløp, syklus og trekkdag, og lager abonnementet. E-poster i kvitteringsmappen i Proton Mail leses automatisk.", color = C.text2, fontSize = 13.sp)
                Button(onClick = { pick.launch(arrayOf("image/*", "application/pdf")) }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Icon(Icons.Filled.Description, null); Spacer(Modifier.width(8.dp)); Text("Velg bilde eller PDF") }
            }
            "tx" -> {
                val list = vm.subCandidates
                if (list == null) Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }
                else if (list.isEmpty()) Empty("Fant ingen nye faste trekk. Alt ser ut til å være registrert.")
                else list.forEachIndexed { i, c ->
                    Row(Modifier.fillMaxWidth().clip(itemShape(i, list.size)).background(C.surface2).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Logo(vm, c.domain, c.merchant, 0xFFFF7A3D, 36)
                        Column(Modifier.weight(1f)) {
                            Text(c.merchant, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${c.count} trekk · ${if (c.cycle == "yearly") "årlig" else "månedlig"}${if (c.lastDate.isBlank()) "" else " · sist ${ddmm(c.lastDate)}"}", color = C.text2, fontSize = 12.sp)
                        }
                        Text(n0(c.amount), fontFamily = Mono, fontWeight = FontWeight.SemiBold)
                        FilledTonalButton(onClick = { Haptics.tap(); vm.addSubCandidate(c) }, contentPadding = PaddingValues(horizontal = 10.dp)) { Text("+ Legg til") }
                    }
                }
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                MenuRow("Skriv inn selv", "Tjeneste, beløp, syklus og trekkdag", Icons.Filled.Edit, false, 0, 3) { Haptics.select(); mode = "manual" }
                MenuRow("Fra kvittering", "✦ AI leser bilde eller PDF og fyller inn", Icons.Filled.DocumentScanner, false, 1, 3) { Haptics.select(); mode = "receipt" }
                MenuRow("Fra transaksjoner", "✦ Faste trekk sett minst 3 ganger, ikke registrert", Icons.Filled.Autorenew, false, 2, 3) { Haptics.select(); mode = "tx"; vm.loadSubCandidates() }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ManualForm(vm: AppViewModel, close: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var plan by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var day by remember { mutableStateOf("") }
    var cycle by remember { mutableStateOf("monthly") }
    val p = parseAmount(price)
    val colors = TextFieldDefaults.colors(focusedContainerColor = C.surface2, unfocusedContainerColor = C.surface2, focusedIndicatorColor = C.primary, focusedLabelColor = C.primary)
    TextField(name, { name = it }, label = { Text("Tjeneste") }, singleLine = true, colors = colors, modifier = Modifier.fillMaxWidth())
    TextField(plan, { plan = it }, label = { Text("Plan (valgfritt)") }, singleLine = true, colors = colors, modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        TextField(price, { price = it }, label = { Text("Beløp i kr") }, singleLine = true, colors = colors, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
        TextField(day, { day = it.filter(Char::isDigit).take(2) }, label = { Text("Trekkdag") }, singleLine = true, colors = colors, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
    }
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        listOf("monthly" to "Månedlig", "yearly" to "Årlig", "biennial" to "Hvert 2. år").forEachIndexed { i, (k, l) ->
            SegmentedButton(selected = cycle == k, onClick = { cycle = k }, shape = SegmentedButtonDefaults.itemShape(i, 3)) { Text(l, maxLines = 1) }
        }
    }
    p?.let { Text(when (cycle) { "yearly" -> "= ${n0(it / 12)} kr/mnd"; "biennial" -> "= ${n0(it / 24)} kr/mnd"; else -> "= ${n0(it * 12)} kr/år" }, color = C.text2, fontSize = 13.sp) }
    Button(onClick = { Haptics.tap(); vm.addSubManual(name.trim(), plan, price, cycle, day.toIntOrNull()); close() }, enabled = name.isNotBlank() && p != null,
        modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp), colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) {
        Text("Legg til", fontWeight = FontWeight.Bold)
    }
}
