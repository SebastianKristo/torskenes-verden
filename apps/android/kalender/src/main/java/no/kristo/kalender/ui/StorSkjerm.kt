package no.kristo.kalender.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import no.kristo.kalender.Hap
import no.kristo.kalender.KEv
import no.kristo.kalender.Kal43Upd
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.MN
import no.kristo.kalender.Red
import no.kristo.kalender.WD
import no.kristo.kalender.hm
import no.kristo.kalender.jsDay
import no.kristo.kalender.today
import java.time.LocalDate
import no.kristo.kalender.KLight
import no.kristo.kalender.ui.designsystem.DsPalette

/*
 * Kalender på Fold / nettbrett (≥ 600 dp), prompt 43 (KAL43). Fasit: Kalender Oppsett Stor Skjerm.dc.html (1b Galaxy Z Fold
 * utbrettet) og Kalender App.dc.html → auVals (st:'lay'), Innstillinger → Generelt → «Oppsett på iPad og Fold».
 */

/** Ramme rundt appen: steg 2 av 2 etter innlogging, og oppsettet når vinduet er bredt. Smalt vindu = telefon (valget beholdes). */
@Composable
fun Wide43(vm: KalVm, content: @Composable () -> Unit) {
    val k = LocalK.current
    BoxWithConstraints(Modifier.fillMaxSize().background(k.bg)) {
        val mw = maxWidth
        val wide = mw >= 600.dp
        val lay = vm.k43.wideLay
        val pane = wide && vm.k43.layDone && lay == "full" && vm.v == "mnd" && mw >= 840.dp
        // Måneden bytter bare dag i dagspanelet når det vises (ingen navigering).
        LaunchedEffect(pane) { vm.full43 = pane }
        when {
            wide && !vm.k43.layDone -> LayoutStep43(vm)
            !wide -> content()
            lay == "tlf" -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                Box(Modifier.fillMaxHeight().widthIn(max = 700.dp).fillMaxWidth()) { content() }
            }
            else -> {
                val sideW: Dp = if (lay == "full") maxOf(250.dp, mw * 0.22f) else 280.dp
                Row(Modifier.fillMaxSize()) {
                    Sidebar43(vm, Modifier.width(sideW).fillMaxHeight())
                    Box(Modifier.width(1.dp).fillMaxHeight().background(k.line))
                    Box(Modifier.weight(1f).fillMaxHeight()) { content() }
                    if (pane) {
                        Box(Modifier.width(1.dp).fillMaxHeight().background(k.line))
                        DayPane43(vm, Modifier.width(mw * 0.28f).fillMaxHeight())
                    }
                }
            }
        }
        // Programvareoppdatering (Innstillinger → Glimt og konto, eller varselet «Kalender 1.1 er klar»).
        if (Kal43Upd.pageOpen) UpdatePage43(vm)
    }
}

/* ---------------- Steg 2 av 2: «Hvordan vil du bruke skjermen?» ---------------- */

private val LAYS43 = listOf(
    Triple("tlf", "Som på telefonen", "Én visning om gangen og faner nederst. Stor tekst, enkelt."),
    Triple("delt", "Delt", "Sidepanel med minikalender, kalendere og i dag. Visningen til høyre."),
    Triple("full", "Full skjerm", "Sidepanel, måned i midten og dagen til høyre. Alt på én skjerm."),
)
private val LAYN43 = mapOf("tlf" to "Som på telefonen", "delt" to "Delt", "full" to "Full skjerm")

@Composable
fun LayoutStep43(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k43
    Column(
        Modifier.fillMaxSize().background(k.bg).verticalScroll(rememberScrollState()).windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 28.dp, vertical = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Tx("STEG 2 AV 2", mono(KType.caption, k.acc, .14f))
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Tx("Hvordan vil du bruke skjermen?", news(KType.title2, k.ink).copy(textAlign = TextAlign.Center), maxLines = 2)
            Tx("Du kan bytte når som helst i Innstillinger", man(KType.callout, FontWeight.Medium, k.mut).copy(textAlign = TextAlign.Center), maxLines = 2)
        }
        Row(Modifier.widthIn(max = 960.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            LAYS43.forEach { (id, n, sub) ->
                val on = s.pick == id
                Column(
                    Modifier.weight(1f).then(if (on) Modifier.shadow(12.dp, RoundedCornerShape(22.dp)) else Modifier).clip(RoundedCornerShape(22.dp)).background(k.card)
                        .border(2.dp, if (on) k.ink else k.line, RoundedCornerShape(22.dp)).tap(n, Role.RadioButton) { Hap.tick(); s.pick = id }.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Preview43(id)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Tx(n, man(KType.body, FontWeight.ExtraBold, k.ink), Modifier.weight(1f, fill = false))
                        if (id == "full") Box(Modifier.clip(RoundedCornerShape(50)).background(Red).padding(horizontal = 8.dp, vertical = 2.dp)) { Tx("Anbefalt", man(KType.caption, FontWeight.Bold, Color.White)) }
                        Spacer(Modifier.weight(1f))
                        Box(Modifier.size(24.dp).clip(CircleShape).background(if (on) k.ink else Color.Transparent).border(1.5.dp, if (on) Color.Transparent else k.line, CircleShape), contentAlignment = Alignment.Center) {
                            if (on) Tx("✓", man(KType.subheadline, FontWeight.ExtraBold, k.bg))
                        }
                    }
                    Tx(sub, man(KType.subheadline, FontWeight.Medium, k.mut), maxLines = 4)
                }
            }
        }
        Column(Modifier.widthIn(max = 360.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(50)).background(k.ink).tap("Fortsett") { s.choose(s.pick) }, contentAlignment = Alignment.Center) {
                Tx("Fortsett med " + (LAYN43[s.pick] ?: "Full skjerm"), man(KType.body, FontWeight.ExtraBold, k.bg))
            }
            Box(Modifier.heightIn(min = 44.dp).tap("Hopp over") { s.choose("full") }, contentAlignment = Alignment.Center) {
                Tx("Hopp over · bruk Full skjerm", man(KType.callout, FontWeight.Bold, k.mut))
            }
            Tx("Kan endres i Innstillinger → Generelt → Oppsett på iPad og Fold", man(KType.footnote, FontWeight.Medium, k.mut2).copy(textAlign = TextAlign.Center), maxLines = 2)
        }
    }
}

/** Skjematisk forhåndsvisning på kortene. */
@Composable
private fun Preview43(id: String) {
    val k = LocalK.current
    // Skjematisk, alltid lys (som før): Papir lys-tokenene.
    val paper = KLight.card
    val cell = KLight.line2
    val bar = KLight.chip
    @Composable
    fun month(m: Modifier) {
        Column(m.clip(RoundedCornerShape(10.dp)).background(paper).padding(5.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            for (r in 0 until 5) Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                for (c in 0 until 7) {
                    val i = r * 7 + c
                    Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(if (i == 16) Red else if (i in listOf(3, 9, 20, 24)) DsPalette.Category.blue else cell))
                }
            }
        }
    }
    @Composable
    fun side(m: Modifier) {
        Column(m.clip(RoundedCornerShape(10.dp)).background(paper).padding(5.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Box(Modifier.fillMaxWidth().height(26.dp).clip(RoundedCornerShape(4.dp)).background(bar))
            repeat(3) { Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(2.dp)).background(cell)) }
        }
    }
    Row(Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(14.dp)).background(k.chip).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        when (id) {
            "tlf" -> Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.Center) { month(Modifier.width(92.dp).fillMaxHeight()) }
            "delt" -> { side(Modifier.width(44.dp).fillMaxHeight()); month(Modifier.weight(1f).fillMaxHeight()) }
            else -> {
                side(Modifier.width(36.dp).fillMaxHeight())
                month(Modifier.weight(1f).fillMaxHeight())
                Column(Modifier.width(44.dp).fillMaxHeight().clip(RoundedCornerShape(10.dp)).background(paper).padding(5.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(Modifier.width(30.dp).height(7.dp).clip(RoundedCornerShape(3.dp)).background(Red))
                    repeat(4) { i -> Box(Modifier.fillMaxWidth().height(if (i == 1) 18.dp else 8.dp).clip(RoundedCornerShape(3.dp)).background(if (i == 1) DsPalette.Category.blue.copy(alpha = .6f) else cell)) }
                }
            }
        }
    }
}

/* ---------------- Sidepanelet (Delt og Full skjerm) ---------------- */

private fun covers(e: KEv, d: LocalDate): Boolean = e.d == d || (e.days > 1 && !e.d.isAfter(d) && !e.d.plusDays((e.days - 1).toLong()).isBefore(d))

@Composable
private fun Sidebar43(vm: KalVm, modifier: Modifier) {
    val k = LocalK.current
    val T = today()
    val A = vm.a
    val f = A.withDayOfMonth(1)
    val st = no.kristo.kalender.wkStart35(f, vm.sun)
    val nw = (no.kristo.kalender.daysBetween(st, f) + f.lengthOfMonth() + 6) / 7
    val todays = vm.visible.filter { covers(it, T) }.sortedBy { it.s ?: -1 }
    Column(modifier.background(k.card).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
        Tx(no.kristo.kalender.cap(MN[f.monthValue - 1]) + " " + f.year, news(KType.headline, k.ink), Modifier.padding(top = 8.dp))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            for (w in 0 until nw) Row(Modifier.fillMaxWidth()) {
                for (i in 0 until 7) {
                    val d = st.plusDays(7L * w + i)
                    val td = d == T
                    val sel = d == A && !td
                    Box(Modifier.weight(1f).height(30.dp).tap(d.toString()) { Hap.tick(); vm.a = d }, contentAlignment = Alignment.Center) {
                        Box(Modifier.size(24.dp).clip(CircleShape).background(if (td) Red else Color.Transparent).border(1.5.dp, if (sel) k.ink else Color.Transparent, CircleShape), contentAlignment = Alignment.Center) {
                            Tx("${d.dayOfMonth}", man(KType.caption, FontWeight.Bold, if (td) Color.White else if (d.monthValue != f.monthValue) k.mut2 else if (d.jsDay == 0) k.sun else k.ink))
                        }
                    }
                }
            }
        }
        Label("MINE KALENDERE")
        Column {
            vm.cals.filter { !it.hidMenu }.forEach { c ->
                val on = c.id !in vm.hid
                Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).tap(c.n, Role.Switch) { vm.toggleCal(c) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(14.dp).clip(CircleShape).border(2.5.dp, c.col, CircleShape).background(if (on) c.col else Color.Transparent))
                    Tx(c.n, man(KType.callout, FontWeight.Bold, k.ink), Modifier.weight(1f))
                }
            }
        }
        Label("I DAG")
        if (todays.isEmpty()) Tx("Ingen hendelser i dag.", man(KType.subheadline, FontWeight.Medium, k.mut))
        todays.take(6).forEach { e -> EvRow43(vm, e) }
        Box(Modifier.fillMaxWidth().heightIn(min = 44.dp).tap("Innstillinger") { vm.openSettings() }, contentAlignment = Alignment.CenterStart) {
            Tx("Innstillinger ›", man(KType.subheadline, FontWeight.Bold, k.mut))
        }
        Spacer(Modifier.height(12.dp).windowInsetsPadding(WindowInsets.navigationBars))
    }
}

@Composable
private fun EvRow43(vm: KalVm, e: KEv) {
    val k = LocalK.current
    val c = vm.cal(e.cal)
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).tap(e.t) { vm.openEv(e) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.width(4.dp).height(28.dp).clip(RoundedCornerShape(2.dp)).background(c.col))
        Column(Modifier.weight(1f)) {
            Tx(e.t, man(KType.subheadline, FontWeight.Bold, k.ink))
            e.loc?.takeIf { it.isNotBlank() }?.let { Tx(it, man(KType.caption, FontWeight.Medium, k.mut)) }
        }
        Tx(e.s?.let { hm(it) } ?: "Hele dagen", mono(KType.caption, k.mut))
    }
}

/* ---------------- Dagspanelet (Full skjerm, 28 %) ---------------- */

@Composable
private fun DayPane43(vm: KalVm, modifier: Modifier) {
    val k = LocalK.current
    val d = vm.a
    val T = today()
    val list = vm.visible.filter { covers(it, d) }
    val allDay = list.filter { it.s == null }
    val timed = list.filter { it.s != null }.sortedBy { it.s }
    val first = minOf(7, timed.minOfOrNull { (it.s ?: 0) / 60 } ?: 7)
    val hourH = 48.dp
    Column(modifier.background(k.bg).padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
        Column(Modifier.padding(top = 8.dp)) {
            Tx(if (d == T) "I DAG" else "UKE " + no.kristo.kalender.wkNo35(no.kristo.kalender.wkStart35(d, vm.sun), vm.sun), mono(KType.caption, k.acc, .12f))
            Tx(WD[d.jsDay] + " " + d.dayOfMonth + ". " + MN[d.monthValue - 1], news(KType.title3, k.ink))
        }
        allDay.forEach { e ->
            val c = vm.cal(e.cal)
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(c.col.copy(alpha = .16f)).tap(e.t) { vm.openEv(e) }.padding(horizontal = 8.dp, vertical = 5.dp)) {
                Tx(e.t, man(KType.footnote, FontWeight.Bold, k.ink))
            }
        }
        if (list.isEmpty()) Tx("Ingen hendelser", man(KType.subheadline, FontWeight.Medium, k.mut))
        Box(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())) {
            Column {
                for (h in first until 24) Row(Modifier.fillMaxWidth().height(hourH), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Tx("%02d".format(h), mono(KType.caption, k.mut2), Modifier.width(22.dp))
                    Box(Modifier.weight(1f).padding(top = 6.dp).height(1.dp).background(k.line2))
                }
            }
            timed.forEach { e ->
                val s0 = e.s ?: 0
                val dur = maxOf(15, (e.e ?: (s0 + 60)) - s0)
                val c = vm.cal(e.cal)
                Column(
                    Modifier.padding(start = 30.dp).offset(y = hourH * ((s0 - first * 60) / 60f) + 6.dp).fillMaxWidth().height(maxOf(22.dp, hourH * (dur / 60f) - 2.dp))
                        .clip(RoundedCornerShape(8.dp)).background(c.col.copy(alpha = .16f)).tap(e.t) { vm.openEv(e) }.padding(horizontal = 7.dp, vertical = 4.dp),
                ) {
                    Tx(e.t, man(KType.footnote, FontWeight.Bold, k.ink))
                    Tx(hm(s0) + "–" + hm(minOf(1439, s0 + dur)) + (e.loc?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""), man(KType.caption, FontWeight.Medium, k.mut))
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(50)).background(Red).tap("Ny hendelse") { vm.openNew(d) }, contentAlignment = Alignment.Center) {
            Tx("+ Ny hendelse", man(KType.subheadline, FontWeight.Bold, Color.White))
        }
        Spacer(Modifier.height(10.dp).windowInsetsPadding(WindowInsets.navigationBars))
    }
}
