package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.ZoneId

/* ---------------- Aksjer (Trading 212), nytt design: Portefølje · Aksjedetaljer · Transaksjoner ---------------- */

private val RANGES = listOf(Triple("1D", "I dag", 2), Triple("1U", "1 uke", 7), Triple("1M", "1 måned", 31), Triple("3M", "3 måneder", 92), Triple("1Å", "1 år", 366), Triple("Alt", "Alt", Int.MAX_VALUE))
private fun krs(v: Double) = "${neg0(v)} kr"
private fun chg(v: Double) = (if (v < 0) "−" else "+") + pct(kotlin.math.abs(v))
private fun qtyText(q: Double) = if (q == kotlin.math.floor(q)) q.toLong().toString() else String.format(java.util.Locale("nb", "NO"), "%.4f", q).trimEnd('0').trimEnd(',')

/** Dempede flater som følger Material You-temaet (designets «material»-variant). */
private fun tint(i: Int): Color = listOf(C.positiveBg, tc(0xFF3A2F33), C.heroAi, C.surface2, C.container, C.surface3)[((i % 6) + 6) % 6]
private val up get() = C.positive
private val down get() = C.red

/** Område-graf med valgfri markør (trykk eller dra). */
@Composable
internal fun AreaChart(values: List<Double>, color: Color, modifier: Modifier, marker: Boolean = false, label: (Int) -> String = { "" }) {
    var at by remember(values) { mutableStateOf<Int?>(null) }
    val n = values.size
    fun idx(x: Float, w: Float) = ((x / w.coerceAtLeast(1f)) * (n - 1)).let { Math.round(it) }.coerceIn(0, (n - 1).coerceAtLeast(0))
    Box(modifier) {
        Canvas(Modifier.fillMaxSize().then(if (marker && n > 1) Modifier
            .pointerInput(values) { detectTapGestures { o -> at = idx(o.x, size.width.toFloat()); Haptics.select() } }
            .pointerInput(values) { detectHorizontalDragGestures { ch, _ -> val i = idx(ch.position.x, size.width.toFloat()); if (i != at) { at = i; Haptics.select() } } }
        else Modifier)) {
            if (n < 2) return@Canvas
            val mx = values.max(); val mn = values.min()
            val span = (mx - mn).takeIf { it > 0 } ?: 1.0
            fun pt(i: Int) = Offset(size.width * i / (n - 1), size.height - 6f - ((values[i] - mn) / span * (size.height - 16f)).toFloat())
            val line = Path().apply { for (i in 0 until n) { val p = pt(i); if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) } }
            val area = Path().apply { addPath(line); lineTo(size.width, size.height); lineTo(0f, size.height); close() }
            drawPath(area, Brush.verticalGradient(listOf(color.copy(alpha = .32f), color.copy(alpha = 0f))))
            drawPath(line, color, style = Stroke(2.2.dp.toPx(), cap = StrokeCap.Round))
            if (marker) {
                val p = pt(at ?: values.indexOf(mx))
                drawLine(Color.White.copy(alpha = .35f), Offset(p.x, 0f), Offset(p.x, size.height), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f)))
                drawCircle(Color.White, 6.dp.toPx(), p)
                drawCircle(color, 4.dp.toPx(), p)
            }
        }
        if (marker && n > 1) {
            val i = at ?: values.indexOf(values.max())
            Text(label(i), color = C.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.align(Alignment.TopCenter).clip(CircleShape).background(C.primary).padding(8.dp, 3.dp))
        }
    }
}

@Composable
internal fun StocksMobileScreen(vm: AppViewModel) {
    val x = vm.stocksX
    var range by remember { mutableStateOf("1M") }
    when {
        vm.stockScreen == "det" && x != null && x.positions.any { it.ticker == vm.stockSel } -> StockDetail(vm, x, x.positions.indexOfFirst { it.ticker == vm.stockSel }, range) { range = it }
        vm.stockScreen == "tx" && x != null -> StockTxList(vm, x)
        else -> StockOverview(vm, x, range) { range = it }
    }
}

private fun series(all: List<Double>, range: String): List<Double> = all.takeLast((RANGES.firstOrNull { it.first == range }?.third ?: 31).coerceAtMost(all.size))

@Composable
private fun RangePicker(range: String, onPick: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.surface2).padding(3.dp)) {
        RANGES.forEach { (k, _, _) ->
            val on = range == k
            Box(Modifier.weight(1f).height(32.dp).clip(RoundedCornerShape(11.dp)).background(if (on) C.surface3 else Color.Transparent).clickable { Haptics.select(); onPick(k) }, contentAlignment = Alignment.Center) {
                Text(k, color = if (on) C.text else C.text2, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun Segments(list: List<String>, sel: String, onPick: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        list.forEach { n ->
            val on = sel == n
            Box(Modifier.height(36.dp).clip(CircleShape).background(if (on) C.primary else C.surface1).border(1.dp, if (on) Color.Transparent else C.surface3, CircleShape)
                .clickable { Haptics.select(); onPick(n) }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                Text(n, color = if (on) C.onPrimary else C.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun TickerBadge(ini: String, bg: Color, size: Int = 40) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape((size * 0.3f).dp)).background(bg), contentAlignment = Alignment.Center) {
        Text(ini, color = C.text, fontWeight = FontWeight.Bold, fontSize = (size * 0.34f).sp)
    }
}

@Composable
private fun ChangePill(v: Double?) {
    val c = v ?: 0.0
    Text(v?.let(::chg) ?: "–", color = if (v == null) C.text2 else if (c < 0) down else up, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(CircleShape).background(if (v == null) C.surface2 else if (c < 0) down.copy(alpha = .16f) else C.positiveBg).padding(7.dp, 3.dp))
}

/** Kjøp og Selg åpner Trading 212-appen, ellers nettsiden. Ordre-API brukes ikke. */
@Composable
private fun rememberTrade(vm: AppViewModel): (StockPos, Boolean) -> Unit {
    val ctx = LocalContext.current
    val uri = LocalUriHandler.current
    return { p, buy ->
        Haptics.tap()
        vm.message = "Åpner ${if (buy) "kjøp" else "salg"} av ${p.symbol} i Trading 212"
        val app = ctx.packageManager.getLaunchIntentForPackage("com.avuscapital.trading212")
        if (app != null) runCatching { ctx.startActivity(app) } else runCatching { uri.openUri("https://app.trading212.com/") }
    }
}

@Composable
private fun TradeButton(text: String, buy: Boolean, big: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(modifier.height(if (big) 50.dp else 34.dp).clip(CircleShape).background(if (buy) C.primary else C.surface3).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(text, color = if (buy) C.onPrimary else C.text, fontWeight = FontWeight.Bold, fontSize = if (big) 16.sp else 13.sp)
    }
}

@Composable
private fun StockOverview(vm: AppViewModel, x: StocksX?, range: String, onRange: (String) -> Unit) {
    var seg by remember { mutableStateOf("Alle") }
    val trade = rememberTrade(vm)
    Page {
        // Papir: tittelen står i bildeheaderen, og innstillingene for aksjer ligger under Innstillinger.
        if (!vm.paper) item { ModuleHeader(vm, "Aksjer", actions = { IconButton(onClick = { vm.syncStocks() }) { Icon(Icons.Filled.Sync, "Synk nå", tint = C.primary) } }) }
        if (x != null && !vm.paper) item {
            val ok = x.error.isBlank() && (x.configured || x.mock)
            val whenText = x.syncedAt?.let { fmtTime(it, if (it.atZone(ZoneId.systemDefault()).toLocalDate() == LocalDate.now()) "HH:mm" else "dd.MM HH:mm") }
            Row(Modifier.fillMaxWidth().clickable { vm.settingsPage = "stocks"; vm.open(Screen.Settings); vm.settingsPage = "stocks" }.padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(if (ok) up else down))
                Text(listOfNotNull("Trading 212", if (x.error.isNotBlank()) x.error else if (x.mock) "Demodata" else if (x.configured) "Synkronisert" else "Ikke koblet til", whenText).joinToString(" · "),
                    color = C.text2, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text("Innstillinger ›", color = C.primary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        vm.moduleError?.let { e -> item { Empty(e) } }
        if (x == null) { if (vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) } }; return@Page }
        if (!x.configured && !x.mock && x.positions.isEmpty()) item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Ikke satt opp · Sett opp under Integrasjoner", fontWeight = FontWeight.SemiBold)
                Text("Legg inn din egen API-nøkkel og secret under Innstillinger → Integrasjoner → Trading 212. Gi bare lesetilgang.", color = C.text2, fontSize = 13.sp)
            }
        }
        item {
            val hist = series(x.history, range)
            val day = x.dayChange
            val base = x.value - day
            val ch: Double? = if (range == "1D" && x.hasDay) (if (base > 0) day / base * 100 else null) else if (hist.size > 1 && hist[0] > 0) (hist.last() - hist[0]) / hist[0] * 100 else null
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(C.surface1).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Verdi i dag", color = C.text2, modifier = Modifier.weight(1f))
                    Chip(if (x.mock || x.env.equals("demo", true)) "Demo" else "Live", C.surface2, C.text)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    FitText(krs(x.total), C.text, 32.sp, FontWeight.SemiBold, Modifier.weight(1f, fill = false), family = Mono)
                    ch?.let { c -> Text("${chg(c)} ${if (range == "1D") "i dag" else RANGES.first { it.first == range }.second.lowercase()}", color = if (c < 0) down else up, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(CircleShape).background(if (c < 0) down.copy(alpha = .16f) else C.positiveBg).padding(8.dp, 4.dp)) }
                }
                if (hist.size > 1) AreaChart(hist, if (hist.last() >= hist.first()) up else down, Modifier.fillMaxWidth().height(130.dp))
                RangePicker(range, onRange)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    listOf(Triple("Avkastning", (if (x.result < 0) "−" else "+") + krs(kotlin.math.abs(x.result)), if (x.result < 0) down else up), Triple("Investert", krs(x.invested), C.text), Triple("Kontanter", krs(x.cash), C.text))
                        // Hele tallet vises: teksten krymper i stedet for å kuttes.
                        .forEach { (l, v, c) -> Column(Modifier.weight(1f)) { Text(l, color = C.text2, fontSize = 11.sp, maxLines = 1); FitText(v, c, 13.sp, FontWeight.SemiBold) } }
                }
            }
        }
        item { Segments(listOf("Alle", "Aksjer", "ETF", "Kontanter"), seg) { seg = it } }
        val vis = if (seg == "Kontanter") emptyList() else x.positions.filter { seg == "Alle" || (seg == "ETF") == it.etf }
        val idx = x.positions.mapIndexed { i, p -> p.ticker to i }.toMap()
        if (vis.isNotEmpty()) {
            item {
                Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Største posisjoner", fontWeight = FontWeight.SemiBold, fontSize = 17.sp, modifier = Modifier.weight(1f))
                    Text("${x.positions.size} totalt", color = C.text2, fontSize = 13.sp)
                }
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    vis.sortedByDescending { it.value }.take(3).forEach { p ->
                        Column(Modifier.width(200.dp).clip(RoundedCornerShape(24.dp)).background(tint(idx[p.ticker] ?: 0)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Column(Modifier.clickable { openStock(vm, p) }, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    TickerBadge(p.ini, Color.Black.copy(alpha = .22f), 36)
                                    Column { Text(p.symbol, fontWeight = FontWeight.Bold, maxLines = 1); Text(p.name, color = C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                                }
                                Text(krs(p.value), fontSize = 20.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                Row(verticalAlignment = Alignment.CenterVertically) { Text("${qtyText(p.qty)} stk", color = C.text2, fontSize = 12.sp, modifier = Modifier.weight(1f)); ChangePill(p.dayPct ?: p.plPct) }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                TradeButton("Kjøp", true, modifier = Modifier.weight(1f)) { trade(p, true) }
                                TradeButton("Selg", false, modifier = Modifier.weight(1f)) { trade(p, false) }
                            }
                        }
                    }
                }
            }
            item {
                Row(Modifier.padding(horizontal = 4.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Alle posisjoner", fontWeight = FontWeight.SemiBold, fontSize = 17.sp, modifier = Modifier.weight(1f))
                    TextButton(onClick = { Haptics.select(); vm.stockScreen = "tx" }) { Text("Transaksjoner ›", color = C.primary) }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    vis.forEachIndexed { i, p ->
                        Row(Modifier.fillMaxWidth().clip(itemShape(i, vis.size)).background(C.surface1).clickable { openStock(vm, p) }.padding(14.dp, 11.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            TickerBadge(p.ini, tint(idx[p.ticker] ?: 0))
                            Column(Modifier.weight(1f)) { Text(p.symbol, fontWeight = FontWeight.SemiBold, maxLines = 1); Text(p.name, color = C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                            if (p.series.size > 1) AreaChart(p.series.takeLast(18), if (p.series.last() >= p.series.first()) up else down, Modifier.width(64.dp).height(28.dp))
                            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(krs(p.value), fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                                ChangePill(p.dayPct ?: p.plPct)
                            }
                        }
                    }
                }
            }
        } else if (seg != "Kontanter" && x.positions.isEmpty()) item { Empty("Ingen posisjoner ennå.") }
        if (seg == "Alle" || seg == "Kontanter") item {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(C.surface1).padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(C.surface2), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Payments, null, tint = C.primary) }
                Text("Kontanter", fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                Text(krs(x.cash), fontFamily = Mono, fontWeight = FontWeight.SemiBold)
            }
        }
        if (seg == "Kontanter" || vis.isEmpty()) item { TextButton(onClick = { vm.stockScreen = "tx" }) { Text("Transaksjoner ›", color = C.primary) } }
        item { Text("Kjøp og Selg åpner ordren i Trading 212. Tallene synkes fra API-et. Nøkkel og miljø endres i Innstillinger.", color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 6.dp)) }
    }
}

private fun openStock(vm: AppViewModel, p: StockPos) {
    Haptics.select()
    vm.stockFrom = if (vm.stockScreen == "tx") "tx" else null
    vm.stockSel = p.ticker
    vm.stockScreen = "det"
}

@Composable
private fun StockDetail(vm: AppViewModel, x: StocksX, i: Int, range: String, onRange: (String) -> Unit) {
    val p = x.positions[i]
    val s = series(p.series, range)
    val ch = if (s.size > 1 && s[0] > 0) (s.last() - s[0]) / s[0] * 100 else if (range == "1D") p.dayPct else p.plPct
    val tx = x.txns.filter { it.ticker == p.ticker || it.symbol == p.symbol }
    val trade = rememberTrade(vm)
    Box(Modifier.fillMaxSize()) {
        Page {
            item { ModuleHeader(vm, "Aksjedetaljer", back = { vm.back() }) }
            item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    TickerBadge(p.ini, tint(i), 48)
                    Column(Modifier.weight(1f)) { Text(p.symbol, fontWeight = FontWeight.SemiBold, fontSize = 17.sp); Text(p.name, color = C.text2, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    Text(RANGES.first { it.first == range }.second, color = C.text2, fontSize = 12.sp)
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("${n2(p.price)} kr", fontSize = 30.sp, fontWeight = FontWeight.SemiBold, fontFamily = Mono, maxLines = 1)
                    ChangePill(ch)
                }
            }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (s.size > 1) AreaChart(s, if (s.last() >= s.first()) up else down, Modifier.fillMaxWidth().height(170.dp), marker = true) { "${n2(s[it])} kr" }
                    else {
                        Text("Snittkurs ${n2(p.avg)} → kurs nå ${n2(p.price)} (${chg(p.plPct)})", fontSize = 13.sp)
                        LinearProgressIndicator(progress = { if (p.avg > 0) (p.price / (p.avg * 2)).toFloat().coerceIn(0f, 1f) else 0f }, modifier = Modifier.fillMaxWidth(), color = if (p.plPct < 0) down else up, trackColor = C.surface3)
                        Text("Kursgraf vises når serveren sender kurshistorikk for aksjen.", color = C.text2, fontSize = 12.sp)
                    }
                    RangePicker(range, onRange)
                }
            }
            item { Text("Min posisjon", fontWeight = FontWeight.SemiBold, fontSize = 17.sp, modifier = Modifier.padding(horizontal = 4.dp)) }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Kpi("Antall", "${qtyText(p.qty)} stk", Modifier.weight(1f), RoundedCornerShape(28.dp, 8.dp, 8.dp, 8.dp))
                        Kpi("Verdi", krs(p.value), Modifier.weight(1f), RoundedCornerShape(8.dp, 28.dp, 8.dp, 8.dp))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Kpi("Snittkurs", "${n2(p.avg)} kr", Modifier.weight(1f), RoundedCornerShape(8.dp, 8.dp, 8.dp, 28.dp))
                        Kpi("Avkastning", chg(p.plPct), Modifier.weight(1f), RoundedCornerShape(8.dp, 8.dp, 28.dp, 8.dp), fg = if (p.plPct < 0) down else up)
                    }
                }
            }
            item { Text("Handler i ${p.symbol}", fontWeight = FontWeight.SemiBold, fontSize = 17.sp, modifier = Modifier.padding(horizontal = 4.dp)) }
            if (tx.isEmpty()) item { Text("Ingen handler ennå.", color = C.text2, modifier = Modifier.padding(horizontal = 8.dp)) }
            else item {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    tx.forEachIndexed { j, t ->
                        Row(Modifier.fillMaxWidth().clip(itemShape(j, tx.size)).background(C.surface1).padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(t.kind + if (t.qty > 0) " · ${qtyText(t.qty)} stk" else "", fontWeight = FontWeight.Medium)
                                Text(ddmmyyyy(t.date) + if (t.time.isBlank()) "" else " kl. ${t.time}", color = C.text2, fontSize = 12.sp)
                            }
                            Text(krs(t.amount), fontWeight = FontWeight.SemiBold, fontFamily = Mono)
                        }
                    }
                }
            }
        }
        Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(16.dp, 10.dp).clip(RoundedCornerShape(30.dp)).background(C.surface2).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TradeButton("Selg", false, big = true, modifier = Modifier.weight(1f)) { trade(p, false) }
            TradeButton("Kjøp", true, big = true, modifier = Modifier.weight(1f)) { trade(p, true) }
        }
    }
}

private fun dayName(d: String): String {
    val date = runCatching { LocalDate.parse(d) }.getOrNull() ?: return d.ifBlank { "Uten dato" }
    return when (date) { LocalDate.now() -> "I dag"; LocalDate.now().minusDays(1) -> "I går"; else -> ddmmyyyy(d) }
}

@Composable
private fun StockTxList(vm: AppViewModel, x: StocksX) {
    var q by remember { mutableStateOf("") }
    var tseg by remember { mutableStateOf("Alle") }
    val names = x.positions.associate { it.ticker to it.name }
    val idx = x.positions.mapIndexed { i, p -> p.ticker to i }.toMap()
    val ql = q.trim().lowercase()
    val list = x.txns.filter { t -> (tseg == "Alle" || t.kind == tseg) && (ql.isEmpty() || "${t.symbol} ${names[t.ticker] ?: ""} ${t.kind}".lowercase().contains(ql)) }
    val days = list.map { it.date }.distinct()
    Page {
        item { ModuleHeader(vm, "Transaksjoner", back = { vm.back() }) }
        item {
            TextField(q, { q = it }, placeholder = { Text("Søk i ticker, navn eller type") }, leadingIcon = { Icon(Icons.Filled.Search, null, tint = C.text2) }, singleLine = true,
                shape = RoundedCornerShape(28.dp), modifier = Modifier.fillMaxWidth(),
                colors = TextFieldDefaults.colors(focusedContainerColor = C.surface2, unfocusedContainerColor = C.surface2, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
        }
        item { Segments(listOf("Alle", "Kjøp", "Salg", "Utbytte"), tseg) { tseg = it } }
        if (list.isEmpty()) item { Empty("Ingen transaksjoner passer.") }
        days.forEach { d ->
            item { Text(dayName(d), color = C.text2, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp, top = 4.dp)) }
            item {
                val rows = list.filter { it.date == d }
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    rows.forEachIndexed { j, t ->
                        val pos = x.positions.firstOrNull { it.ticker == t.ticker }
                        val (bg, fg) = when (t.status) { "Utført" -> C.positiveBg to up; "Venter" -> C.surface3 to C.onContainer; else -> down.copy(alpha = .16f) to down }
                        Row(Modifier.fillMaxWidth().clip(itemShape(j, rows.size)).background(C.surface1).clickable(enabled = pos != null) { pos?.let { openStock(vm, it) } }.padding(14.dp, 11.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            TickerBadge(t.symbol.take(2).uppercase(), tint(idx[t.ticker] ?: 5))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(t.symbol, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                    Text(t.status, color = fg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clip(CircleShape).background(bg).padding(6.dp, 2.dp))
                                }
                                Text(listOf(names[t.ticker] ?: "", t.kind + if (t.qty > 0) " · ${qtyText(t.qty)} stk" else "").filter { it.isNotBlank() }.joinToString(" · "), color = C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text((if (t.kind == "Kjøp") "−" else "+") + krs(t.amount), fontWeight = FontWeight.SemiBold, fontFamily = Mono, color = if (t.kind == "Kjøp") C.text else up)
                                if (t.time.isNotBlank()) Text(t.time, color = C.text2, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
