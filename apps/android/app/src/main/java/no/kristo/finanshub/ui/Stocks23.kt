package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.StockPos
import no.kristo.finanshub.StocksX
import no.kristo.finanshub.fmtTime
import java.util.Locale

/*
 * Prompt 23: Aksjer i Papir, nøyaktig etter «Aksjer Mobil» (theme=papir, hide-head) slik «Mobil Papir App» viser siden:
 * verdikort (Live, verdi i Plex Mono, dagsendring, graf og periodevelger), synk-linje, 2×2 nøkkelkort, filter-piller,
 * «Største posisjoner» (vannrett karusell med Kjøp/Selg), «Alle posisjoner» med sparkline og «Transaksjoner ›»,
 * Kontanter, Fordeling, Utbytte og Siste ordre. Ingen skanneknapp (se noScanHere). Første kort ligger 23 dp opp i toppbildet.
 * Aksjedetaljer og Transaksjoner bruker fortsatt skjermene i Stocks11.kt.
 */

private val nbLocale = Locale("nb", "NO")
private val ST_RANGES = listOf("1D" to 2, "1U" to 7, "1M" to 31, "3M" to 92, "1Å" to 366, "Alt" to Int.MAX_VALUE)
/** Posisjonsfargene i designet (WPOS), brukt i Fordeling og som 30 % tone over kortfargen. */
private val ST_COLS = listOf(Color(0xFF5FD3A8), Color(0xFF9FE3C6), Color(0xFF7AA7FF), Color(0xFFB79CFF), Color(0xFFFFB08A), Color(0xFFF2C14E))

private fun nf(v: Double) = if (Privacy.hidden) "•••" else String.format(nbLocale, "%,.0f", v).replace(',', ' ').replace(' ', ' ')
private fun nf2(v: Double) = if (Privacy.hidden) "•••" else java.text.NumberFormat.getNumberInstance(nbLocale).apply { minimumFractionDigits = 2; maximumFractionDigits = 2 }.format(v).replace(' ', ' ')
private fun sg(v: Double) = (if (v >= 0) "+" else "−") + nf2(kotlin.math.abs(v))
private fun qty(q: Double) = (if (q == kotlin.math.floor(q)) q.toLong().toString() else String.format(nbLocale, "%.4f", q).trimEnd('0').trimEnd(','))

@Composable
internal fun PaperStocks23(vm: AppViewModel, navBottom: Dp) {
    val p = PaperPal.current
    val x = vm.stocksX
    var range by rememberSaveable { mutableStateOf("1D") }
    var seg by rememberSaveable { mutableStateOf("Alle") }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(10.dp, 0.dp, 10.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        vm.moduleError?.let { e -> item { StCard(Modifier.padding(horizontal = 16.dp)) { Text(e, color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(16.dp)) } } }
        if (x == null) {
            if (vm.moduleError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            return@LazyColumn
        }
        stocksBody(vm, x, range, { range = it }, seg, { seg = it })
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.stocksBody(
    vm: AppViewModel, x: StocksX, range: String, onRange: (String) -> Unit, seg: String, onSeg: (String) -> Unit,
) {
    val inv = x.positions.sumOf { it.value }
    val cost = x.positions.sumOf { it.qty * it.avg }.takeIf { it > 0 } ?: x.invested
    val pl = inv - cost
    val day = x.dayChange
    val dayPct = if (inv - day > 0) day / (inv - day) * 100 else 0.0
    val vis = if (seg == "Kontanter") emptyList() else x.positions.filter { seg == "Alle" || (seg == "ETF") == it.etf }
    val idx = x.positions.mapIndexed { i, ps -> ps.ticker to i }.toMap()
    val live = !(x.mock || x.env.equals("demo", true))
    val syncAt = fmtTime(x.syncedAt, "HH:mm").ifBlank { "–" }

    // Verdikort
    item {
        val p = PaperPal.current
        val n = (ST_RANGES.firstOrNull { it.first == range }?.second ?: 2).coerceAtMost(x.history.size)
        val hist = x.history.takeLast(n)
        val up = day >= 0
        StCard(Modifier.padding(horizontal = 16.dp), radius = 26.dp) {
            Column(Modifier.padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Verdi i dag", color = p.mut, fontSize = 13.5.sp, fontFamily = PaperFonts.sans, modifier = Modifier.weight(1f))
                    Text(if (live) "Live" else "Demo", color = p.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
                        modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(p.ink).padding(horizontal = 10.dp, vertical = 4.dp))
                }
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("${nf(x.total)} kr", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 34.sp, letterSpacing = (-1).sp, maxLines = 1,
                        modifier = Modifier.weight(1f, fill = false))
                    ChangeChip("${sg(dayPct)} % i dag", up, Modifier.padding(bottom = 6.dp), big = true)
                }
                if (hist.size > 1) StLine(hist, p.pos, Modifier.fillMaxWidth().height(130.dp), area = true)
                else Spacer(Modifier.height(130.dp))
                Seg23(ST_RANGES.map { it.first }, range, onRange)
            }
        }
    }
    // Synk-linje
    item {
        val p = PaperPal.current
        Row(
            Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp))
                .clickable(onClickLabel = "Synk nå") { Haptics.tap(); vm.syncStocks() }.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.size(9.dp).clip(CircleShape).background(if (x.error.isBlank() && (x.configured || x.mock)) p.pos else p.lab))
            Text(
                if (x.error.isNotBlank()) x.error else "${if (live) "Live-konto" else "Demo-konto (paper trading)"} · synket i dag kl. $syncAt · lesetilgang",
                color = p.mut, fontSize = 13.sp, lineHeight = 17.sp, fontFamily = PaperFonts.sans, modifier = Modifier.weight(1f),
            )
            Text(if (vm.busy) "Synker …" else "↻ $syncAt", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, fontFamily = PaperFonts.sans)
        }
    }
    // 2×2 nøkkelkort
    item {
        val p = PaperPal.current
        val kpi = listOf(
            Triple("Porteføljeverdi", "${nf2(x.total)} kr", "Investert ${nf(inv)} kr + kontanter") to p.ink,
            Triple("Avkastning totalt", "${sg(pl)} kr", "${sg(if (cost > 0) pl / cost * 100 else 0.0)} % på ${nf(cost)} kr") to (if (pl >= 0) p.pos else p.lab),
            Triple("I dag", "${sg(day)} kr", "${sg(dayPct)} %") to (if (day >= 0) p.pos else p.lab),
            Triple("Ledig kontanter", "${nf2(x.cash)} kr", "Klar til investering") to p.ink,
        )
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            kpi.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { (t, c) ->
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(t.first, color = p.mut, fontSize = 12.5.sp, fontFamily = PaperFonts.sans, maxLines = 1)
                            Text(t.second, color = c, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, letterSpacing = (-.3).sp)
                            Text(t.third, color = p.mut, fontSize = 11.5.sp, lineHeight = 15.sp, fontFamily = PaperFonts.sans)
                        }
                    }
                }
            }
        }
    }
    // Filter-piller
    item {
        val p = PaperPal.current
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Alle", "Aksjer", "ETF", "Kontanter").forEach { n ->
                val on = seg == n
                Box(
                    Modifier.height(40.dp).clip(RoundedCornerShape(20.dp)).background(if (on) p.ink else p.card).border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(20.dp))
                        .clickable { Haptics.select(); onSeg(n) }.padding(horizontal = 18.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(n, color = if (on) p.bg else p.ink, fontSize = 14.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans) }
            }
        }
    }
    if (vis.isNotEmpty()) {
        item { StTitle("Største posisjoner", "${x.positions.size} totalt") }
        item {
            val trade = rememberTrade23(vm)
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                vis.sortedByDescending { it.value }.take(3).forEach { ps -> TopCard(vm, ps, idx[ps.ticker] ?: 0, trade) }
            }
        }
        item {
            val p = PaperPal.current
            Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                Text("Alle posisjoner", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, fontFamily = PaperFonts.sans, modifier = Modifier.weight(1f))
                Text("Transaksjoner ›", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, fontFamily = PaperFonts.sans,
                    modifier = Modifier.clickable { Haptics.select(); vm.stockScreen = "tx" })
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                vis.forEach { ps -> PosRow(vm, ps, idx[ps.ticker] ?: 0) }
            }
        }
    }
    if (seg == "Alle" || seg == "Kontanter") item {
        val p = PaperPal.current
        Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Kontanter", color = p.mut, fontSize = 14.sp, fontFamily = PaperFonts.sans, modifier = Modifier.weight(1f))
            Text("${nf(x.cash)} kr", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
    }
    // Fordeling
    if (x.positions.isNotEmpty() && inv > 0) {
        item { StTitle("Fordeling", null) }
        item {
            val p = PaperPal.current
            val alloc = x.positions.sortedByDescending { it.value }
            StCard(Modifier.padding(horizontal = 16.dp), radius = 22.dp) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(Modifier.fillMaxWidth().height(14.dp).clip(RoundedCornerShape(7.dp)), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        alloc.forEach { ps ->
                            Box(Modifier.weight(ps.value.coerceAtLeast(inv * .01).toFloat()).fillMaxSize().background(ST_COLS[(idx[ps.ticker] ?: 0) % ST_COLS.size]))
                        }
                    }
                    alloc.chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            row.forEach { ps ->
                                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(ST_COLS[(idx[ps.ticker] ?: 0) % ST_COLS.size]))
                                    Text(ps.symbol, color = p.ink, fontSize = 13.sp, fontFamily = PaperFonts.sans, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                    Text(String.format(nbLocale, "%.1f %%", ps.value / inv * 100), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
                                }
                            }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
    // Utbytte
    val divs = x.txns.filter { it.kind == "Utbytte" }.take(5)
    if (divs.isNotEmpty()) {
        item { StTitle("Utbytte", "${nf2(x.txns.filter { it.kind == "Utbytte" && it.date.startsWith(java.time.LocalDate.now().year.toString()) }.sumOf { it.amount })} kr i år") }
        item {
            val p = PaperPal.current
            StCard(Modifier.padding(horizontal = 16.dp)) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                    divs.forEachIndexed { j, d ->
                        if (j > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                        Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Ini(d.symbol.take(2).uppercase(), tint23(idx[d.ticker] ?: 0), 34.dp, 11.5f)
                            Column(Modifier.weight(1f)) {
                                Text(d.symbol, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, fontFamily = PaperFonts.sans)
                                Text(ddmmyyyy(d.date), color = p.mut, fontSize = 12.sp, fontFamily = PaperFonts.sans)
                            }
                            Text("+${nf2(d.amount)} kr", color = p.pos, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                    }
                }
            }
        }
    }
    // Siste ordre
    val orders = x.txns.filter { it.kind == "Kjøp" || it.kind == "Salg" }.take(4)
    if (orders.isNotEmpty()) {
        item {
            val p = PaperPal.current
            Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                Text("Siste ordre", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, fontFamily = PaperFonts.sans, modifier = Modifier.weight(1f))
                Text("Alle ›", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, fontFamily = PaperFonts.sans, modifier = Modifier.clickable { Haptics.select(); vm.stockScreen = "tx" })
            }
        }
        item {
            val p = PaperPal.current
            StCard(Modifier.padding(horizontal = 16.dp)) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                    orders.forEachIndexed { j, o ->
                        if (j > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                        val buy = o.kind == "Kjøp"
                        Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(o.kind, color = if (buy) p.pos else p.lab, fontWeight = FontWeight.Bold, fontSize = 12.sp, fontFamily = PaperFonts.sans,
                                modifier = Modifier.clip(RoundedCornerShape(9.dp)).background((if (buy) p.pos else p.lab).copy(alpha = if (buy) .14f else .12f)).padding(horizontal = 9.dp, vertical = 4.dp))
                            Column(Modifier.weight(1f)) {
                                Text("${o.symbol} · ${qty(o.qty)} stk", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, fontFamily = PaperFonts.sans, maxLines = 1)
                                Text(ddmmyyyy(o.date), color = p.mut, fontSize = 12.sp, fontFamily = PaperFonts.sans)
                            }
                            Text("${nf2(o.amount)} kr", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                    }
                }
            }
        }
    }
    item {
        Text("Kjøp og Selg åpner ordren i Trading 212. Tallene synkes fra API-et. Nøkkel og miljø endres i Innstillinger.",
            color = PaperPal.current.mut, fontSize = 12.5.sp, lineHeight = 18.sp, fontFamily = PaperFonts.sans, modifier = Modifier.padding(horizontal = 20.dp))
    }
}

/** 30 % av posisjonsfargen over kortfargen (color-mix(in oklab, farge 30 %, card)). */
@Composable
private fun tint23(i: Int): Color = lerp(PaperPal.current.card, ST_COLS[((i % ST_COLS.size) + ST_COLS.size) % ST_COLS.size], .3f)

@Composable
private fun StCard(modifier: Modifier = Modifier, radius: Dp = 20.dp, content: @Composable () -> Unit) {
    Box(modifier.fillMaxWidth().clip(RoundedCornerShape(radius)).background(PaperPal.current.card)) { content() }
}

@Composable
private fun StTitle(title: String, right: String?) {
    val p = PaperPal.current
    Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, fontFamily = PaperFonts.sans, modifier = Modifier.weight(1f))
        right?.let { Text(it, color = p.mut, fontSize = 13.sp, fontFamily = PaperFonts.sans) }
    }
}

@Composable
private fun ChangeChip(text: String, up: Boolean, modifier: Modifier = Modifier, big: Boolean = false, bg: Color? = null) {
    val p = PaperPal.current
    val c = if (up) p.pos else p.lab
    Text(text, color = c, fontWeight = FontWeight.SemiBold, fontSize = if (big) 12.5.sp else 11.5.sp, fontFamily = PaperFonts.sans, maxLines = 1,
        modifier = modifier.clip(RoundedCornerShape(if (big) 10.dp else 8.dp)).background(bg ?: c.copy(alpha = if (up) .14f else .12f))
            .padding(horizontal = if (big) 9.dp else 7.dp, vertical = if (big) 4.dp else 2.dp))
}

@Composable
private fun Ini(text: String, bg: Color, size: Dp, font: Float) {
    Box(Modifier.size(size).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        Text(text, color = PaperPal.current.ink, fontWeight = FontWeight.Bold, fontSize = font.sp, fontFamily = PaperFonts.sans)
    }
}

/** Periodevelgeren: 4 dp innvendig på papirfargen, valgt knapp i kortfargen med liten skygge. */
@Composable
private fun Seg23(list: List<String>, sel: String, onPick: (String) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.bg).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        list.forEach { n ->
            val on = sel == n
            Box(
                Modifier.weight(1f).height(32.dp).then(if (on) Modifier.shadow(1.5.dp, RoundedCornerShape(10.dp)) else Modifier).clip(RoundedCornerShape(10.dp))
                    .background(if (on) p.card else Color.Transparent).clickable { Haptics.select(); onPick(n) },
                contentAlignment = Alignment.Center,
            ) { Text(n, color = if (on) p.ink else p.mut, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, fontFamily = PaperFonts.sans, maxLines = 1) }
        }
    }
}

/** Linje (og område) som i designet: 2,2 dp strek, områdegradient 40 % → 0. */
@Composable
private fun StLine(values: List<Double>, color: Color, modifier: Modifier, area: Boolean = false, stroke: Float = 2.2f) {
    Canvas(modifier) {
        val n = values.size
        if (n < 2) return@Canvas
        val mx = values.max(); val mn = values.min()
        val span = (mx - mn).takeIf { it > 0 } ?: 1.0
        val pad = if (area) 6f * density else 2f * density
        fun pt(i: Int) = Offset(size.width * i / (n - 1), (size.height - pad - ((values[i] - mn) / span * (size.height - pad * 2.6f)).toFloat()))
        val line = Path().apply { for (i in 0 until n) { val q = pt(i); if (i == 0) moveTo(q.x, q.y) else lineTo(q.x, q.y) } }
        if (area) {
            val fill = Path().apply { addPath(line); lineTo(size.width, size.height); lineTo(0f, size.height); close() }
            drawPath(fill, Brush.verticalGradient(listOf(color.copy(alpha = .4f), color.copy(alpha = 0f))))
        }
        drawPath(line, color, style = Stroke(stroke.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

/** Kjøp og Selg åpner Trading 212-appen (ellers nettsiden). Ordre-API brukes ikke. */
@Composable
private fun rememberTrade23(vm: AppViewModel): (StockPos, Boolean) -> Unit {
    val ctx = LocalContext.current
    val uri = LocalUriHandler.current
    return { ps, buy ->
        Haptics.tap()
        vm.message = "Åpner ${if (buy) "kjøp" else "salg"} av ${ps.symbol} i Trading 212"
        val app = ctx.packageManager.getLaunchIntentForPackage("com.avuscapital.trading212")
        if (app != null) runCatching { ctx.startActivity(app) } else runCatching { uri.openUri("https://app.trading212.com/") }
    }
}

private fun openStock23(vm: AppViewModel, ps: StockPos) {
    Haptics.select()
    vm.stockFrom = null
    vm.stockSel = ps.ticker
    vm.stockScreen = "det"
}

@Composable
private fun TopCard(vm: AppViewModel, ps: StockPos, i: Int, trade: (StockPos, Boolean) -> Unit) {
    val p = PaperPal.current
    val ch = ps.dayPct ?: ps.plPct
    val up = ch >= 0
    Box(Modifier.width(200.dp).clip(RoundedCornerShape(24.dp)).background(tint23(i))) {
        Box(Modifier.align(Alignment.TopEnd).offset(x = 26.dp, y = (-26).dp).size(90.dp).clip(CircleShape).background(Color(0x1A7F7F7F)))
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.clickable { openStock23(vm, ps) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Ini(ps.ini, p.card, 36.dp, 13f)
                Column {
                    Text(ps.symbol, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, fontFamily = PaperFonts.sans, maxLines = 1)
                    Text(ps.name, color = p.mut, fontSize = 12.sp, fontFamily = PaperFonts.sans, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Column(Modifier.clickable { openStock23(vm, ps) }) {
                Text("${nf(ps.value)} kr", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, maxLines = 1)
                Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${qty(ps.qty)} stk", color = p.mut, fontSize = 12.sp, fontFamily = PaperFonts.sans)
                    ChangeChip("${sg(ch)} %", up, bg = p.bg)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.5.dp, p.ink, RoundedCornerShape(18.dp)).clickable { trade(ps, true) }, contentAlignment = Alignment.Center) {
                    Text("Kjøp", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, fontFamily = PaperFonts.sans)
                }
                Box(Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(18.dp)).background(p.ink).clickable { trade(ps, false) }, contentAlignment = Alignment.Center) {
                    Text("Selg", color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, fontFamily = PaperFonts.sans)
                }
            }
        }
    }
}

@Composable
private fun PosRow(vm: AppViewModel, ps: StockPos, i: Int) {
    val p = PaperPal.current
    val ch = ps.dayPct ?: ps.plPct
    val up = ch >= 0
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).clickable { openStock23(vm, ps) }.padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Ini(ps.ini, tint23(i), 40.dp, 13f)
        Column(Modifier.weight(1f)) {
            Text(ps.symbol, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, fontFamily = PaperFonts.sans, maxLines = 1)
            Text(ps.name, color = p.mut, fontSize = 12.5.sp, fontFamily = PaperFonts.sans, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (ps.series.size > 1) StLine(ps.series.takeLast(18), if (up) p.pos else p.lab, Modifier.width(64.dp).height(26.dp), stroke = 1.8f)
        Column(horizontalAlignment = Alignment.End) {
            Text("${nf(ps.value)} kr", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1)
            ChangeChip("${sg(ch)} %", up, Modifier.padding(top = 3.dp))
        }
    }
}
