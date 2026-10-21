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
import androidx.compose.ui.unit.sp
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

/*
 * Prompt 43 (KAL43): Kalender på Fold / nettbrett (≥ 600 dp) og «Programvareoppdatering».
 * Fasit: Kalender Oppsett Stor Skjerm.dc.html (1b Galaxy Z Fold utbrettet), Kalender App.dc.html → auVals (st:'lay') og
 * Innstillinger → Generelt → «Oppsett på iPad og Fold», Kalender Oppdatering.dc.html (variant android).
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
        Tx("STEG 2 AV 2", mono(11.sp, k.acc, .14f))
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Tx("Hvordan vil du bruke skjermen?", news(30.sp, k.ink).copy(textAlign = TextAlign.Center), maxLines = 2)
            Tx("Du kan bytte når som helst i Innstillinger", man(15.sp, FontWeight.Medium, k.mut).copy(textAlign = TextAlign.Center), maxLines = 2)
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
                        Tx(n, man(16.sp, FontWeight.ExtraBold, k.ink), Modifier.weight(1f, fill = false))
                        if (id == "full") Box(Modifier.clip(RoundedCornerShape(50)).background(Red).padding(horizontal = 8.dp, vertical = 2.dp)) { Tx("Anbefalt", man(11.sp, FontWeight.Bold, Color.White)) }
                        Spacer(Modifier.weight(1f))
                        Box(Modifier.size(24.dp).clip(CircleShape).background(if (on) k.ink else Color.Transparent).border(1.5.dp, if (on) Color.Transparent else k.line, CircleShape), contentAlignment = Alignment.Center) {
                            if (on) Tx("✓", man(13.sp, FontWeight.ExtraBold, k.bg))
                        }
                    }
                    Tx(sub, man(13.5.sp, FontWeight.Medium, k.mut), maxLines = 4)
                }
            }
        }
        Column(Modifier.widthIn(max = 360.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(50)).background(k.ink).tap("Fortsett") { s.choose(s.pick) }, contentAlignment = Alignment.Center) {
                Tx("Fortsett med " + (LAYN43[s.pick] ?: "Full skjerm"), man(16.sp, FontWeight.ExtraBold, k.bg))
            }
            Box(Modifier.heightIn(min = 44.dp).tap("Hopp over") { s.choose("full") }, contentAlignment = Alignment.Center) {
                Tx("Hopp over · bruk Full skjerm", man(14.sp, FontWeight.Bold, k.mut))
            }
            Tx("Kan endres i Innstillinger → Generelt → Oppsett på iPad og Fold", man(12.5.sp, FontWeight.Medium, k.mut2).copy(textAlign = TextAlign.Center), maxLines = 2)
        }
    }
}

/** Skjematisk forhåndsvisning på kortene. */
@Composable
private fun Preview43(id: String) {
    val k = LocalK.current
    val paper = Color(0xFFFFFDF8)
    val cell = Color(0xFFE6DFD1)
    val bar = Color(0xFFECE6DA)
    @Composable
    fun month(m: Modifier) {
        Column(m.clip(RoundedCornerShape(10.dp)).background(paper).padding(5.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            for (r in 0 until 5) Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                for (c in 0 until 7) {
                    val i = r * 7 + c
                    Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(if (i == 16) Red else if (i in listOf(3, 9, 20, 24)) Color(0xFF2B5D8A) else cell))
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
                    repeat(4) { i -> Box(Modifier.fillMaxWidth().height(if (i == 1) 18.dp else 8.dp).clip(RoundedCornerShape(3.dp)).background(if (i == 1) Color(0x992B5D8A) else cell)) }
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
        Tx(no.kristo.kalender.cap(MN[f.monthValue - 1]) + " " + f.year, news(20.sp, k.ink), Modifier.padding(top = 8.dp))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            for (w in 0 until nw) Row(Modifier.fillMaxWidth()) {
                for (i in 0 until 7) {
                    val d = st.plusDays(7L * w + i)
                    val td = d == T
                    val sel = d == A && !td
                    Box(Modifier.weight(1f).height(30.dp).tap(d.toString()) { Hap.tick(); vm.a = d }, contentAlignment = Alignment.Center) {
                        Box(Modifier.size(24.dp).clip(CircleShape).background(if (td) Red else Color.Transparent).border(1.5.dp, if (sel) k.ink else Color.Transparent, CircleShape), contentAlignment = Alignment.Center) {
                            Tx("${d.dayOfMonth}", man(11.5.sp, FontWeight.Bold, if (td) Color.White else if (d.monthValue != f.monthValue) k.mut2 else if (d.jsDay == 0) k.sun else k.ink))
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
                    Tx(c.n, man(14.sp, FontWeight.Bold, k.ink), Modifier.weight(1f))
                }
            }
        }
        Label("I DAG")
        if (todays.isEmpty()) Tx("Ingen hendelser i dag.", man(13.sp, FontWeight.Medium, k.mut))
        todays.take(6).forEach { e -> EvRow43(vm, e) }
        Box(Modifier.fillMaxWidth().heightIn(min = 44.dp).tap("Innstillinger") { vm.openSettings() }, contentAlignment = Alignment.CenterStart) {
            Tx("Innstillinger ›", man(13.5.sp, FontWeight.Bold, k.mut))
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
            Tx(e.t, man(13.5.sp, FontWeight.Bold, k.ink))
            e.loc?.takeIf { it.isNotBlank() }?.let { Tx(it, man(11.5.sp, FontWeight.Medium, k.mut)) }
        }
        Tx(e.s?.let { hm(it) } ?: "Hele dagen", mono(11.sp, k.mut))
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
            Tx(if (d == T) "I DAG" else "UKE " + no.kristo.kalender.wkNo35(no.kristo.kalender.wkStart35(d, vm.sun), vm.sun), mono(10.5.sp, k.acc, .12f))
            Tx(WD[d.jsDay] + " " + d.dayOfMonth + ". " + MN[d.monthValue - 1], news(22.sp, k.ink))
        }
        allDay.forEach { e ->
            val c = vm.cal(e.cal)
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(c.col.copy(alpha = .16f)).tap(e.t) { vm.openEv(e) }.padding(horizontal = 8.dp, vertical = 5.dp)) {
                Tx(e.t, man(12.5.sp, FontWeight.Bold, k.ink))
            }
        }
        if (list.isEmpty()) Tx("Ingen hendelser", man(13.sp, FontWeight.Medium, k.mut))
        Box(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())) {
            Column {
                for (h in first until 24) Row(Modifier.fillMaxWidth().height(hourH), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Tx("%02d".format(h), mono(10.sp, k.mut2), Modifier.width(22.dp))
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
                    Tx(e.t, man(12.5.sp, FontWeight.Bold, k.ink))
                    Tx(hm(s0) + "–" + hm(minOf(1439, s0 + dur)) + (e.loc?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""), man(11.sp, FontWeight.Medium, k.mut))
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(50)).background(Red).tap("Ny hendelse") { vm.openNew(d) }, contentAlignment = Alignment.Center) {
            Tx("+ Ny hendelse", man(13.5.sp, FontWeight.Bold, Color.White))
        }
        Spacer(Modifier.height(10.dp).windowInsetsPadding(WindowInsets.navigationBars))
    }
}

/* ---------------- Programvareoppdatering (Android) ---------------- */

private fun mb(b: Long): String = "%.1f".format(b / 1_000_000.0).replace('.', ',')

/** Undertekst på raden i Innstillinger. */
fun updSub43(ctx: android.content.Context): String {
    val r = Kal43Upd.rel
    val cur = "Kalender ${Kal43Upd.versionName(ctx)} (${Kal43Upd.versionCode(ctx)})"
    return if (r != null && (Kal43Upd.phase == "avail" || Kal43Upd.phase == "ready")) "$cur · ${r.version} er klar" else cur
}

@Composable
fun UpdatePage43(vm: KalVm) {
    val k = LocalK.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val u = Kal43Upd
    BackHandler(true) { u.pageOpen = false }
    LaunchedEffect(Unit) { u.afterStart(ctx) }
    Column(Modifier.fillMaxSize().background(k.bg).tap(null) {}.verticalScroll(rememberScrollState()).padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.size(56.dp).shadow(4.dp, RoundedCornerShape(14.dp)).clip(RoundedCornerShape(14.dp)).background(Color(0xFFFFFDF8)), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.fillMaxWidth().height(17.dp).background(Red), contentAlignment = Alignment.Center) { Tx(WD[today().jsDay].take(3).uppercase(), mono(9.sp, Color.White)) }
                Tx("${today().dayOfMonth}", news(26.sp, Color(0xFF1B1A17)))
            }
            Column(Modifier.weight(1f)) {
                Tx("Programvareoppdatering", news(24.sp, k.ink), maxLines = 2)
                Tx(Kal43Upd.currentLabel(ctx), man(13.5.sp, FontWeight.Medium, k.mut))
            }
            Box(Modifier.size(44.dp).tap("Lukk") { u.pageOpen = false }, contentAlignment = Alignment.Center) { Tx("×", man(22.sp, FontWeight.Medium, k.mut)) }
        }
        @Composable
        fun card(bd: Color = k.line, w: Dp = 1.dp, body: @Composable () -> Unit) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(k.card).border(w, bd, RoundedCornerShape(18.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { body() }
        }
        when (u.phase) {
            "check" -> card { Tx("Ser etter oppdateringer …", man(14.sp, FontWeight.Bold, k.ink)) }
            "none" -> card {
                Tx("Kalender er oppdatert", man(15.sp, FontWeight.Bold, k.ink))
                Tx(Kal43Upd.currentLabel(ctx) + " er nyeste versjon.", man(14.sp, FontWeight.Medium, k.mut), maxLines = 2)
            }
            "avail" -> card(k.ink, 1.5.dp) {
                val r = u.rel
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Tx(r?.label ?: "Ny versjon", news(22.sp, k.ink), Modifier.weight(1f))
                    Tx((r?.file ?: "") + if ((r?.size ?: 0) > 0) " · " + mb(r?.size ?: 0) + " MB" else "", mono(12.sp, k.mut))
                }
                if (!r?.notes.isNullOrEmpty()) {
                    Tx("NYTT", mono(10.5.sp, Red, .12f))
                    r?.notes?.forEach { n -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Tx("•", man(14.sp, FontWeight.Bold, Red)); Tx(n, man(14.sp, FontWeight.Medium, k.ink), maxLines = 3) } }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    InkPill("Last ned", { scope.launch { u.download(ctx) } }, h = 44.dp)
                    LinePill("Senere", { u.phase = "idle" }, h = 44.dp)
                }
            }
            "dl" -> card {
                val pct = if (u.total > 0) (u.got.toFloat() / u.total).coerceIn(0f, 1f) else 0f
                Row { Tx("Laster ned " + (u.rel?.version ?: ""), man(14.sp, FontWeight.Bold, k.ink), Modifier.weight(1f)); Tx("${(pct * 100).toInt()} %", mono(13.sp, k.ink)) }
                Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(k.line2)) {
                    Box(Modifier.fillMaxWidth(pct).fillMaxHeight().background(k.ink))
                }
                Tx(mb(u.got) + " av " + (if (u.total > 0) mb(u.total) else "?") + " MB" + (if (u.speed > 0) " · " + mb(u.speed) + " MB/s" else "") + " · signatur sjekkes etterpå", man(13.sp, FontWeight.Medium, k.mut), maxLines = 2)
                LinePill("Avbryt", { u.cancelDownload() }, h = 40.dp)
            }
            "ready" -> card {
                Tx("Klar til å installere", man(15.sp, FontWeight.Bold, k.ink))
                Tx("Signaturen stemmer med den installerte appen. Android spør om du vil installere oppdateringen.", man(14.sp, FontWeight.Medium, k.mut), maxLines = 4)
                if (u.needPerm) {
                    Tx("Første gang må du tillate «Installer ukjente apper» for Kalender. Kom tilbake hit etterpå.", man(13.sp, FontWeight.Medium, k.acc), maxLines = 3)
                    LinePill("Åpne innstillingen", { Kal43Upd.openUnknownSources(ctx) }, h = 40.dp)
                }
                InkPill("Installer", { scope.launch { u.install(ctx) } }, h = 44.dp)
            }
            "inst" -> card { Tx("Installerer …", man(14.sp, FontWeight.Bold, k.ink)) }
            "done" -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color(0x1A2F6B4A)).border(1.dp, Color(0x592F6B4A), RoundedCornerShape(18.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Tx("✓ Kalender er oppdatert til ${Kal43Upd.versionName(ctx)} (${Kal43Upd.versionCode(ctx)})", man(15.sp, FontWeight.Bold, Color(0xFF2F6B4A)), maxLines = 2)
                Tx("Kalenderne, innstillingene og innloggingen er beholdt.", man(14.sp, FontWeight.Medium, k.mut), maxLines = 2)
            }
            "err" -> card {
                Tx(u.msg.ifBlank { "Noe gikk galt." }, man(14.sp, FontWeight.Bold, k.acc), maxLines = 4)
                InkPill("Prøv igjen", { scope.launch { u.check(ctx) } }, h = 44.dp)
            }
            else -> card {
                val last = no.kristo.kalender.Kal43Prefs.lastCheck(ctx)
                val tail = if (no.kristo.kalender.Kal43Prefs.auto(ctx)) "ser etter nye versjoner hver dag" else "automatisk sjekk er av"
                val lt = if (last <= 0) "Ikke sjekket ennå" else java.time.Instant.ofEpochMilli(last).atZone(no.kristo.kalender.OSLO).let { z ->
                    (if (z.toLocalDate() == today()) "Sist sjekket i dag " else "Sist sjekket ${z.dayOfMonth}.${z.monthValue}. ") + "%02d:%02d".format(z.hour, z.minute)
                }
                Tx("$lt · $tail", man(14.sp, FontWeight.Medium, k.mut), maxLines = 2)
                InkPill("Se etter oppdateringer", { scope.launch { u.check(ctx) } }, h = 44.dp)
            }
        }
        // Innstillinger i samme vindu.
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(18.dp))) {
            val p = no.kristo.kalender.Kal43Prefs
            // Bryterne leser SharedPreferences; telleren tegner raden på nytt etter et trykk.
            var tick by remember { mutableIntStateOf(0) }
            val seen = tick
            ToggleRow43("Se etter oppdateringer automatisk", "Én gang om dagen fra home.kristo.no", p.auto(ctx)) { p.setAuto(ctx, !p.auto(ctx)); Kal43Upd.schedule(ctx); tick++ }
            ToggleRow43("Last ned i bakgrunnen på Wi-Fi", "Du trykker bare Installer når den er klar", p.autoDl(ctx)) { p.setAutoDl(ctx, !p.autoDl(ctx)); Kal43Upd.schedule(ctx); tick++ }
            Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Tx("Kanal", man(15.sp, FontWeight.Bold, k.ink), Modifier.weight(1f))
                Row(Modifier.clip(RoundedCornerShape(12.dp)).background(k.bg).border(1.dp, k.line, RoundedCornerShape(12.dp)).padding(3.dp)) {
                    listOf("stabil" to "Stabil", "beta" to "Beta").forEach { (id, n) ->
                        val on = p.channel(ctx) == id
                        Box(Modifier.height(36.dp).clip(RoundedCornerShape(9.dp)).background(if (on) k.ink else Color.Transparent).tap(n, Role.RadioButton) {
                            Hap.tick(); p.setChannel(ctx, id); if (u.phase != "dl" && u.phase != "inst") u.phase = "idle"; tick++
                        }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) { Tx(n, man(13.sp, FontWeight.Bold, if (on) k.bg else k.ink)) }
                    }
                }
            }
        }
        Spacer(Modifier.height(24.dp).windowInsetsPadding(WindowInsets.navigationBars))
    }
}

@Composable
private fun ToggleRow43(n: String, sub: String, on: Boolean, onClick: () -> Unit) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).tap(n, Role.Switch) { Hap.tick(); onClick() }.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Tx(n, man(15.sp, FontWeight.Bold, k.ink), maxLines = 2)
            Tx(sub, man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 2)
        }
        Toggle(on)
    }
}
