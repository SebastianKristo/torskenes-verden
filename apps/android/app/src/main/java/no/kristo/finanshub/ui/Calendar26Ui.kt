package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

/*
 * Prompt 26 (ANDROID-A): Kalender-siden (design/Kalender.dc.html, variant «mobile»), åpnes fra Mer → Kalender,
 * Hjem-kortet KALENDER og widgetene (finanshub://kalender). Kortene fyller hele bredden. Hold inne et kort (0,5 s)
 * for rediger-modus: ▲ ▼ flytter, − skjuler, «SKJULT · + …» henter tilbake, Tilbakestill og Ferdig.
 * Uke og Måned byttes med sveip til venstre/høyre.
 */

private val NOW_KICK = Color(0xFFFF9C8C)

/** Hold inne (0,5 s) uten å flytte fingeren: resten av berøringen slukes, så kortet under ikke får et trykk. */
private fun Modifier.kalHold(enabled: Boolean, onLong: () -> Unit): Modifier = if (!enabled) this else this.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val ended = withTimeoutOrNull(500L) {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                if (!ch.pressed) break
                if ((ch.position - down.position).getDistance() > viewConfiguration.touchSlop) break
            }
            true
        }
        if (ended == null) {
            onLong()
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                ev.changes.forEach { it.consume() }
                if (ev.changes.none { it.pressed }) break
            }
        }
    }
}

/** Stiplet ramme (rediger-modus og skjulte kort). outset = hvor langt utenfor kortet. */
private fun Modifier.kalDashed(color: Color, radius: Dp, outset: Dp = 0.dp, width: Dp = 2.dp): Modifier = this.drawBehind {
    val o = outset.toPx()
    drawRoundRect(
        color, topLeft = Offset(-o, -o), size = Size(size.width + 2 * o, size.height + 2 * o), cornerRadius = CornerRadius(radius.toPx() + o),
        style = Stroke(width.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))),
    )
}

@Composable
private fun KMono(text: String, color: Color, size: TextUnit = 10.5.sp, modifier: Modifier = Modifier, spacing: TextUnit = 1.3.sp) =
    Text(text, color = color, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = size, letterSpacing = spacing, maxLines = 1,
        overflow = TextOverflow.Ellipsis, modifier = modifier)

/** Minuttet nå (oppdateres hvert minutt). */
@Composable
private fun rememberMinute(): LocalDateTime {
    var now by remember { mutableStateOf(LocalDateTime.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000L - (LocalDateTime.now().second * 1000L) + 200L)
            now = LocalDateTime.now()
        }
    }
    return now
}

private fun AppViewModel.openKalSettings26() {
    kal26.open = false
    openPaperPage("set")
    // Innstillinger → Kalendere (siden «kal» er laget av ANDROID-B, Settings26B.kt).
    settingsPage = "kal"
}

private fun kalKicker(d: LocalDate): String = "Skole · " + (if (d.monthValue >= 8) "høst " else "vår ") + d.year

/* ---------------- Siden ---------------- */

@Composable
internal fun KalenderScreen26(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.kal26
    BackHandler { vm.closeKal26() }
    val now = rememberMinute()
    val today = now.toLocalDate()
    val evs = s.events ?: emptyList()
    // Vinduet som vises hentes ved behov (bla langt fram eller tilbake).
    LaunchedEffect(s.view, s.off) {
        val (a, b) = kalWindow(s.view, s.off, today)
        vm.loadKal26(quiet = true, from = a, to = b)
    }
    val vis = s.order.filter { it !in s.hiddenCards }
    Box(Modifier.fillMaxSize().background(p.bg)) {
        LazyColumn(
            Modifier.fillMaxSize(), contentPadding = PaddingValues(0.dp, 0.dp, 0.dp, 40.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item(key = "hero") { ModuleHero(kalKicker(today), "Kalender", "‹ Mer") { s.edit = false; s.open = false } }
            if (s.edit) item(key = "hid") { KalHiddenRow(vm) }
            s.error?.let { e -> item(key = "err") { Text(e, color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp)) } }
            if (s.unavailable) item(key = "na") {
                Text("Serveren har ikke Kalender ennå. Oppdater Homelab-serveren for å se timeplanen.", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 20.dp))
            }
            vis.forEachIndexed { i, k ->
                item(key = "k-$k") {
                    KalEditWrap(vm, k, i, vis.size) {
                        when (k) {
                            "now" -> KalNowCard(vm, kalNow(evs, now, s.subjectColors))
                            "exams" -> KalExamsCard(vm, evs, today)
                            "cals" -> KalCalsLink(vm)
                            "cal" -> KalCalendarCard(vm, evs, now)
                            "widgets" -> KalWidgetsCard(kalWidget(evs, now, s.subjectColors))
                        }
                    }
                }
            }
        }
        if (s.edit) KalEditPill(vm, Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(start = 16.dp, end = 16.dp, top = 8.dp))
        vm.message?.let { m ->
            Box(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 16.dp).shadow(12.dp, CircleShape).clip(CircleShape).background(p.ink).padding(16.dp, 10.dp)) {
                Text(m, color = p.bg, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
            }
        }
    }
}

/** Datoene som trengs for visningen: uka, månedsrutenettet (6 uker) eller agendaens tre uker. */
private fun kalWindow(view: String, off: Int, today: LocalDate): Pair<LocalDate, LocalDate> = when (view) {
    "maaned" -> {
        val m0 = today.withDayOfMonth(1).plusMonths(off.toLong())
        val st = m0.minusDays((m0.dayOfWeek.value - 1).toLong())
        st to st.plusDays(42)
    }
    "agenda" -> today.plusDays(off * 7L).let { it to it.plusDays(21) }
    else -> kalWeekStart(today, off).let { it.minusDays(1) to it.plusDays(7) }
}

/** Mandagen i uka som vises. I helgen (uten bla) vises neste uke. */
private fun kalWeekStart(today: LocalDate, off: Int): LocalDate {
    var b = today
    val wd = b.dayOfWeek.value
    if (off == 0 && wd >= 6) b = b.plusDays((8 - wd).toLong())
    return b.minusDays((b.dayOfWeek.value - 1).toLong()).plusWeeks(off.toLong())
}

/* ---------------- Rediger-modus ---------------- */

@Composable
private fun KalEditPill(vm: AppViewModel, modifier: Modifier) {
    val p = PaperPal.current
    Row(
        modifier.fillMaxWidth().shadow(16.dp, CircleShape).clip(CircleShape).background(p.ink).padding(start = 16.dp, top = 6.dp, end = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Flytt med ▲ ▼ · skjul med −", color = p.bg, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Box(Modifier.height(34.dp).clip(CircleShape).press24 { vm.resetKalCards26() }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            Text("Tilbakestill", color = p.bg, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
        Box(Modifier.height(34.dp).clip(CircleShape).background(p.bg).press24 { Haptics.success(); vm.kal26.edit = false }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
            Text("Ferdig", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    }
}

/** Plass til pillen øverst, og «SKJULT · + Nå-kort …» for å hente tilbake skjulte kort. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun KalHiddenRow(vm: AppViewModel) {
    val p = PaperPal.current
    val hid = KAL_CARDS.filter { it in vm.kal26.hiddenCards }
    Column(Modifier.padding(horizontal = 16.dp).padding(top = 34.dp)) {
        if (hid.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(2.dp, 4.dp)) {
            KMono("SKJULT", p.mut, modifier = Modifier.align(Alignment.CenterVertically))
            hid.forEach { k ->
                Box(
                    Modifier.height(32.dp).kalDashed(p.line, 16.dp, width = 1.5.dp).clip(RoundedCornerShape(16.dp)).background(p.card).press24 { vm.showKalCard26(k) }.padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("+ " + (KAL_CARD_NAMES[k] ?: k), color = p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1) }
            }
        }
    }
}

@Composable
private fun KalEditWrap(vm: AppViewModel, key: String, index: Int, count: Int, content: @Composable () -> Unit) {
    val p = PaperPal.current
    val s = vm.kal26
    val edit = s.edit
    Box(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .then(if (edit) Modifier.graphicsLayer { scaleX = .985f; scaleY = .985f }.kalDashed(p.line, 24.dp, outset = 5.dp) else Modifier)
            .kalHold(!edit) { Haptics.tap(); s.sel = null; s.edit = true },
    ) {
        content()
        if (edit) {
            // Trykk på innholdet er sperret mens du redigerer.
            Box(Modifier.matchParentSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {})
            Row(Modifier.align(Alignment.TopEnd).offset(x = 4.dp, y = (-10).dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                KalDot("▲", p.ink, p.bg, index > 0, "Flytt opp") { vm.moveKalCard26(key, -1) }
                KalDot("▼", p.ink, p.bg, index < count - 1, "Flytt ned") { vm.moveKalCard26(key, 1) }
                KalDot("−", Color(KAL_LAB), Color.White, count > 1, "Skjul kortet", big = true) { vm.hideKalCard26(key) }
            }
        }
    }
}

@Composable
private fun KalDot(t: String, bg: Color, fg: Color, on: Boolean, label: String, big: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier.size(32.dp).shadow(6.dp, CircleShape).clip(CircleShape).background(bg).alpha(if (on) 1f else .35f).press24(enabled = on, onClick = onClick)
            .then(Modifier.semanticsLabel(label)),
        contentAlignment = Alignment.Center,
    ) { Text(t, color = fg, fontSize = if (big) 16.sp else 11.sp, fontWeight = FontWeight.Bold) }
}

private fun Modifier.semanticsLabel(label: String): Modifier = this.semantics { contentDescription = label }

/* ---------------- Nå-kortet ---------------- */

@Composable
private fun KalNowCard(vm: AppViewModel, n: KalNow) {
    val p = PaperPal.current
    val shape = RoundedCornerShape(24.dp)
    Column(
        Modifier.fillMaxWidth().shadow(14.dp, shape, ambientColor = Color.Black.copy(alpha = .4f), spotColor = Color.Black.copy(alpha = .4f))
            .clip(shape).background(p.ink).press24 { n.ev?.let { vm.kal26.sel = it } }.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            KMono(n.k, NOW_KICK, modifier = Modifier.weight(1f))
            KMono(n.whenText, p.bg.copy(alpha = .75f), 11.sp, spacing = 0.sp)
        }
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.width(6.dp).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(Color(n.color)))
            Column(Modifier.weight(1f)) {
                PSerif(n.title, 30.sp, p.bg, maxLines = 2)
                if (n.sub.isNotBlank()) Text(n.sub, color = p.bg.copy(alpha = .85f), fontSize = 13.5.sp)
            }
        }
        n.pct?.let { f ->
            Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(Color.White.copy(alpha = .18f))) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(f.coerceIn(0f, 1f)).background(NOW_KICK))
            }
        }
        if (n.next.isNotBlank()) Column {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .16f)))
            Text(n.next, color = p.bg.copy(alpha = .85f), fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

/* ---------------- Prøver og frister ---------------- */

@Composable
private fun KalExamsCard(vm: AppViewModel, evs: List<Kal26Ev>, today: LocalDate) {
    val p = PaperPal.current
    val s = vm.kal26
    val ex = kalExams(evs, today)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 4.dp)) {
            KMono("PRØVER OG FRISTER", p.lab, modifier = Modifier.weight(1f))
            KMono("${ex.size}", p.mut)
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(horizontal = 14.dp, vertical = 2.dp)) {
            if (ex.isEmpty()) Text(if (s.events == null) "Henter …" else "Ingen kommende prøver eller frister.", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(vertical = 16.dp))
            ex.forEachIndexed { i, e ->
                val dd = kalDaysTo(e.date, today)
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 58.dp).press24 { s.sel = e; s.view = "agenda"; s.off = 0 }.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.width(44.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${e.date.dayOfMonth}", color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 24.sp, lineHeight = 24.sp)
                        KMono(BD_MS[e.date.monthValue - 1].uppercase(), p.mut, 9.5.sp, Modifier.padding(top = 3.dp), spacing = .8.sp)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(e.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            listOfNotNull(kalCap(BD_WD[e.date.dayOfWeek.value - 1]), if (e.type == "innl") "frist " + e.eText.ifBlank { "23:59" } else e.timeText, e.room?.takeIf { it.isNotBlank() }).joinToString(" · "),
                            color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    val red = dd <= 7
                    Box(Modifier.clip(CircleShape).background(if (red) Color(KAL_LAB) else p.bg).padding(horizontal = 9.dp, vertical = 4.dp)) {
                        Text(kalIn(dd), color = if (red) Color.White else p.ink, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}

/* ---------------- Kalendere-lenken ---------------- */

@Composable
private fun KalCalsLink(vm: AppViewModel) {
    val p = PaperPal.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).press24 { vm.openKalSettings26() }.padding(16.dp, 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text("Kalendere", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Text("Skolens iCal · Google Kalender · Bursdager", color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text("Innstillinger ›", color = p.mut, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

/* ---------------- Kalenderen: Uke · Måned · Agenda ---------------- */

@Composable
private fun KalCalendarCard(vm: AppViewModel, evs: List<Kal26Ev>, now: LocalDateTime) {
    val p = PaperPal.current
    val s = vm.kal26
    val today = now.toLocalDate()
    val hid = s.hiddenFilters
    val day: (LocalDate) -> List<Kal26Ev> = { d -> kalDay(evs, d, hid) }
    // Tittel og undertittel i navigasjonen, og om «I dag» er aktiv.
    var navT = ""
    var navS = ""
    var isToday = s.off == 0
    val ws = kalWeekStart(today, s.off)
    val m0 = today.withDayOfMonth(1).plusMonths(s.off.toLong())
    val selK = s.day?.takeIf { it.year == m0.year && it.monthValue == m0.monthValue } ?: if (s.off == 0) today else m0
    when (s.view) {
        "maaned" -> {
            navT = kalCap(BD_MN[m0.monthValue - 1]) + " " + m0.year
            navS = "Uke ${kalIsoWeek(m0)}–${kalIsoWeek(m0.withDayOfMonth(m0.lengthOfMonth()))}"
            isToday = s.off == 0 && selK == today
        }
        "agenda" -> {
            val a0 = today.plusDays(s.off * 7L); val a1 = a0.plusDays(20)
            navT = "${a0.dayOfMonth}. ${BD_MS[a0.monthValue - 1]} – ${a1.dayOfMonth}. ${BD_MS[a1.monthValue - 1]}"
            navS = "Tre uker fremover"
        }
        else -> {
            val fri = ws.plusDays(4)
            navT = "Uke ${kalIsoWeek(ws)}"
            navS = "${ws.dayOfMonth}." + (if (ws.monthValue != fri.monthValue) " " + BD_MS[ws.monthValue - 1] else "") + "–${fri.dayOfMonth}. ${BD_MN[fri.monthValue - 1]} ${fri.year}"
        }
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // Uke · Måned · Agenda
        Row(Modifier.fillMaxWidth().clip(CircleShape).background(p.card).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("uke" to "Uke", "maaned" to "Måned", "agenda" to "Agenda").forEach { (k, n) ->
                val on = s.view == k
                Box(Modifier.weight(1f).height(38.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).press24 { vm.setKalView26(k) }, contentAlignment = Alignment.Center) {
                    Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1)
                }
            }
        }
        // ‹ Uke 43 › I dag
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KalRound("‹", "Forrige") { s.off -= 1; s.sel = null }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                PSerif(navT, 21.sp, maxLines = 1)
                Text(navS, color = p.mut, fontSize = 12.sp, maxLines = 1)
            }
            KalRound("›", "Neste") { s.off += 1; s.sel = null }
            Box(
                Modifier.height(38.dp).clip(RoundedCornerShape(19.dp)).background(if (isToday) p.card else Color(KAL_LAB))
                    .press24 { s.off = 0; s.day = null; s.sel = null }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text("I dag", color = if (isToday) p.mut else Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        }
        // Filter: Timeplan · Prøver og frister · Bursdager · Skole
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            KAL_FILTERS.forEach { (k, n, c) ->
                val off = k in hid
                Row(
                    Modifier.height(32.dp).alpha(if (off) .5f else 1f).clip(RoundedCornerShape(16.dp)).border(1.dp, p.line, RoundedCornerShape(16.dp))
                        .background(if (off) Color.Transparent else p.card).press24 { vm.toggleKalFilter26(k) }.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Box(Modifier.size(9.dp).clip(CircleShape).background(c?.let { Color(it) } ?: p.ink))
                    Text(n, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
                }
            }
        }
        s.sel?.let { KalDetail(vm, it) }
        // Sveip til venstre/høyre bytter uke, måned eller tre uker.
        Box(Modifier.fillMaxWidth().pointerInput(s.view) {
            var dx = 0f
            detectHorizontalDragGestures(onDragStart = { dx = 0f }, onDragEnd = {
                val lim = 60.dp.toPx()
                if (dx < -lim) { s.off += 1; s.sel = null; Haptics.select() } else if (dx > lim) { s.off -= 1; s.sel = null; Haptics.select() }
            }) { ch, d -> dx += d; ch.consume() }
        }) {
            when (s.view) {
                "maaned" -> KalMonth(vm, day, today, m0, selK)
                "agenda" -> KalAgenda(vm, day, today, today.plusDays(s.off * 7L))
                else -> KalWeek(vm, day, now, ws)
            }
        }
        Text("Timeplanen hentes fra skolens iCal-lenke og oppdateres hver time. Trykk på en time for rom, lærer og påminnelse.",
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
private fun KalRound(t: String, label: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(38.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).background(p.card).press24 { Haptics.select(); onClick() }.semanticsLabel(label), contentAlignment = Alignment.Center) {
        Text(t, color = p.ink, fontSize = 17.sp)
    }
}

/** Rad i Måned-listen og Agenda: tid, fargestripe, tittel, rom · lærer og PRØVE / FRIST. */
@Composable
private fun KalItem(vm: AppViewModel, e: Kal26Ev, top: Boolean) {
    val p = PaperPal.current
    val c = Color(kalColor(e, vm.kal26.subjectColors))
    if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).height(IntrinsicSize.Min).press24 { vm.kal26.sel = if (vm.kal26.sel?.id == e.id) null else e }.padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(e.timeText, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 12.sp, maxLines = 2, modifier = Modifier.width(72.dp))
        Box(Modifier.width(4.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(c))
        Column(Modifier.weight(1f)) {
            Text(e.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val r = kalRoomTeacher(e)
            if (r.isNotBlank()) Text(r, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (e.isExam) Box(Modifier.clip(CircleShape).background(c).padding(horizontal = 8.dp, vertical = 3.dp)) {
            Text(if (e.type == "prove") "PRØVE" else "FRIST", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 10.5.sp)
        }
    }
}

/* ---------------- Uke ---------------- */

private const val S0 = 8 * 60
private const val S1 = 16 * 60

@Composable
private fun KalWeek(vm: AppViewModel, day: (LocalDate) -> List<Kal26Ev>, now: LocalDateTime, ws: LocalDate) {
    val p = PaperPal.current
    val s = vm.kal26
    val today = now.toLocalDate()
    val nm = now.hour * 60 + now.minute
    val hh = 48.dp
    val gridH = hh * ((S1 - S0) / 60)
    val days = (0 until 5).map { ws.plusDays(it.toLong()) }
    val lists = days.map(day)
    fun out(e: Kal26Ev) = e.sMin != null && e.type != "innl" && ((e.eMin ?: e.sMin!!) <= S0 || e.sMin!! >= S1)
    fun allOf(l: List<Kal26Ev>) = l.filter { it.sMin == null || it.type == "innl" || out(it) }
    val hasAll = lists.any { allOf(it).isNotEmpty() }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(start = 6.dp, top = 12.dp, end = 10.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Spacer(Modifier.width(30.dp))
            days.forEachIndexed { i, d ->
                val isT = d == today
                Column(Modifier.weight(1f).press24 {
                    vm.setKalView26("maaned")
                    s.day = d
                    s.off = ((d.year - today.year) * 12 + d.monthValue - today.monthValue)
                }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    KMono(KAL_WS[i], p.mut, 10.sp, spacing = .8.sp)
                    Box(Modifier.size(30.dp).clip(CircleShape).background(if (isT) Color(KAL_LAB) else Color.Transparent), contentAlignment = Alignment.Center) {
                        Text("${d.dayOfMonth}", color = if (isT) Color.White else p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 17.sp)
                    }
                }
            }
        }
        if (hasAll) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("HELE", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.sp, textAlign = TextAlign.End, modifier = Modifier.width(30.dp).padding(top = 5.dp))
            lists.forEach { l ->
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    allOf(l).forEach { e ->
                        val t = when { e.type == "innl" -> "⚑ " + e.title; out(e) -> e.sText + " " + e.title; else -> e.title }
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(7.dp)).background(Color(kalColor(e, s.subjectColors))).press24 { s.sel = if (s.sel?.id == e.id) null else e }.padding(5.dp, 3.dp)) {
                            Text(t, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().height(gridH), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(Modifier.width(30.dp).fillMaxHeight()) {
                for (h in 8..16) Text("%02d".format(h), color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 10.sp, textAlign = TextAlign.End,
                    modifier = Modifier.fillMaxWidth().offset(y = hh * (h - 8) - 7.dp).padding(end = 2.dp))
            }
            days.forEachIndexed { i, d ->
                val isT = d == today
                Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(10.dp)).background(if (isT) Color(KAL_LAB).copy(alpha = .06f) else Color.Transparent)) {
                    for (h in 8..16) Box(Modifier.fillMaxWidth().offset(y = hh * (h - 8)).height(1.dp).background(p.line.copy(alpha = .6f)))
                    lists[i].filter { it.sMin != null && it.type != "innl" && !out(it) }.forEach { e ->
                        val a = maxOf(S0, e.sMin!!)
                        val b = minOf(S1, e.eMin ?: (e.sMin!! + 45))
                        val pr = e.type == "prove"
                        val cc = Color(kalColor(e, s.subjectColors))
                        val sel = s.sel?.id == e.id
                        val ht = maxOf(22.dp, hh * ((b - a) / 60f) - 2.dp)
                        Row(
                            Modifier.offset(y = hh * ((a - S0) / 60f)).fillMaxWidth().height(ht).padding(horizontal = 2.dp).clip(RoundedCornerShape(7.dp))
                                .background(if (pr) cc else lerp(p.card, cc, .15f)).then(if (sel) Modifier.border(2.dp, p.ink, RoundedCornerShape(7.dp)) else Modifier)
                                .press24 { s.sel = if (sel) null else e },
                        ) {
                            Box(Modifier.width(3.dp).fillMaxHeight().background(cc))
                            Column(Modifier.padding(start = 4.dp, top = 3.dp, end = 4.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                Text(kalShort(e), color = if (pr) Color.White else p.ink, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp, lineHeight = 12.6.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                val r = if (pr) listOfNotNull(e.room, "PRØVE").joinToString(" · ") else e.room.orEmpty()
                                if (r.isNotBlank()) Text(r, color = (if (pr) Color.White else p.ink).copy(alpha = .8f), fontWeight = FontWeight.SemiBold, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                    if (isT && nm in S0..S1) {
                        val y = hh * ((nm - S0) / 60f)
                        Box(Modifier.fillMaxWidth().offset(y = y - 1.dp).height(2.dp).background(Color(KAL_LAB)))
                        Box(Modifier.offset(x = 0.dp, y = y - 4.dp).size(8.dp).clip(CircleShape).background(Color(KAL_LAB)))
                    }
                }
            }
        }
    }
}

/* ---------------- Måned ---------------- */

@Composable
private fun KalMonth(vm: AppViewModel, day: (LocalDate) -> List<Kal26Ev>, today: LocalDate, m0: LocalDate, selK: LocalDate) {
    val p = PaperPal.current
    val s = vm.kal26
    val st = m0.minusDays((m0.dayOfWeek.value - 1).toLong())
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                KAL_WS.forEach { t -> KMono(t, p.mut, 10.sp, Modifier.weight(1f).padding(top = 2.dp, bottom = 6.dp).wrapContentWidth(Alignment.CenterHorizontally), spacing = .8.sp) }
            }
            for (w in 0 until 6) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                for (i in 0 until 7) {
                    val d = st.plusDays((w * 7 + i).toLong())
                    val inM = d.monthValue == m0.monthValue
                    val l = day(d)
                    val isT = d == today
                    val sl = d == selK
                    val cs = l.filter { it.type != "time" }.map { kalColor(it, s.subjectColors) }.distinct().take(3).map { Color(it) }.toMutableList()
                    if (l.any { it.type == "time" } && cs.size < 3) cs += p.line
                    Column(
                        Modifier.weight(1f).height(52.dp).alpha(if (inM) 1f else .38f).clip(RoundedCornerShape(12.dp)).background(if (sl) p.bg else Color.Transparent)
                            .then(if (sl) Modifier.border(1.5.dp, p.ink, RoundedCornerShape(12.dp)) else Modifier)
                            .press24 { s.day = d; s.sel = null }.padding(top = 5.dp),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(if (isT) Color(KAL_LAB) else Color.Transparent), contentAlignment = Alignment.Center) {
                            Text("${d.dayOfMonth}", color = when { isT -> Color.White; d.dayOfWeek.value >= 6 -> p.mut; else -> p.ink }, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 16.sp)
                        }
                        Row(Modifier.height(6.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                            cs.forEach { c -> Box(Modifier.size(6.dp).clip(CircleShape).background(c)) }
                        }
                    }
                }
            }
        }
        val list = day(selK)
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            KMono((if (selK == today) "I DAG · " else "") + kalLong(selK).uppercase(), p.lab, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 4.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(horizontal = 14.dp, vertical = 2.dp)) {
                list.forEachIndexed { i, e -> KalItem(vm, e, i > 0) }
                if (list.isEmpty()) Text("Ingenting denne dagen.", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(vertical = 16.dp))
            }
        }
    }
}

/* ---------------- Agenda ---------------- */

@Composable
private fun KalAgenda(vm: AppViewModel, day: (LocalDate) -> List<Kal26Ev>, today: LocalDate, a0: LocalDate) {
    val p = PaperPal.current
    val groups = (0 until 21).map { a0.plusDays(it.toLong()) }.map { it to day(it) }.filter { it.second.isNotEmpty() }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (groups.isEmpty()) Text(if (vm.kal26.events == null) "Henter …" else "Ingenting de neste tre ukene.", color = p.mut, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 4.dp))
        groups.forEach { (d, l) ->
            val isT = d == today
            val tm = d == today.plusDays(1)
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 4.dp)) {
                    KMono((if (isT) "I DAG · " else if (tm) "I MORGEN · " else "") + kalLong(d).uppercase(), if (isT) p.lab else p.ink, modifier = Modifier.weight(1f))
                    KMono("${l.size}", p.mut)
                }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(horizontal = 14.dp, vertical = 2.dp)) {
                    l.forEachIndexed { i, e -> KalItem(vm, e, i > 0) }
                }
            }
        }
    }
}

/* ---------------- Detaljkortet ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun KalDetail(vm: AppViewModel, e: Kal26Ev) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.kal26
    val c = Color(kalColor(e, s.subjectColors))
    val rem = s.reminderFor(e)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).border(1.5.dp, c, RoundedCornerShape(22.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.width(6.dp).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(c))
            Column(Modifier.weight(1f)) {
                KMono(when (e.type) { "time" -> "TIME"; "prove" -> "PRØVE"; "innl" -> "INNLEVERING"; "bursdag" -> "BURSDAG"; else -> "SKOLE" }, c)
                PSerif(e.title, 26.sp, modifier = Modifier.padding(top = 2.dp))
                Text(kalCap(kalLong(e.date)) + " · " + e.timeText, color = p.mut, fontSize = 13.5.sp, modifier = Modifier.padding(top = 4.dp))
            }
            Box(Modifier.size(34.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).press24 { s.sel = null }.semanticsLabel("Lukk"), contentAlignment = Alignment.Center) {
                Text("×", color = p.ink, fontSize = 16.sp)
            }
        }
        listOfNotNull(
            e.room?.takeIf { it.isNotBlank() }?.let { "Rom" to it },
            e.teacher?.takeIf { it.isNotBlank() }?.let { "Lærer" to it },
            e.subject?.takeIf { e.type != "time" && it.isNotBlank() }?.let { "Fag" to it },
            e.note?.takeIf { it.isNotBlank() }?.let { "Merknad" to it },
        ).forEach { (a, b) ->
            Column {
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(a, color = p.mut, fontSize = 14.sp)
                    Text(b, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                }
            }
        }
        Text("Påminnelse", color = p.mut, fontSize = 12.5.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            KAL_REMS.forEach { (v, n) ->
                val on = rem == v
                Box(
                    Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(16.dp)).background(if (on) p.ink else Color.Transparent)
                        .press24 { vm.setKalReminder26(e, v) }.padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1) }
            }
        }
        val room = e.room?.trim().orEmpty()
        val hasMap = e.mazemap != null || (room.isNotEmpty() && !room.equals("Canvas", true) && !room.startsWith("http"))
        if (hasMap) Box(
            Modifier.height(38.dp).clip(RoundedCornerShape(19.dp)).border(1.dp, p.line, RoundedCornerShape(19.dp)).press24 { openLink(ctx, e.mazemap ?: "https://use.mazemap.com/") }.padding(horizontal = 16.dp),
            contentAlignment = Alignment.Center,
        ) { Text("Finn rommet i MazeMap ↗", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        e.url?.takeIf { it.startsWith("http") }?.let { u ->
            Text(if (e.source == "canvas") "Åpne i Canvas ↗" else "Åpne ↗", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.press24 { openLink(ctx, u) })
        }
    }
}

/* ---------------- Widgets på telefonen (forhåndsvisning) ---------------- */

private class KalPlat(
    val n: String, val bg: Color, val fg: Color, val mut: Color, val acc: Color, val rad: Dp,
    val s: Pair<Dp, Dp>, val m: Pair<Dp, Dp>, val l: Pair<Dp, Dp>, val line: Color, val labels: List<String>,
)

private val KAL_PLATS = listOf(
    KalPlat("iPhone · WidgetKit", Color.White.copy(alpha = .95f), Color(0xFF1B1A17), Color(0xFF7A7468), Color(0xFFB23A2A), 24.dp,
        158.dp to 158.dp, 338.dp to 158.dp, 338.dp to 354.dp, Color.Black.copy(alpha = .08f), listOf("Liten", "Medium", "Stor")),
    KalPlat("Android · Material You", Color(0xFFF4DDD8), Color(0xFF3B0F0A), Color(0xFF7D4A43), Color(0xFFB23A2A), 28.dp,
        170.dp to 170.dp, 350.dp to 170.dp, 350.dp to 350.dp, Color(0x243B0F0A), listOf("2 × 2", "4 × 2", "4 × 4")),
    KalPlat("Samsung One UI", Color.White, Color(0xFF111111), Color(0xFF6B6B6B), Color(0xFFB23A2A), 20.dp,
        134.dp to 155.dp, 296.dp to 155.dp, 296.dp to 330.dp, Color.Black.copy(alpha = .08f), listOf("2 × 2", "4 × 2", "4 × 4")),
)

@Composable
private fun WT(text: String, color: Color, size: TextUnit, weight: FontWeight = FontWeight.Bold, modifier: Modifier = Modifier) =
    Text(text, color = color, fontSize = size, fontWeight = weight, fontFamily = FontFamily.Default, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun KalWidgetsCard(w: KalW) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        KMono("WIDGETS PÅ TELEFONEN", p.lab, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 6.dp))
        KAL_PLATS.forEach { P ->
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Brush.linearGradient(listOf(Color(0xFF6D7F8F), Color(0xFF2E3A46)))).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(P.n, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    WPrevBox(P.labels[0]) { WSmall(P, w) }
                    WPrevBox(P.labels[1]) { WMedium(P, w) }
                    WPrevBox(P.labels[2]) { WLarge(P, w) }
                }
            }
        }
        Text("Liten viser neste time, medium også de tre neste, og stor hele dagen og de neste prøvene. Trykk åpner Kalender." +
            (if (no.kristo.finanshub.widget.S24.isSamsung) " På denne telefonen finnes «Kalender · Samsung» i Samsungs egen størrelse." else ""),
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
private fun WPrevBox(label: String, content: @Composable () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        content()
        Text(label, color = Color.White.copy(alpha = .85f), fontWeight = FontWeight.Bold, fontSize = 11.sp)
    }
}

private fun Modifier.wCard(P: KalPlat, size: Pair<Dp, Dp>, pad: Dp): Modifier =
    this.widthIn(max = size.first).height(size.second).shadow(10.dp, RoundedCornerShape(P.rad)).clip(RoundedCornerShape(P.rad)).background(P.bg).padding(pad)

@Composable
private fun WSmall(P: KalPlat, w: KalW) {
    Column(Modifier.width(P.s.first).wCard(P, P.s, 14.dp)) {
        WT(w.k, P.acc, 10.sp, FontWeight.ExtraBold)
        Text(w.big, color = P.fg, fontSize = 30.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(top = 6.dp))
        Spacer(Modifier.weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(Modifier.size(4.dp, 32.dp).clip(RoundedCornerShape(2.dp)).background(Color(w.color)))
            Column { WT(w.title, P.fg, 14.sp); WT(w.sub, P.mut, 11.5.sp, FontWeight.Normal) }
        }
        WT(w.whenText, P.acc, 11.sp, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
private fun WMedium(P: KalPlat, w: KalW) {
    Row(Modifier.fillMaxWidth().wCard(P, P.m, 14.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.weight(.9f).fillMaxHeight()) {
            WT(w.k, P.acc, 10.sp, FontWeight.ExtraBold)
            Text(w.big, color = P.fg, fontSize = 28.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(top = 6.dp))
            Spacer(Modifier.weight(1f))
            WT(w.title, P.fg, 14.sp)
            WT(w.sub, P.mut, 11.5.sp, FontWeight.Normal)
            WT(w.whenText, P.acc, 11.sp, modifier = Modifier.padding(top = 4.dp))
        }
        Row(Modifier.weight(1.25f).fillMaxHeight()) {
            Box(Modifier.width(1.dp).fillMaxHeight().background(P.line))
            Column(Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                WT(w.dayT, P.mut, 10.5.sp)
                w.n3.forEach { e ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        WT(e.s, P.fg, 11.sp, modifier = Modifier.width(34.dp))
                        Box(Modifier.size(3.dp, 24.dp).clip(RoundedCornerShape(2.dp)).background(Color(e.color)))
                        Column { WT(e.short, P.fg, 12.5.sp); WT(e.room, P.mut, 10.5.sp, FontWeight.Normal) }
                    }
                }
            }
        }
    }
}

@Composable
private fun WLarge(P: KalPlat, w: KalW) {
    Column(Modifier.fillMaxWidth().wCard(P, P.l, 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WT(w.dayL, P.fg, 16.sp, modifier = Modifier.weight(1f))
            WT(w.cnt, P.acc, 11.sp)
        }
        w.all.forEach { e ->
            Row(Modifier.alpha(if (e.dim) .45f else 1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                WT(e.tm, P.mut, 11.sp, modifier = Modifier.width(76.dp))
                Box(Modifier.size(4.dp, 28.dp).clip(RoundedCornerShape(2.dp)).background(Color(e.color)))
                Column(Modifier.weight(1f)) { WT(e.title, P.fg, 13.5.sp); WT(e.sub, P.mut, 11.sp, FontWeight.Normal) }
            }
        }
        Spacer(Modifier.weight(1f))
        Box(Modifier.fillMaxWidth().height(1.dp).background(P.line))
        WT("PRØVER OG FRISTER", P.acc, 10.sp, FontWeight.ExtraBold)
        w.ex.forEach { x ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                WT(x.title, P.fg, 13.sp, modifier = Modifier.weight(1f))
                Box(Modifier.clip(CircleShape).background(if (x.red) Color(KAL_LAB) else Color.Black.copy(alpha = .07f)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                    WT(x.inText, if (x.red) Color.White else P.fg, 10.5.sp, FontWeight.ExtraBold)
                }
            }
        }
    }
}

/* ---------------- Hjem-widgeten KALENDER ---------------- */

/** Hjem: NÅ / NESTE TIME / ukedag, fag i Newsreader med fargestripe, rom og lærer, klokkeslett, tre neste timer og NESTE PRØVE. */
@Composable
internal fun HomeKalCard26(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.kal26
    LaunchedEffect(vm.base) { if (s.events == null) vm.loadKal26(quiet = true) }
    val now = rememberMinute()
    val w = kalWidget(s.events ?: emptyList(), now, s.subjectColors)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).press24 { vm.openKal26() }.padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            KMono("KALENDER · " + w.k, p.lab, modifier = Modifier.weight(1f))
            Text(w.dayT + " ›", color = p.mut, fontSize = 12.sp, maxLines = 1)
        }
        if (s.events == null) { Text("Henter kalenderen …", color = p.mut, fontSize = 13.sp); return@Column }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(5.dp, 44.dp).clip(RoundedCornerShape(3.dp)).background(Color(w.color)))
            Column(Modifier.weight(1f)) {
                PSerif(w.title, 22.sp, maxLines = 1)
                if (w.sub.isNotBlank()) Text(w.sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(w.big, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, lineHeight = 26.sp, maxLines = 1)
                if (w.whenText.isNotBlank()) Text(w.whenText, color = p.lab, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, maxLines = 1)
            }
        }
        if (w.n3.isNotEmpty()) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            w.n3.forEach { e ->
                Row(Modifier.weight(1f).height(IntrinsicSize.Min).clip(RoundedCornerShape(12.dp)).background(p.bg)) {
                    Box(Modifier.width(3.dp).fillMaxHeight().background(Color(e.color)))
                    Column(Modifier.padding(start = 6.dp, top = 7.dp, end = 9.dp, bottom = 7.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(e.s, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 12.sp, maxLines = 1)
                        Text(e.short, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        w.ex.firstOrNull()?.let { x ->
            Column {
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KMono("NESTE PRØVE", p.lab, 10.sp, spacing = .8.sp)
                    Text(x.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Box(Modifier.clip(CircleShape).background(if (x.red) Color(KAL_LAB) else p.bg).padding(horizontal = 8.dp, vertical = 3.dp)) {
                        Text(x.inText, color = if (x.red) Color.White else p.ink, fontWeight = FontWeight.ExtraBold, fontSize = 10.5.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}
