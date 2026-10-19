package no.kristo.finanshub.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/*
 * Prompt 27 (ANDROID-A): Kalender v2 (design/Kalender.dc.html, variant «mobile»). Erstatter siden fra prompt 26
 * (kortene og widget-forhåndsvisningene nederst er borte). Hjem-kortet KALENDER (HomeKalCard26) er uendret.
 * Åpnes fra Mer → Kalender, Hjem-kortet og widgetene (finanshub://kalender).
 */

private val K27_NOW_KICK = Color(0xFFFF9C8C)
private val K27_NOW_LINE = Color(0xFFE0342A)
private const val K27_SEARCH = "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.6-3.6"
private const val K27_CAL = "M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4"
private const val K27_PLUS = "M12 5v14M5 12h14"

@Composable
private fun K27Mono(text: String, color: Color, size: TextUnit = 10.5.sp, modifier: Modifier = Modifier, spacing: TextUnit = 1.2.sp) =
    Text(text, color = color, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = size, letterSpacing = spacing, maxLines = 1,
        overflow = TextOverflow.Ellipsis, modifier = modifier)

private fun Modifier.k27Label(label: String): Modifier = this.semantics { contentDescription = label }

/** Minuttet nå (oppdateres hvert minutt). */
@Composable
private fun k27Minute(): LocalDateTime {
    var now by remember { mutableStateOf(LocalDateTime.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(60_000L - (LocalDateTime.now().second * 1000L) + 200L)
            now = LocalDateTime.now()
        }
    }
    return now
}

/* ---------------- Siden ---------------- */

@Composable
internal fun KalenderScreen27(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.kal26
    BackHandler { vm.closeKal26() }
    val now = k27Minute()
    val today = now.toLocalDate()
    val cur = s.cur ?: today
    val evs = s.events ?: emptyList()
    LaunchedEffect(s.view, cur) {
        val (a, b) = kalWindow27(s.view, cur)
        vm.loadKal26(quiet = true, from = a, to = b)
    }
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 16.dp
    BoxWithConstraints(Modifier.fillMaxSize().background(p.bg)) {
        val wide = maxWidth >= 600.dp
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            K27Top(vm, cur, today)
            if (s.mini) K27Mini(vm, cur, today)
            // Prompt 29: lyst Nå/Neste-kort (Calendar29Ui.kt) i stedet for den svarte stripa.
            K29NowCard(vm, kalNow29(s, evs, now))
            s.error?.let { e -> Text(e, color = p.lab, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp)) }
            if (s.unavailable) Text("Serveren har ikke Kalender ennå. Oppdater Homelab-serveren for å se timeplanen.", color = p.mut, fontSize = 12.5.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp))
            Box(Modifier.weight(1f).fillMaxWidth().pointerInput(s.view) {
                var dx = 0f
                detectHorizontalDragGestures(onDragStart = { dx = 0f }, onDragEnd = {
                    val lim = 70.dp.toPx()
                    if (dx < -lim) vm.shiftKal27(1) else if (dx > lim) vm.shiftKal27(-1)
                }) { ch, d -> dx += d; ch.consume() }
            }) {
                val pb = navB + 80.dp
                when (s.view) {
                    "maaned" -> K27Month(vm, evs, today, cur, pb)
                    "liste" -> K27List(vm, evs, today, cur, pb)
                    else -> K27Grid(vm, evs, now, cur, pb)
                }
            }
        }
        K27Bar(vm, Modifier.align(Alignment.BottomCenter).padding(start = 12.dp, end = 12.dp, bottom = navB))
        s.sel?.let { e -> K27Sheet(wide, navB, { s.sel = null; s.delArm = false }) { K27Detail(vm, e) } }
        s.form?.let { f -> K27Sheet(wide, navB, { s.form = null }) { K27Form(vm, f) } }
        if (s.search) K27Sheet(wide, navB, { s.search = false; s.q = ""; s.results = null }) { K27Search(vm, today) }
        vm.message?.let { m ->
            LaunchedEffect(m) { kotlinx.coroutines.delay(2600); if (vm.message == m) vm.message = null }
            Box(Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 60.dp).shadow(12.dp, CircleShape).clip(CircleShape).background(p.ink).padding(16.dp, 10.dp)) {
                Text(m, color = p.bg, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
            }
        }
    }
}

/* ---------------- Toppen: ‹ Oktober 2026 ▼ · søk · i dag ---------------- */

@Composable
private fun K27Top(vm: AppViewModel, cur: LocalDate, today: LocalDate) {
    val p = PaperPal.current
    val s = vm.kal26
    val V = s.view
    val st0 = if (V == "maaned" || V == "liste") cur else kalGridStart27(V, cur)
    val endD = if (V == "maaned" || V == "liste") cur else st0.plusDays(kalGridDays27(V) - 1L)
    val title = if (st0.monthValue == endD.monthValue) kalCap(BD_MN[st0.monthValue - 1])
    else kalCap(BD_MS[st0.monthValue - 1]) + "–" + BD_MS[endD.monthValue - 1]
    Row(Modifier.fillMaxWidth().padding(start = 6.dp, top = 6.dp, end = 10.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.size(40.dp, 44.dp).clip(CircleShape).press24 { vm.closeKal26All27() }.k27Label("Tilbake"), contentAlignment = Alignment.Center) {
            Text("‹", color = p.ink, fontSize = 28.sp)
        }
        Row(
            Modifier.weight(1f, fill = false).height(44.dp).clip(RoundedCornerShape(12.dp)).press24 { s.mini = !s.mini; s.miniOff = 0; Haptics.select() }.padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PSerif(title, 28.sp, maxLines = 1)
            Text("${endD.year}", color = p.mut, fontSize = 15.sp, modifier = Modifier.padding(top = 6.dp))
            Text(if (s.mini) "▲" else "▼", color = p.mut, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
        }
        Spacer(Modifier.weight(1f))
        Box(Modifier.size(44.dp).clip(CircleShape).press24 { s.search = true; s.q = ""; s.results = null; s.mini = false }.k27Label("Søk i kalenderen"), contentAlignment = Alignment.Center) {
            WxIcon(K27_SEARCH, p.ink, 20.dp, stroke = 2.2f)
        }
        Box(Modifier.size(44.dp).clip(CircleShape).press24 { vm.kalToday27() }.k27Label("I dag"), contentAlignment = Alignment.Center) {
            WxIcon(K27_CAL, p.ink, 24.dp, stroke = 1.8f)
            Text("${today.dayOfMonth}", color = p.ink, fontSize = 9.5.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(top = 7.dp))
        }
    }
}

/** ‹ lukker hele kalenderen (systemets tilbake lukker ark først). */
private fun AppViewModel.closeKal26All27() {
    val s = kal26
    s.form = null; s.search = false; s.sel = null; s.mini = false
    s.open = false
}

/* ---------------- Minikalender og kalenderfilter ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun K27Mini(vm: AppViewModel, cur: LocalDate, today: LocalDate) {
    val p = PaperPal.current
    val s = vm.kal26
    val evs = s.events ?: emptyList()
    val mBase = cur.withDayOfMonth(1).plusMonths(s.miniOff.toLong())
    val mSt = mBase.minusDays((mBase.dayOfWeek.value - 1).toLong())
    val V = s.view
    val inView: Set<LocalDate> = if (V == "maaned" || V == "liste") setOf(cur) else {
        val st0 = kalGridStart27(V, cur); (0 until kalGridDays27(V)).map { st0.plusDays(it.toLong()) }.toSet()
    }
    Column(Modifier.padding(start = 12.dp, end = 12.dp, bottom = 8.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(kalCap(BD_MN[mBase.monthValue - 1]) + " " + mBase.year, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.weight(1f).padding(start = 4.dp))
            Box(Modifier.size(34.dp).clip(CircleShape).press24 { s.miniOff -= 1 }.k27Label("Forrige måned"), contentAlignment = Alignment.Center) { Text("‹", color = p.ink, fontSize = 17.sp) }
            Box(Modifier.size(34.dp).clip(CircleShape).press24 { s.miniOff += 1 }.k27Label("Neste måned"), contentAlignment = Alignment.Center) { Text("›", color = p.ink, fontSize = 17.sp) }
        }
        // Prompt 29: ukenummer-kolonne (22 dp, «U»); trykk åpner uken i Uke-visning.
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("U", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, textAlign = TextAlign.Center, modifier = Modifier.width(22.dp))
            KAL_WS.forEach { Text(it.take(1), color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f)) }
        }
        for (w in 0 until 6) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            val wk = mSt.plusDays((w * 7).toLong())
            Box(Modifier.width(22.dp).height(34.dp).clip(RoundedCornerShape(8.dp)).press24 { s.cur = wk; s.mini = false; s.miniOff = 0; vm.setKalView27("uke") }.k27Label("Uke ${kalIsoWeek(wk)}"),
                contentAlignment = Alignment.Center) {
                Text("${kalIsoWeek(wk)}", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp)
            }
            for (i in 0 until 7) {
                val d = mSt.plusDays((w * 7 + i).toLong())
                val isT = d == today
                val inW = d in inView
                val oth = kalDay27(evs, d, s.hiddenFilters).filter { it.type != "time" }
                Column(
                    Modifier.weight(1f).height(34.dp).alpha(if (d.monthValue == mBase.monthValue) 1f else .35f).clip(RoundedCornerShape(17.dp))
                        .background(if (isT) Color(KAL_LAB) else if (inW) p.ink.copy(alpha = .1f) else Color.Transparent)
                        .press24 { s.cur = d; s.mini = false; s.miniOff = 0; Haptics.select(); if (V == "maaned" || V == "liste") vm.setKalView27("dag") }, // Prompt 30: fra Måned/Liste → Dag
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                ) {
                    Text("${d.dayOfMonth}", color = if (isT) Color.White else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
                    Box(Modifier.padding(top = 1.dp).size(4.dp).clip(CircleShape).background(if (oth.isEmpty()) Color.Transparent else if (isT) Color.White else Color(kalColor27(oth[0], s))))
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            s.calList27().forEach { c ->
                val off = c.id in s.hiddenFilters
                Row(
                    Modifier.height(32.dp).alpha(if (off) .45f else 1f).clip(CircleShape).border(1.dp, p.line, CircleShape).press24 { vm.toggleKalFilter26(c.id) }.padding(horizontal = 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(Modifier.size(9.dp).clip(CircleShape).background(Color(c.color)))
                    Text(c.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
                }
            }
        }
    }
}

/* ---------------- NESTE / NÅ ---------------- */

@Composable
private fun K27NextStrip(vm: AppViewModel, nx: KalNext27) {
    val p = PaperPal.current
    Row(
        Modifier.padding(start = 12.dp, end = 12.dp, bottom = 8.dp).fillMaxWidth().heightIn(min = 46.dp).height(IntrinsicSize.Min).clip(RoundedCornerShape(16.dp)).background(p.ink)
            .press24 { nx.ev?.let { vm.kal26.sel = it; vm.kal26.mini = false } }.padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(4.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(Color(nx.color)))
        if (nx.k.isNotEmpty()) K27Mono(nx.k, K27_NOW_KICK)
        Column(Modifier.weight(1f)) {
            Text(nx.title, color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(nx.sub, color = p.bg.copy(alpha = .75f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (nx.whenText.isNotEmpty()) Text(nx.whenText, color = p.bg, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 18.sp, maxLines = 1)
    }
}

/* ---------------- Dag · 3 dager · Uke ---------------- */

private class K27Lay(val e: Kal26Ev, val a: Int, val b: Int, var c: Int = 0, var n: Int = 1)

/** Overlappende hendelser side om side (samme algoritme som designet). */
private fun k27Layout(l: List<Kal26Ev>): List<K27Lay> {
    val t = l.filter { it.sMin != null && it.eMin != null && it.type != "innl" }
        .map { K27Lay(it, it.sMin!!, maxOf(it.eMin!!, it.sMin!! + 20)) }
        .sortedWith(compareBy<K27Lay> { it.a }.thenByDescending { it.b })
    val out = ArrayList<K27Lay>()
    var grp = ArrayList<K27Lay>()
    var end = -1
    fun flush() {
        val cols = ArrayList<Int>()
        grp.forEach { x ->
            var c = cols.indexOfFirst { it <= x.a }
            if (c < 0) { c = cols.size; cols.add(0) }
            cols[c] = x.b; x.c = c
        }
        grp.forEach { x -> x.n = cols.size; out.add(x) }
        grp = ArrayList()
    }
    t.forEach { x ->
        if (grp.isNotEmpty() && x.a >= end) { flush(); end = -1 }
        grp.add(x); end = maxOf(end, x.b)
    }
    if (grp.isNotEmpty()) flush()
    return out
}

@Composable
private fun K27Grid(vm: AppViewModel, evs: List<Kal26Ev>, now: LocalDateTime, cur: LocalDate, pb: Dp) {
    val p = PaperPal.current
    val s = vm.kal26
    val V = s.view
    val today = now.toLocalDate()
    val nm = now.hour * 60 + now.minute
    val nD = kalGridDays27(V)
    val HH: Dp = when (V) { "dag" -> 64.dp; "3dager" -> 56.dp; else -> 46.dp }
    val st0 = kalGridStart27(V, cur)
    val days = (0 until nD).map { st0.plusDays(it.toLong()) }
    val lists = days.map { kalDay27(evs, it, s.hiddenFilters) }
    fun allOf(l: List<Kal26Ev>) = l.filter { it.sMin == null || it.eMin == null || it.type == "innl" }
    val hasAll = lists.any { allOf(it).isNotEmpty() }
    val inRange = today in days
    val narrow7 = nD == 7
    val scroll = rememberScrollState()
    val density = LocalDensity.current
    LaunchedEffect(V, st0) {
        val hh = with(density) { HH.toPx() }
        val y = if (inRange) nm / 60f * hh - hh * 1.5f else 7.75f * hh
        // Venter til innholdet har fått høyden sin.
        var n = 0
        while ((scroll.maxValue == 0 || scroll.maxValue == Int.MAX_VALUE) && n < 20) { kotlinx.coroutines.delay(30); n++ }
        scroll.scrollTo(y.toInt().coerceIn(0, maxOf(0, scroll.maxValue)))
    }
    val gutter = 40.dp
    Column(Modifier.fillMaxSize()) {
        // Ukenummer og dagene
        Row(Modifier.fillMaxWidth().padding(end = 8.dp, bottom = 6.dp), verticalAlignment = Alignment.Bottom) {
            Text("U${kalIsoWeek(st0)}", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, textAlign = TextAlign.Center,
                modifier = Modifier.width(gutter).padding(bottom = 8.dp))
            days.forEach { d ->
                val isT = d == today
                val we = d.dayOfWeek.value >= 6
                Column(Modifier.weight(1f).press24 { s.cur = d; vm.setKalView27("dag") }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    val w = KAL_WS[d.dayOfWeek.value - 1]
                    K27Mono(if (narrow7) w.take(1) else w, if (isT) p.lab else if (we) p.mut else p.ink, 10.5.sp, spacing = .6.sp)
                    Box(Modifier.size(32.dp).clip(CircleShape).background(if (isT) p.lab else Color.Transparent), contentAlignment = Alignment.Center) {
                        Text("${d.dayOfMonth}", color = if (isT) Color.White else if (we) p.mut else p.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        if (hasAll) {
            Row(Modifier.fillMaxWidth().padding(end = 8.dp, top = 4.dp, bottom = 4.dp)) {
                Text("HELE", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.width(gutter).padding(top = 5.dp))
                lists.forEach { l ->
                    Column(Modifier.weight(1f).padding(horizontal = 1.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        allOf(l).forEach { e ->
                            Box(Modifier.fillMaxWidth().height(22.dp).clip(RoundedCornerShape(6.dp)).background(Color(kalColor27(e, s))).press24 { s.sel = e; s.mini = false }.padding(horizontal = 6.dp),
                                contentAlignment = Alignment.CenterStart) {
                                Text((if (e.type == "innl") "⚑ " else "") + kalShort(e), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(scroll)) {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp, end = 8.dp).height(HH * 24)) {
                Box(Modifier.width(gutter).fillMaxHeight()) {
                    for (h in 1 until 24) Text("%02d".format(h), color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 10.5.sp, textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth().offset(y = HH * h - 7.dp).padding(end = 6.dp))
                }
                days.forEachIndexed { i, d ->
                    val isT = d == today
                    val we = d.dayOfWeek.value >= 6
                    val line = p.line
                    BoxWithConstraints(
                        Modifier.weight(1f).fillMaxHeight()
                            .background(if (isT) p.lab.copy(alpha = .05f) else if (we) p.line.copy(alpha = .3f) else Color.Transparent)
                            .drawBehind {
                                drawLine(line, Offset(0f, 0f), Offset(0f, size.height), 1.dp.toPx())
                                val hh = HH.toPx()
                                for (h in 1 until 24) drawLine(line, Offset(0f, h * hh), Offset(size.width, h * hh), 1.dp.toPx())
                            }
                            .pointerInput(d, HH) {
                                detectTapGestures { o ->
                                    val m = (Math.floor(o.y / HH.toPx() * 2.0).toInt() * 30).coerceIn(0, 23 * 60)
                                    vm.openKalForm27(d, m)
                                }
                            },
                    ) {
                        val W = maxWidth
                        k27Layout(lists[i]).forEach { x ->
                            val e = x.e
                            val cc = Color(kalColor27(e, s))
                            val solid = e.type == "prove"
                            val ht = HH * ((x.b - x.a) / 60f)
                            val sel = s.sel?.id == e.id
                            val tall = ht >= 40.dp && !(narrow7 && x.n > 1)
                            Row(
                                Modifier.offset(x = W * (x.c.toFloat() / x.n) + 1.dp, y = HH * (x.a / 60f)).width(W / x.n - 3.dp).height(maxOf(18.dp, ht - 2.dp))
                                    .clip(RoundedCornerShape(6.dp)).background(if (solid) cc else lerp(p.card, cc, .17f))
                                    .then(if (sel) Modifier.border(2.dp, p.ink, RoundedCornerShape(6.dp)) else Modifier)
                                    .clickable { s.sel = e; s.mini = false },
                            ) {
                                Box(Modifier.width(3.dp).fillMaxHeight().background(cc))
                                Column(Modifier.padding(start = 4.dp, top = 3.dp, end = 4.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                    Text(kalShort(e), color = if (solid) Color.White else p.ink, fontWeight = FontWeight.Bold, fontSize = if (narrow7) 10.5.sp else 12.sp,
                                        lineHeight = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    if (tall) Text(e.sText + "–" + e.eText + (noUrl31(e.room).takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
                                        color = (if (solid) Color.White else p.ink).copy(alpha = .8f), fontSize = 11.sp, lineHeight = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                        if (isT) {
                            val y = HH * (nm / 60f)
                            Box(Modifier.fillMaxWidth().offset(y = y - 1.dp).height(2.dp).background(K27_NOW_LINE))
                            Box(Modifier.offset(x = (-5).dp, y = y - 5.dp).size(10.dp).clip(CircleShape).background(K27_NOW_LINE))
                        }
                    }
                }
            }
            Spacer(Modifier.height(pb))
        }
    }
}

/* ---------------- Måned ---------------- */

@Composable
private fun K27Month(vm: AppViewModel, evs: List<Kal26Ev>, today: LocalDate, cur: LocalDate, pb: Dp) {
    val p = PaperPal.current
    val s = vm.kal26
    val m0 = cur.withDayOfMonth(1)
    val stM = m0.minusDays((m0.dayOfWeek.value - 1).toLong())
    Column(Modifier.fillMaxSize().padding(start = 6.dp, end = 6.dp, bottom = pb)) {
        // Prompt 29: smal ukenummer-kolonne (24 dp, «U») til venstre; trykk åpner uken.
        Row(Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 6.dp)) {
            K27Mono("U", p.mut, 10.sp, Modifier.width(24.dp).wrapContentWidth(Alignment.CenterHorizontally), spacing = .8.sp)
            KAL_WS.forEach { K27Mono(it.take(1), p.mut, 10.sp, Modifier.weight(1f).wrapContentWidth(Alignment.CenterHorizontally), spacing = .8.sp) }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        for (w in 0 until 6) Row(Modifier.fillMaxWidth().weight(1f)) {
            val wk = stM.plusDays((w * 7).toLong())
            Box(
                Modifier.width(24.dp).fillMaxHeight().drawBehind { drawLine(p.line, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }
                    .clickable { s.cur = wk; vm.setKalView27("uke") }.k27Label("Uke ${kalIsoWeek(wk)}").padding(top = 8.dp),
                contentAlignment = Alignment.TopCenter,
            ) { Text("${kalIsoWeek(wk)}", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp) }
            for (i in 0 until 7) {
                val d = stM.plusDays((w * 7 + i).toLong())
                val l = kalDay27(evs, d, s.hiddenFilters)
                val isT = d == today
                val les = l.count { it.type == "time" }
                val oth = l.filter { it.type != "time" }
                val sh = oth.take(if (les > 0) 2 else 3)
                Column(
                    Modifier.weight(1f).fillMaxHeight().alpha(if (d.monthValue == m0.monthValue) 1f else .4f)
                        .background(if (isT) p.lab.copy(alpha = .06f) else Color.Transparent)
                        .drawBehind { drawLine(p.line, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }
                        .clickable { s.cur = d; Haptics.select(); vm.setKalView27("dag") }.padding(horizontal = 2.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Box(Modifier.align(Alignment.CenterHorizontally).size(24.dp).clip(CircleShape).background(if (isT) p.lab else Color.Transparent), contentAlignment = Alignment.Center) {
                        Text("${d.dayOfMonth}", color = if (isT) Color.White else p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                    sh.forEach { e ->
                        val c = Color(kalColor27(e, s))
                        val solid = e.type == "prove" || e.sMin == null || e.type == "innl"
                        Box(Modifier.fillMaxWidth().height(16.dp).clip(RoundedCornerShape(4.dp)).background(if (solid) c else Color.Transparent).padding(horizontal = 4.dp), contentAlignment = Alignment.CenterStart) {
                            Text(kalShort(e), color = if (solid) Color.White else c, fontWeight = FontWeight.Bold, fontSize = 10.sp, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Clip, softWrap = false)
                        }
                    }
                    if (les > 0) Box(Modifier.fillMaxWidth().height(16.dp).clip(RoundedCornerShape(4.dp)).background(p.line.copy(alpha = .7f)).padding(horizontal = 4.dp), contentAlignment = Alignment.CenterStart) {
                        Text("$les t", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 10.sp, lineHeight = 16.sp, maxLines = 1, softWrap = false)
                    }
                    if (oth.size > sh.size) Text("+${oth.size - sh.size}", color = p.mut, fontWeight = FontWeight.Bold, fontSize = 10.sp, modifier = Modifier.padding(start = 4.dp))
                }
            }
        }
    }
}

/* ---------------- Liste (45 dager) ---------------- */

@Composable
private fun K27List(vm: AppViewModel, evs: List<Kal26Ev>, today: LocalDate, cur: LocalDate, pb: Dp) {
    val p = PaperPal.current
    val s = vm.kal26
    val groups = (0 until 45).map { cur.plusDays(it.toLong()) }.map { it to kalDay27(evs, it, s.hiddenFilters) }.filter { it.second.isNotEmpty() || it.first == today }
    val st = rememberLazyListState()
    LaunchedEffect(cur) { st.scrollToItem(0) }
    LazyColumn(Modifier.fillMaxSize(), state = st, contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = pb)) {
        if (groups.isEmpty()) item { Text(if (s.events == null) "Henter …" else "Ingenting de neste 45 dagene.", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(vertical = 16.dp)) }
        items(groups, key = { it.first.toString() }) { (d, l) ->
            val isT = d == today
            Row(Modifier.fillMaxWidth().drawBehind { drawLine(p.line, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }.padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.width(46.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    K27Mono(KAL_WS[d.dayOfWeek.value - 1], if (isT) p.lab else p.mut, spacing = 0.sp)
                    Box(Modifier.size(34.dp).clip(CircleShape).background(if (isT) p.lab else Color.Transparent), contentAlignment = Alignment.Center) {
                        Text("${d.dayOfMonth}", color = if (isT) Color.White else p.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                    Text(BD_MS[d.monthValue - 1].uppercase(), color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 10.sp)
                }
                Column(Modifier.weight(1f).padding(top = 2.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (l.isEmpty()) Text("Ingen hendelser", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(vertical = 12.dp, horizontal = 2.dp))
                    l.forEach { e -> K27ListItem(vm, e) }
                }
            }
        }
    }
}

@Composable
private fun K27ListItem(vm: AppViewModel, e: Kal26Ev) {
    val p = PaperPal.current
    val s = vm.kal26
    val cc = Color(kalColor27(e, s))
    val solid = e.isExam
    val fg = if (solid) Color.White else p.ink
    val teacher = if (e.type == "time") e.teacher?.takeIf { it.isNotBlank() } else null
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).height(IntrinsicSize.Min).clip(RoundedCornerShape(12.dp)).background(if (solid) cc else lerp(p.card, cc, .13f))
            .press24 { s.sel = e; s.mini = false },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(cc))
        Column(Modifier.weight(1f).padding(start = 9.dp, top = 6.dp, bottom = 6.dp, end = 8.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(e.title, color = fg, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(e.timeText, noUrl31(e.room).takeIf { it.isNotBlank() }, teacher).joinToString(" · "), color = fg.copy(alpha = .85f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (solid) Box(Modifier.padding(end = 10.dp).clip(RoundedCornerShape(6.dp)).background(Color.Black.copy(alpha = .18f)).padding(horizontal = 6.dp, vertical = 3.dp)) {
            Text(if (e.type == "prove") "PRØVE" else "FRIST", color = fg, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 9.5.sp, letterSpacing = .8.sp)
        }
    }
}

/* ---------------- Fanelinja: Dag · 3 dager · Uke · Måned · Liste + rund + ---------------- */

@Composable
private fun K27Bar(vm: AppViewModel, modifier: Modifier) {
    val p = PaperPal.current
    val s = vm.kal26
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            Modifier.weight(1f).height(62.dp).shadow(14.dp, CircleShape).clip(CircleShape).background(p.ink).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            KAL27_VIEWS.forEach { (k, n, ic) ->
                val on = s.view == k
                val fg = if (on) p.ink else p.bg.copy(alpha = .72f)
                Column(
                    Modifier.weight(1f).height(50.dp).clip(CircleShape).background(if (on) p.bg else Color.Transparent).press24 { vm.setKalView27(k) }.k27Label(n),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
                ) {
                    WxIcon(ic, fg, 19.dp, stroke = 1.9f)
                    Text(n, color = fg, fontWeight = FontWeight.Bold, fontSize = 10.5.sp, maxLines = 1, softWrap = false)
                }
            }
        }
        Box(Modifier.size(62.dp).shadow(14.dp, CircleShape).clip(CircleShape).background(p.lab).press24 { vm.openQuick29() }.k27Label("Legg til time"), contentAlignment = Alignment.Center) {
            WxIcon(K27_PLUS, Color.White, 24.dp, stroke = 2.4f)
        }
    }
}

/* ---------------- Ark (detaljer, skjema, søk) ---------------- */

@Composable
private fun K27Sheet(wide: Boolean, navB: Dp, onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    val shape = if (wide) RoundedCornerShape(24.dp) else RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp)
    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = .4f)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
        contentAlignment = if (wide) Alignment.Center else Alignment.BottomCenter,
    ) {
        Column(
            Modifier.then(if (wide) Modifier.widthIn(max = 480.dp).fillMaxWidth() else Modifier.fillMaxWidth()).fillMaxHeight(.9f).wrapContentHeight(if (wide) Alignment.CenterVertically else Alignment.Bottom)
                .imePadding().clip(shape).background(p.bg)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .verticalScroll(rememberScrollState()).padding(start = 16.dp, top = 18.dp, end = 16.dp, bottom = if (wide) 22.dp else navB + 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) { content() }
    }
}

@Composable
private fun K27Close(onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(40.dp).clip(CircleShape).background(p.card).press24(onClick = onClick).k27Label("Lukk"), contentAlignment = Alignment.Center) {
        Text("✕", color = p.ink, fontSize = 14.sp)
    }
}

@Composable
private fun K27Chip(text: String, on: Boolean, dot: Color? = null, height: Dp = 38.dp, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        Modifier.height(height).clip(CircleShape).border(1.dp, if (on) p.ink else p.line, CircleShape).background(if (on) p.ink else Color.Transparent).press24(onClick = onClick).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        dot?.let { Box(Modifier.size(9.dp).clip(CircleShape).background(it)) }
        Text(text, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1)
    }
}

@Composable
private fun K27Btn(text: String, bg: Color, fg: Color, modifier: Modifier, border: Color? = null, onClick: () -> Unit) {
    Box(
        modifier.height(46.dp).clip(CircleShape).then(if (border != null) Modifier.border(1.dp, border, CircleShape) else Modifier).background(bg).press24(onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = fg, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1) }
}

/* ---------------- Detaljer ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun K27Detail(vm: AppViewModel, e: Kal26Ev) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.kal26
    val c = Color(kalColor27(e, s))
    val calN = s.calName27(e.cat)
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.width(6.dp).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(c))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            K27Mono(calN.uppercase() + when (e.type) { "prove" -> " · PRØVE"; "innl" -> " · INNLEVERING"; else -> "" }, p.lab)
            PSerif(e.title, 26.sp)
            val whenT = kalCap(kalLong(e.date)) + (if (e.allDay && e.endDate != e.date) " – " + kalLong(e.endDate) else "") + " · " + e.timeText
            Text(whenT, color = p.mut, fontSize = 14.sp)
        }
        K27Close { s.sel = null; s.delArm = false }
    }
    val rows = listOfNotNull(
        noUrl31(e.room).takeIf { it.isNotBlank() }?.let { "Sted" to it },
        e.teacher?.takeIf { it.isNotBlank() }?.let { "Lærer" to it },
        "Kalender" to calN,
        e.subject?.takeIf { e.type != "time" && it.isNotBlank() }?.let { "Fag" to it },
        e.note?.takeIf { it.isNotBlank() }?.let { "Merknad" to it },
        e.repeat?.let { r -> KAL27_REPEATS.firstOrNull { it.first == r }?.second?.let { "Gjentas" to it } },
    )
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(horizontal = 14.dp)) {
        rows.forEachIndexed { i, (a, b) ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(a, color = p.mut, fontSize = 14.sp)
                Text(b, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
            }
        }
    }
    K27Mono("VARSEL", p.lab)
    val rem = e.remind?.takeIf { e.id !in s.reminders } ?: s.reminderFor(e)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        KAL_REMS.forEach { (v, n) -> K27Chip(n, rem == v, height = 36.dp) { vm.setKalRemind27(e, v) } }
    }
    Text(if (e.editable) "Lagret i Google Kalender ($calN)." else "Fra ${kalSrc27(e.cat)}. Endres i kilden.", color = p.mut, fontSize = 12.5.sp)
    // Prompt 31: lenken i stedsteksten (f.eks. mazemap) vises som «Åpne kart ↗», teksten uten URL.
    val roomUrl = firstUrl31(e.room)
    val room = noUrl31(e.room)
    val hasMap = e.mazemap != null || roomUrl != null || (room.isNotEmpty() && !room.equals("Canvas", true) && e.cat in setOf("timeplan", "prover", "skole"))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 2) {
        if (e.editable) {
            K27Btn("Rediger", p.ink, p.bg, Modifier.weight(1f)) { vm.editKal27(e) }
            K27Btn(if (s.delArm) "Trykk igjen" else "Slett", Color(KAL_LAB), Color.White, Modifier.weight(1f)) { vm.deleteKal27(e) }
        }
        if (hasMap) K27Btn(if (roomUrl != null) "Åpne kart ↗" else "Vis rom på kart ↗", Color.Transparent, p.ink, Modifier.weight(1f), border = p.line) { openLink(ctx, e.mazemap ?: roomUrl ?: "https://use.mazemap.com/") }
        K27Btn("Kopier til Privat", Color.Transparent, p.ink, Modifier.weight(1f), border = p.line) { vm.copyKal27(e) }
    }
    e.url?.takeIf { it.startsWith("http") }?.let { u ->
        Text(if (e.source == "canvas") "Åpne i Canvas ↗" else "Åpne ↗", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.press24 { openLink(ctx, u) })
    }
}

/* ---------------- Ny / rediger ---------------- */

@Composable
private fun K27Field(value: String, onChange: (String) -> Unit, placeholder: String, height: Dp, size: TextUnit, weight: FontWeight, focus: FocusRequester? = null, single: Boolean = true) {
    val p = PaperPal.current
    Box(Modifier.fillMaxWidth().heightIn(min = height).clip(RoundedCornerShape(16.dp)).border(1.dp, p.line, RoundedCornerShape(16.dp)).background(p.card).padding(horizontal = 16.dp, vertical = 12.dp),
        contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Text(placeholder, color = p.mut, fontSize = size, fontWeight = weight)
        BasicTextField(value, onChange, singleLine = single, textStyle = TextStyle(color = p.ink, fontSize = size, fontWeight = weight, fontFamily = PaperFonts.sans),
            cursorBrush = SolidColor(p.ink), keyboardOptions = KeyboardOptions(imeAction = if (single) ImeAction.Next else ImeAction.Default),
            modifier = Modifier.fillMaxWidth().then(if (focus != null) Modifier.focusRequester(focus) else Modifier))
    }
}

@Composable
private fun K27FormRow(label: String, value: String, top: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
    Row(Modifier.fillMaxWidth().heightIn(min = 50.dp).press24(onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
        Text(value, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
    }
}

private fun k27Date(d: LocalDate): String = "${d.dayOfMonth}. ${BD_MS[d.monthValue - 1]} ${d.year}"

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun K27Form(vm: AppViewModel, f: Kal27Form) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.kal26
    fun set(x: Kal27Form) { s.form = x.copy(err = "") }
    val focus = remember { FocusRequester() }
    LaunchedEffect(f.id) { if (f.id == null && f.title.isEmpty()) runCatching { focus.requestFocus() } }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PSerif(if (f.id != null) "Rediger hendelse" else "Ny hendelse", 24.sp, modifier = Modifier.weight(1f))
        K27Close { s.form = null }
    }
    K27Field(f.title, { set((s.form ?: f).copy(title = it)) }, "Tittel", 52.dp, 17.sp, FontWeight.SemiBold, focus)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(horizontal = 14.dp)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 50.dp).press24 { set(f.copy(allDay = !f.allDay)) }, verticalAlignment = Alignment.CenterVertically) {
            Text("Hele dagen", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
            Box(Modifier.size(46.dp, 28.dp).clip(CircleShape).background(if (f.allDay) p.ink else p.line).padding(3.dp), contentAlignment = if (f.allDay) Alignment.CenterEnd else Alignment.CenterStart) {
                Box(Modifier.size(22.dp).clip(CircleShape).background(Color.White))
            }
        }
        K27FormRow("Dato", k27Date(f.date), true) {
            DatePickerDialog(ctx, { _, y, m, d -> s.form?.let { cur -> set(cur.copy(date = LocalDate.of(y, m + 1, d))) } }, f.date.year, f.date.monthValue - 1, f.date.dayOfMonth).show()
        }
        if (f.allDay) {
            K27FormRow("Til og med", f.endDate?.let(::k27Date) ?: "Samme dag", true) {
                val e0 = f.endDate ?: f.date
                DatePickerDialog(ctx, { _, y, m, d -> s.form?.let { cur -> val nd = LocalDate.of(y, m + 1, d); set(cur.copy(endDate = if (nd.isAfter(cur.date)) nd else null)) } },
                    e0.year, e0.monthValue - 1, e0.dayOfMonth).show()
            }
        } else {
            K27FormRow("Fra", kalHm(f.start), true) {
                TimePickerDialog(ctx, { _, h, m ->
                    s.form?.let { cur ->
                        val ns = LocalTime.of(h, m)
                        val dur = (cur.end.toSecondOfDay() - cur.start.toSecondOfDay()) / 60
                        val ne = if (dur > 0) LocalTime.ofSecondOfDay((minOf(ns.toSecondOfDay() / 60 + dur, 23 * 60 + 59) * 60).toLong()) else cur.end
                        set(cur.copy(start = ns, end = ne))
                    }
                }, f.start.hour, f.start.minute, true).show()
            }
            K27FormRow("Til", kalHm(f.end), true) {
                TimePickerDialog(ctx, { _, h, m -> s.form?.let { cur -> set(cur.copy(end = LocalTime.of(h, m))) } }, f.end.hour, f.end.minute, true).show()
            }
        }
    }
    K27Field(f.location, { set((s.form ?: f).copy(location = it)) }, "Sted", 48.dp, 15.sp, FontWeight.Medium)
    K27Mono("KALENDER", p.lab)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        s.calList27().filter { it.id == "privat" || it.id == "familie" }.forEach { c -> K27Chip(c.name, f.calendar == c.id, Color(c.color)) { set(f.copy(calendar = c.id)) } }
    }
    K27Mono("GJENTA", p.lab)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        KAL27_REPEATS.forEach { (k, n) -> K27Chip(n, f.repeat == k) { set(f.copy(repeat = k)) } }
    }
    K27Mono("VARSEL", p.lab)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        KAL_REMS.forEach { (k, n) -> K27Chip(n, f.reminder == k) { set(f.copy(reminder = k)) } }
    }
    K27Field(f.note, { set((s.form ?: f).copy(note = it)) }, "Merknad", 48.dp, 15.sp, FontWeight.Medium, single = false)
    if (f.err.isNotEmpty()) Text(f.err, color = Color(KAL_LAB), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    Box(Modifier.fillMaxWidth().height(50.dp).clip(CircleShape).background(p.ink).alpha(if (s.saving) .6f else 1f).press24(enabled = !s.saving) { vm.saveKalForm27() }, contentAlignment = Alignment.Center) {
        Text(if (s.saving) "Lagrer …" else "Lagre", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 15.sp)
    }
    Text("Privat og Familie lagres i Google Kalender.", color = p.mut, fontSize = 12.sp)
}

/* ---------------- Søk ---------------- */

@Composable
private fun K27Search(vm: AppViewModel, today: LocalDate) {
    val p = PaperPal.current
    val s = vm.kal26
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.weight(1f).height(48.dp).clip(CircleShape).background(p.card).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (s.q.isEmpty()) WxIcon(K27_SEARCH, p.mut, 18.dp, stroke = 2.2f)
            else Box(
                // ✕ til venstre: 26 px sirkel, 36 px trykkflate; fokus blir i feltet.
                Modifier.offset(x = (-8).dp).size(36.dp).clip(CircleShape).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                    vm.searchKal27(""); runCatching { focus.requestFocus() }
                }.k27Label("Tøm søket"),
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(26.dp).clip(CircleShape).background(Color(0x387F7F7F)), contentAlignment = Alignment.Center) { Text("✕", color = p.ink, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (s.q.isEmpty()) Text("Søk etter timer, prøver, steder", color = p.mut, fontSize = 15.sp, maxLines = 1)
                BasicTextField(s.q, { vm.searchKal27(it) }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
                    cursorBrush = SolidColor(p.ink), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { vm.searchKal27(s.q) }),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus))
            }
        }
        K27Close { s.search = false; s.q = ""; s.results = null }
    }
    val res = s.results
    if (res != null && res.isNotEmpty()) {
        Text("${res.size}${if (res.size >= 60) "+" else ""} treff", color = p.mut, fontSize = 12.5.sp)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card)) {
            res.forEachIndexed { i, e ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).press24 {
                        s.search = false; s.q = ""; s.results = null
                        s.cur = e.date; s.sel = e
                        if (s.view == "maaned" || s.view == "liste") vm.setKalView27("dag")
                    }.padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(6.dp, 34.dp).clip(RoundedCornerShape(3.dp)).background(Color(kalColor27(e, s))))
                    Column(Modifier.weight(1f)) {
                        Text(e.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(kalCap(kalLong(e.date)) + " · " + e.timeText + (noUrl31(e.room).takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
                            color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (e.date == today) K27Mono("I DAG", p.lab, 9.5.sp)
                }
            }
        }
    } else if (res != null && s.q.trim().length >= 2) {
        Text("Ingen treff.", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp))
    }
}
