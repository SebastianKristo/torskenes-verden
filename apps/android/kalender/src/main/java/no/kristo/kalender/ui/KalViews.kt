package no.kristo.kalender.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.kalender.KEv
import no.kristo.kalender.KWx
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.MN
import no.kristo.kalender.Red
import no.kristo.kalender.WD
import no.kristo.kalender.WL
import no.kristo.kalender.WS
import no.kristo.kalender.byDay
import no.kristo.kalender.cap
import no.kristo.kalender.daySummary
import no.kristo.kalender.hm
import no.kristo.kalender.isoW
import no.kristo.kalender.jsDay
import no.kristo.kalender.mon
import no.kristo.kalender.nowMin
import no.kristo.kalender.today
import java.time.LocalDate

/* Prompt 33: visningene (fasit: Kalender App.dc.html → isMnd, isGrid, isAr, isListe, so). */

private fun KalVm.wxOf(d: LocalDate): KWx? = if (swx) data.wx[d] else null

/** Chip i måned / heldag: kalenderfarge med 22 (frist 38) i alfa, tekst i tx / lt. */
@Composable
private fun EvChip(vm: KalVm, e: KEv, fs: Float, onClick: (() -> Unit)? = null) {
    val k = LocalK.current
    val c = vm.cal(e.cal)
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)).background(c.col.copy(alpha = if (e.kind == "frist") .22f else .133f))
            .then(if (onClick != null) Modifier.tap(e.t, onClick = onClick) else Modifier).padding(horizontal = 4.dp, vertical = 1.dp),
    ) { Tx(e.t, man(fs.sp, FontWeight.Bold, c.fg(k), (fs * 1.4f).sp)) }
}

/* ---------------- Måned ---------------- */

@Composable
fun MonthView(vm: KalVm) {
    val k = LocalK.current
    val A = vm.a
    val T = today()
    val by = remember(vm.visible) { byDay(vm.visible) }
    val f = A.withDayOfMonth(1)
    // Prompt 35: «Uken starter» (mandag/søndag) gjelder rutenettet, ukedagene og ukenummer-kolonnen.
    val sun = vm.sun
    val st = no.kristo.kalender.wkStart35(f, sun)
    val dim = f.lengthOfMonth()
    val nw = (no.kristo.kalender.daysBetween(st, f) + dim + 6) / 7
    val mx = 4 // Android: opptil fire chips per dag (iOS tre).
    val wl = if (sun) listOf("S") + WL.dropLast(1) else WL
    Column(Modifier.fillMaxSize().padding(start = 6.dp, end = 6.dp, bottom = 4.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 5.dp)) {
            // Prompt 35: ukenummer tydeligere – IBM Plex Mono 800, full tekstfarge, uten brikke; kolonnen 26 dp.
            if (vm.sw) Box(Modifier.width(26.dp), contentAlignment = Alignment.Center) { Tx("U", monoX(10.5.sp, k.ink)) }
            wl.forEachIndexed { i, l -> Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { Tx(l, man(11.sp, FontWeight.Bold, if (i == (if (sun) 0 else 6)) k.sun else k.mut)) } }
        }
        for (w in 0 until nw) {
            val d0 = st.plusDays(7L * w)
            Row(Modifier.fillMaxWidth().weight(1f).drawBehind { drawLine(k.line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
                if (vm.sw) Box(Modifier.width(26.dp).padding(top = 6.dp), contentAlignment = Alignment.TopCenter) { Tx("${no.kristo.kalender.wkNo35(d0, sun)}", monoX(12.5.sp, k.ink)) }
                for (i in 0 until 7) {
                    val d = d0.plusDays(i.toLong())
                    val L = by[d].orEmpty()
                    val inM = d.monthValue == A.monthValue
                    val td = d == T
                    val cut = if (L.size > mx) mx - 1 else mx
                    val wx = vm.wxOf(d)
                    Column(
                        Modifier.weight(1f).fillMaxHeight().alpha(if (inM) 1f else .38f).background(if (td) Red.copy(alpha = .06f) else Color.Transparent)
                            .tap(longDate(d)) { vm.openDay(d) }.padding(start = 2.dp, end = 2.dp, top = 3.dp, bottom = 2.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 1.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                            Box(Modifier.size(22.dp).clip(CircleShape).background(if (td) Red else Color.Transparent), contentAlignment = Alignment.Center) {
                                Tx("${d.dayOfMonth}", man(12.sp, FontWeight.Bold, if (td) Color.White else if (d.jsDay == 0) k.sun else k.ink))
                            }
                            if (wx != null && inM) WxIcon(wx, 12.dp)
                        }
                        L.take(cut).forEach { (e, _) -> EvChip(vm, e, 9.5f) }
                        if (L.size > mx) Tx("+${L.size - cut}", man(9.5.sp, FontWeight.Bold, k.mut), Modifier.padding(horizontal = 4.dp))
                    }
                }
            }
        }
    }
}

/* ---------------- Uke / 3 dager / Dag ---------------- */

/** Overlappende hendelser deles i spor (fasitens lay()). */
private class Laid(val e: KEv, val lane: Int, val n: Int)

private fun lay(list: List<KEv>): List<Laid> {
    val L = list.filter { !it.all }.sortedWith(compareBy<KEv> { it.s }.thenByDescending { it.e })
    val out = ArrayList<Laid>()
    var cl = ArrayList<KEv>()
    var end = -1
    fun fl() {
        val ln = ArrayList<Int>()
        val lanes = cl.map { e ->
            var i = ln.indexOfFirst { z -> z <= (e.s ?: 0) }
            if (i < 0) { i = ln.size; ln += 0 }
            ln[i] = e.e ?: ((e.s ?: 0) + 60)
            i
        }
        cl.forEachIndexed { j, e -> out += Laid(e, lanes[j], ln.size) }
        cl = ArrayList()
    }
    L.forEach { e ->
        if (cl.isNotEmpty() && (e.s ?: 0) >= end) { fl(); end = -1 }
        cl += e
        end = maxOf(end, e.e ?: ((e.s ?: 0) + 60))
    }
    if (cl.isNotEmpty()) fl()
    return out
}

@Composable
fun GridView(vm: KalVm) {
    val k = LocalK.current
    val T = today()
    val N = when (vm.v) { "dag" -> 1; "3d" -> 3; else -> 7 }
    val st = if (vm.v == "uke") no.kristo.kalender.wkStart35(vm.a, vm.sun) else vm.a
    val H: Dp = when (N) { 7 -> 44.dp; 3 -> 52.dp; else -> 62.dp }
    val fs = when (N) { 7 -> 9.5f; 3 -> 11f; else -> 13f }
    val by = remember(vm.visible) { byDay(vm.visible) }
    val days = (0 until N).map { st.plusDays(it.toLong()) }
    val hasAll = days.any { d -> by[d].orEmpty().any { it.first.all } }
    val todayIn = T in days
    val nm = nowMin()
    val scroll = rememberScrollState()
    val density = LocalDensity.current
    // Prompt 35: «Tidslinje starter» – Nå (nå −2 t, eller 07:30 når i dag ikke vises), 06 eller 08.
    LaunchedEffect(vm.v, st, vm.tl) {
        val y = with(density) {
            when (vm.tl) {
                "06" -> 6f * H.toPx()
                "08" -> 8f * H.toPx()
                else -> if (todayIn) maxOf(0f, (nm / 60f - 2f) * H.toPx()) else 7.5f * H.toPx()
            }
        }
        scroll.scrollTo(y.toInt())
    }
    Column(Modifier.fillMaxSize()) {
        // Kolonnehode: ukedag, dato og vær (ikon + maks).
        Row(Modifier.fillMaxWidth().padding(end = 6.dp, bottom = 6.dp)) {
            // Prompt 35: «U43» i 800 / --ink (12 sp).
            Box(Modifier.width(40.dp).align(Alignment.Bottom).padding(bottom = 4.dp), contentAlignment = Alignment.Center) {
                if (vm.sw) Tx("U${no.kristo.kalender.wkNo35(no.kristo.kalender.wkStart35(st, vm.sun), vm.sun)}", monoX(12.sp, k.ink))
            }
            days.forEach { d ->
                val td = d == T
                val wx = vm.wxOf(d)
                // Zoom inn: Uke → 3 dager fra dagen, 3 dager → Dag.
                Column(Modifier.weight(1f).then(if (N > 1) Modifier.tap(longDate(d)) { vm.openDay(d) } else Modifier), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Tx(WS[d.jsDay].uppercase(), mono(9.5.sp, if (td) Red else if (d.jsDay == 0) k.sun else k.mut, .06f))
                    Box(Modifier.size(28.dp).clip(CircleShape).background(if (td) Red else Color.Transparent), contentAlignment = Alignment.Center) {
                        Tx("${d.dayOfMonth}", man(15.sp, FontWeight.Bold, if (td) Color.White else k.ink))
                    }
                    if (wx != null) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        WxIcon(wx, 12.dp); Tx("${wx.hi}°", mono(10.sp, k.mut))
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(k.line))
        if (hasAll) {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 4.dp, end = 6.dp)) {
                Tx("hele", mono(9.sp, k.mut2), Modifier.width(40.dp).padding(top = 3.dp).semantics { contentDescription = "Hele dagen" })
                days.forEach { d ->
                    Column(Modifier.weight(1f).padding(horizontal = 1.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        by[d].orEmpty().filter { it.first.all }.forEach { (e, _) -> EvChip(vm, e, 10f) { vm.openEv(e) } }
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(k.line))
        }
        Box(Modifier.fillMaxWidth().weight(1f).verticalScroll(scroll)) {
            Row(Modifier.fillMaxWidth().height(H * 24).padding(end = 6.dp)) {
                // Timene 01–23.
                Box(Modifier.width(40.dp).fillMaxHeight()) {
                    for (i in 1..23) Tx(i.toString().padStart(2, '0'), mono(9.5.sp, k.mut2), Modifier.align(Alignment.TopEnd).offset(x = (-6).dp, y = H * i - 6.dp))
                }
                days.forEach { d ->
                    val td = d == T
                    BoxWithConstraints(
                        Modifier.weight(1f).fillMaxHeight().background(if (td && N > 1) Red.copy(alpha = .035f) else Color.Transparent).drawBehind {
                            drawLine(k.line2, Offset(0f, 0f), Offset(0f, size.height), 1.dp.toPx())
                            val h = H.toPx()
                            var y = 0f
                            while (y < size.height) { drawLine(k.line2, Offset(0f, y), Offset(size.width, y), 1.dp.toPx()); y += h }
                        },
                    ) {
                        val cw = maxWidth
                        lay(by[d].orEmpty().map { it.first }).forEach { l ->
                            val e = l.e
                            val c = vm.cal(e.cal)
                            val s = e.s ?: 0
                            val en = e.e ?: (s + 60)
                            val hh = maxOf(20.dp, H * ((en - s) / 60f) - 2.dp)
                            Column(
                                Modifier.offset(x = cw * (l.lane.toFloat() / l.n) + 2.dp, y = H * (s / 60f) + 1.dp).width(cw / l.n - 4.dp).height(hh)
                                    .border(1.5.dp, k.bg, RoundedCornerShape(7.dp)).clip(RoundedCornerShape(7.dp)).background(c.col.copy(alpha = .15f))
                                    .tap(e.t) { vm.openEv(e) }.padding(horizontal = 5.dp, vertical = 3.dp),
                                verticalArrangement = Arrangement.spacedBy(1.dp),
                            ) {
                                Tx(e.t, man(fs.sp, FontWeight.Bold, c.fg(k), (fs * 1.25f).sp), maxLines = 3)
                                if (hh >= 36.dp && N < 7) Tx(hm(s) + "–" + hm(en), mono(9.5.sp, c.fg(k).copy(alpha = .85f)))
                            }
                        }
                        if (td) {
                            // Rød nå-linje.
                            Box(Modifier.offset(x = (-4).dp, y = H * (nm / 60f)).fillMaxWidth().height(2.dp).background(Red))
                            Box(Modifier.offset(x = (-4).dp, y = H * (nm / 60f) - 3.dp).size(8.dp).clip(CircleShape).background(Red))
                        }
                    }
                }
            }
        }
    }
}

/* ---------------- År ---------------- */

@Composable
fun YearView(vm: KalVm) {
    val k = LocalK.current
    val T = today()
    val Y = vm.a.year
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 14.dp, end = 14.dp, top = 2.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        for (r in 0 until 4) Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            for (cI in 0 until 3) {
                val mi = r * 3 + cI
                val f = LocalDate.of(Y, mi + 1, 1)
                val off = if (vm.sun) f.jsDay else (f.jsDay + 6) % 7
                Column(Modifier.weight(1f).tap(cap(MN[mi])) { vm.openMonth(f) }, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Tx(cap(MN[mi]), news(17.sp, if (Y == T.year && mi + 1 == T.monthValue) Red else k.ink))
                    val cells = List(off) { 0 } + (1..f.lengthOfMonth()).toList()
                    cells.chunked(7).forEach { wk ->
                        Row(Modifier.fillMaxWidth().padding(bottom = 2.dp)) {
                            for (j in 0 until 7) {
                                val n = wk.getOrNull(j) ?: 0
                                val dd = if (n > 0) f.withDayOfMonth(n) else null
                                val td = dd == T
                                Box(Modifier.weight(1f).height(15.dp).clip(RoundedCornerShape(8.dp)).background(if (td) Red else Color.Transparent), contentAlignment = Alignment.Center) {
                                    if (n > 0) Tx("$n", man(8.5.sp, FontWeight.SemiBold, if (td) Color.White else if (dd!!.jsDay == 0) k.sun else k.ink))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ---------------- Liste (agenda, neste 6 uker) ---------------- */

/** Rad i Liste og Søk: tid, fargestripe, tittel med merke, sted · kalender. */
@Composable
fun EvRow(vm: KalVm, e: KEv, cont: Boolean = false, twoTimes: Boolean = true) {
    val k = LocalK.current
    val c = vm.cal(e.cal)
    val tag = when { e.kind == "frist" -> "FRIST"; e.kind == "bursdag" -> "BURSDAG"; cont -> "FORTS."; else -> null }
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 44.dp).tap(e.t) { vm.openEv(e) }.drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }
            .padding(horizontal = 2.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.width(46.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Tx(if (e.all) "Hele" else hm(e.s ?: 0), mono(11.5.sp, k.ink))
            if (twoTimes) Tx(if (e.all) "dagen" else hm(e.e ?: 0), mono(11.5.sp, k.mut2))
        }
        Box(Modifier.width(4.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(c.col))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Tx(e.t, man(14.5.sp, FontWeight.Bold, k.ink), Modifier.weight(1f, fill = false))
                if (tag != null) Tag(tag, c.col.copy(alpha = .133f), c.fg(k))
            }
            Tx(listOfNotNull(e.loc, c.n).joinToString(" · "), man(12.5.sp, FontWeight.Medium, k.mut))
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ListView(vm: KalVm) {
    val k = LocalK.current
    val T = today()
    val by = remember(vm.visible) { byDay(vm.visible) }
    val days = (0 until 42).map { T.plusDays(it.toLong()) }.filterIndexed { i, d -> i == 0 || by[d].orEmpty().isNotEmpty() }
    val sum = remember(vm.visible, vm.data.wx, vm.swx) { daySummary(vm.visible, if (vm.swx) vm.data.wx else emptyMap()) }
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 14.dp)) {
        item("glimt") {
            // «Glimt · dagen din»: trykk åpner Glimt.
            Row(
                Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 6.dp).clip(RoundedCornerShape(18.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(18.dp))
                    .tap("Spør Glimt") { vm.openGlimt() }.padding(horizontal = 14.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Spark(26.dp, false)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Tx("GLIMT · DAGEN DIN", mono(10.sp, k.acc, .14f))
                    Tx(sum, man(13.5.sp, FontWeight.Medium, k.ink, 19.5.sp), maxLines = 6)
                    Tx("Spør Glimt ›", man(12.sp, FontWeight.Bold, k.acc))
                }
            }
        }
        var lw: Int? = null
        days.forEachIndexed { i, d ->
            val w = no.kristo.kalender.wkNo35(no.kristo.kalender.wkStart35(d, vm.sun), vm.sun)
            val showWk = w != lw && i > 0
            lw = w
            val L = by[d].orEmpty()
            val wx = vm.wxOf(d)
            val idx = daysBetweenSafe(T, d)
            if (showWk) item("wk$w-$d") { Tx("UKE $w", monoX(12.sp, k.ink, .12f), Modifier.padding(start = 2.dp, top = 14.dp, bottom = 2.dp)) }
            stickyHeader("h$d") {
                Row(
                    Modifier.fillMaxWidth().background(k.bg).drawBehind { drawLine(k.line, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }
                        .padding(start = 2.dp, end = 2.dp, top = 10.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Tx(when (idx) { 0 -> "I dag"; 1 -> "I morgen"; else -> cap(WD[d.jsDay]) }, news(20.sp, if (idx == 0) Red else k.ink))
                    Spacer(Modifier.width(8.dp))
                    Tx("${d.dayOfMonth}. ${MN[d.monthValue - 1]}", man(12.5.sp, FontWeight.Medium, k.mut), Modifier.weight(1f).padding(bottom = 2.dp))
                    if (wx != null) Row(Modifier.padding(bottom = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        WxIcon(wx, 14.dp); Tx("${wx.hi}° / ${wx.lo}°", mono(11.sp, k.mut))
                    }
                }
            }
            if (L.isEmpty()) item("e$d") { Tx("Ingenting planlagt", man(13.sp, FontWeight.Medium, k.mut2), Modifier.padding(horizontal = 2.dp, vertical = 10.dp)) }
            items(L, key = { "r$d-" + it.first.id }) { (e, cont) -> EvRow(vm, e, cont) }
        }
        item("end") { Spacer(Modifier.height(12.dp)) }
    }
}

private fun daysBetweenSafe(a: LocalDate, b: LocalDate) = no.kristo.kalender.daysBetween(a, b)

/* ---------------- Søk ---------------- */

@Composable
fun SearchView(vm: KalVm) {
    val k = LocalK.current
    val T = today()
    val fr = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { fr.requestFocus() } }
    val ql = vm.q.lowercase().trim()
    val res: List<KEv> = run {
        val hm = vm.hidMenuIds
        val l = vm.all.filter { e ->
            if (e.cal in hm) return@filter false
            if (vm.sf != null && e.cal != vm.sf) return@filter false
            if (ql.isEmpty()) return@filter vm.sf != null
            (e.t + " " + (e.loc ?: "") + " " + vm.cal(e.cal).n).lowercase().contains(ql)
        }.sortedWith(compareBy<KEv> { it.d }.thenBy { it.s ?: 0 })
        (l.filter { !it.d.isBefore(T) } + l.filter { it.d.isBefore(T) }.reversed()).take(60)
    }
    val groups = res.groupBy { it.d }
    Column(Modifier.fillMaxSize().background(k.bg).windowInsetsPadding(WindowInsets.statusBars)) {
        Row(Modifier.padding(start = 14.dp, end = 14.dp, top = 4.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(22.dp)).padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Svg(Ic.SEARCH, 16.dp, k.mut, 2.3f)
                Box(Modifier.weight(1f)) {
                    if (vm.q.isEmpty()) Tx("Søk i hendelser", man(16.sp, FontWeight.Medium, k.mut2))
                    BasicTextField(vm.q, { vm.q = it }, Modifier.fillMaxWidth().focusRequester(fr).semantics { contentDescription = "Søk i hendelser" },
                        textStyle = man(16.sp, FontWeight.Medium, k.ink), singleLine = true, cursorBrush = SolidColor(Red))
                }
            }
            InkPill("Avbryt", { vm.closeSearch() }, h = 40.dp, padH = 16.dp)
        }
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(start = 14.dp, end = 14.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            vm.cals.filter { !it.hidMenu }.forEach { c -> Chip(c.n, vm.sf == c.id, { no.kristo.kalender.Hap.tick(); vm.sf = if (vm.sf == c.id) null else c.id }, dot = c.col, h = 32.dp, bgOff = k.card) }
        }
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 14.dp)) {
            groups.forEach { (d, l) ->
                item("g$d") {
                    val t = (if (d == T) "I DAG · " else if (d.isBefore(T)) "TIDLIGERE · " else "") +
                        (cap(WD[d.jsDay]) + " " + d.dayOfMonth + ". " + MN[d.monthValue - 1] + (if (d.year != T.year) " ${d.year}" else "")).uppercase()
                    Tx(t, mono(10.5.sp, if (d == T) Red else k.mut, .12f), Modifier.padding(start = 2.dp, top = 12.dp, bottom = 4.dp))
                }
                items(l, key = { "s$d-" + it.id }) { e -> EvRow(vm, e, twoTimes = false) }
            }
            if ((ql.isNotEmpty() || vm.sf != null) && groups.isEmpty()) item("none") {
                Tx("Ingen treff. Prøv et navn, et sted eller en kalender.", man(14.sp, FontWeight.Medium, k.mut), Modifier.padding(horizontal = 2.dp, vertical = 24.dp), maxLines = 3)
            }
            item("pad") { Spacer(Modifier.height(20.dp)) }
        }
    }
}
