package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/*
 * Prompt 32 (ANDROID32): Kalender med Glimt (Kalender.dc.html).
 *  - «✦ BESKRIV MED GLIMT» øverst i Ny hendelse / Rediger hendelse (fmAi): lilla tonet felt, Fyll ut med Glimt-merket. Fyller feltene; lagrer ikke.
 *  - Søket som ark fra bunnen (sr): «Søk, eller spør Glimt …» · ✕ · ✦ Spør, filterchips, SPØR GLIMT + SNART, treff gruppert per dag med
 *    markert treff, og svarkortet GLIMT (lokalt først, ellers AI).
 */

private val GLIMT_LILLA32B = Color(0xFF7A5AD6)
private const val SEARCH_PATH32B = "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.6-3.6"

/** Det lilla feltet «✦ BESKRIV MED GLIMT» (Enter = Fyll ut, Shift+Enter = ny linje). */
@Composable
internal fun KalDescribe32b(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p32b
    val has = s.kAi.isNotBlank()
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(lerp(p.card, GLIMT_LILLA32B, .09f))
            .border(1.dp, GLIMT_LILLA32B.copy(alpha = .24f), RoundedCornerShape(18.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("✦ BESKRIV MED GLIMT", color = GLIMT_LILLA32B, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp)
            Spacer(Modifier.weight(1f))
            if (s.kAiNote.isNotBlank() && !s.kAiBusy) Text("✓ ${s.kAiNote}", color = Color(0xFF2F7D4F), fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f).heightIn(min = 52.dp).clip(RoundedCornerShape(14.dp)).background(p.card).padding(12.dp, 10.dp)) {
                if (s.kAi.isEmpty()) Text("F.eks. «Tannlege hos Dr. Berg tirsdag 10.30, Bogstadveien 12, minn meg dagen før» eller lim inn en melding",
                    color = p.mut, fontSize = 14.5.sp, lineHeight = 20.sp)
                BasicTextField(
                    s.kAi, { s.kAi = it; s.kAiErr = "" }, minLines = 2, maxLines = 6,
                    textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
                    cursorBrush = SolidColor(GLIMT_LILLA32B),
                    modifier = Modifier.fillMaxWidth().onPreviewKeyEvent { e ->
                        if (e.type == KeyEventType.KeyDown && e.key == Key.Enter && !e.isShiftPressed) { vm.kalDescribe32b(); true } else false
                    },
                )
            }
            Row(
                Modifier.height(44.dp).clip(CircleShape).background(if (has) p.ink else GLIMT_LILLA32B.copy(alpha = .14f))
                    .clickable(enabled = has && !s.kAiBusy, role = Role.Button, onClickLabel = "Fyll ut med Glimt") { vm.kalDescribe32b() }
                    .padding(start = 8.dp, end = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                GlimtMark31(28.dp, if (s.kAiBusy) GLIMT_TENKER else GLIMT_KLAR, dark = has)
                Text(if (s.kAiBusy) "Fyller ut …" else "Fyll ut", color = if (has) p.bg else GLIMT_LILLA32B, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1)
            }
        }
        if (s.kAiErr.isNotBlank()) Text(s.kAiErr, color = Color(0xFFB23A2A), fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
    }
}

/* ---------------- Søket ---------------- */

private fun kalRel32b(d: LocalDate, today: LocalDate): String {
    val n = ChronoUnit.DAYS.between(today, d)
    return when { n == 0L -> "i dag"; n == 1L -> "i morgen"; n == -1L -> "i går"; n > 0 -> "om $n dager"; else -> "${-n} dager siden" }
}

/** Tittel med markert treff (gul). */
private fun marked32b(t: String, q: String, ink: Color) = buildAnnotatedString {
    val i = if (q.isBlank()) -1 else t.lowercase().indexOf(q.trim().lowercase())
    if (i < 0) { append(t); return@buildAnnotatedString }
    append(t.substring(0, i))
    withStyle(SpanStyle(background = Color(0x66FFD54A), color = ink)) { append(t.substring(i, i + q.trim().length)) }
    append(t.substring(i + q.trim().length))
}

@Composable
private fun KalRow32b(vm: AppViewModel, e: Kal26Ev, q: String, top: Boolean, showDay: Boolean, close: () -> Unit) {
    val p = PaperPal.current
    val s = vm.kal26
    if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).press24 {
            close()
            s.cur = e.date; s.sel = e
            if (s.view == "maaned" || s.view == "liste") vm.setKalView27("dag")
        }.padding(horizontal = 14.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(4.dp, 30.dp).clip(RoundedCornerShape(2.dp)).background(Color(kalColor27(e, s))))
        Text(if (showDay) "${e.date.dayOfMonth}.${e.date.monthValue}." else e.start?.let { kalHm(it) } ?: "hele", color = p.mut, fontFamily = PaperFonts.mono,
            fontWeight = FontWeight.Medium, fontSize = 12.sp, modifier = Modifier.width(48.dp), maxLines = 1)
        Column(Modifier.weight(1f)) {
            Text(marked32b(e.title, q, p.ink), color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val sub = listOfNotNull(if (showDay) e.timeText else null, noUrl31(e.room).takeIf { it.isNotBlank() }, noUrl31(e.note).takeIf { it.isNotBlank() }).joinToString(" · ")
            if (sub.isNotBlank()) Text(sub, color = p.mut, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Filterchips: Alle · Timeplan · Prøver og frister · Skole · Privat · Familie · Bursdager (farget prikk). */
@Composable
private fun KalFilters32b(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p32b
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        (listOf(Triple("alle", "Alle", null as Long?)) + KAL_FILTERS.map { (id, n, _) -> Triple(id, if (id == "skole") "Skole (iCal)" else n, vm.kal26.calColor27(id) as Long?) }).forEach { (k, n, c) ->
            val on = s.kFilter == k
            Row(
                Modifier.height(34.dp).clip(CircleShape).background(if (on) p.ink else p.card).border(1.dp, if (on) p.ink else p.line, CircleShape)
                    .clickable { Haptics.select(); s.kFilter = k }.padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (c != null) Box(Modifier.size(8.dp).clip(CircleShape).background(Color(c)))
                Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
            }
        }
    }
}

/** Svarkortet: Glimt-merket (tenker / ferdig) · «GLIMT» · spørsmålet · svaret · opptil 6 hendelser. */
@Composable
private fun KalAskCard32b(vm: AppViewModel, a: KalAsk32b, close: () -> Unit) {
    val p = PaperPal.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(lerp(p.card, GLIMT_LILLA32B, .07f)).border(1.dp, GLIMT_LILLA32B.copy(alpha = .2f), RoundedCornerShape(18.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlimtMark31(28.dp, if (a.busy) GLIMT_TENKER else GLIMT_FERDIG)
            Column(Modifier.weight(1f)) {
                Text("GLIMT", color = GLIMT_LILLA32B, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp)
                Text("«${a.q}»", color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (a.busy) Text("Leser kalenderen …", color = p.mut, fontSize = 14.sp)
        else {
            Text(buildAnnotatedString { boldParts31(a.text).forEach { (t, b) -> if (b) withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append(t) } else append(t) } },
                color = p.ink, fontSize = 16.sp, lineHeight = 23.sp, fontWeight = FontWeight.Medium)
            if (a.items.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.bg)) {
                a.items.forEachIndexed { i, e -> KalRow32b(vm, e, "", i > 0, showDay = true, close = close) }
            }
        }
    }
}

/**
 * Søkearket: felt med ✕ og ✦ Spør (mørk når det står noe), lukk-knapp, filterchips. Tomt felt: SPØR GLIMT (fire forslag) og SNART.
 * Mens man skriver: treff fra 30 dager bakover til 120 dager fremover, gruppert per dag, kommende først. Enter / ✦ Spør: Glimt.
 */
@Composable
internal fun KalSearch32b(vm: AppViewModel, today: LocalDate) {
    val p = PaperPal.current
    val s = vm.kal26
    val g = vm.p32b
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        runCatching { focus.requestFocus() }
        vm.loadKal26(quiet = true, from = today.minusDays(30), to = today.plusDays(120))
    }
    val close = { s.search = false; s.q = ""; s.results = null; g.kAsk = null; g.kFilter = "alle" }
    val q = s.q
    val has = q.isNotBlank()
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.weight(1f).height(50.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).padding(start = 14.dp, end = 7.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            WxIcon(SEARCH_PATH32B, p.mut, 18.dp, stroke = 2.2f)
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (q.isEmpty()) Text("Søk, eller spør Glimt …", color = p.mut, fontSize = 15.5.sp, maxLines = 1)
                BasicTextField(
                    q, { vm.searchKal27(it); if (g.kAsk?.q != it.trim()) g.kAsk = null }, singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 15.5.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
                    cursorBrush = SolidColor(p.ink), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { vm.askKal32b(q) }),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus),
                )
            }
            if (has) Box(
                Modifier.size(30.dp).clip(CircleShape).background(Color(0x337F7F7F))
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { vm.searchKal27(""); g.kAsk = null; runCatching { focus.requestFocus() } },
                contentAlignment = Alignment.Center,
            ) { Text("✕", color = p.ink, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            Box(
                Modifier.height(36.dp).clip(CircleShape).background(if (has) p.ink else lerp(p.card, GLIMT_LILLA32B, .12f))
                    .clickable(enabled = has, role = Role.Button, onClickLabel = "Spør Glimt") { vm.askKal32b(q) }.padding(start = 10.dp, end = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text("✦ Spør", color = if (has) p.bg else GLIMT_LILLA32B, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
        }
        Box(Modifier.size(44.dp).clip(CircleShape).background(p.card).press24(onClick = close), contentAlignment = Alignment.Center) {
            Text("✕", color = p.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
    }
    KalFilters32b(vm)
    val flt = g.kFilter
    fun keep(e: Kal26Ev) = flt == "alle" || e.cat == flt
    g.kAsk?.let { KalAskCard32b(vm, it, close) }
    val evs = (s.events ?: emptyList()).filter { it.cat !in s.hiddenFilters }
    if (!has) {
        if (g.kAsk == null) {
            Text("SPØR GLIMT", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.padding(start = 4.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card)) {
                listOf("Hva har jeg i morgen?", "Når er neste prøve?", "Er jeg ledig fredag ettermiddag?", "Hva skjer neste uke?").forEachIndexed { i, sug ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).press24 { vm.searchKal27(sug); vm.askKal32b(sug) }.padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(lerp(p.card, GLIMT_LILLA32B, .14f)), contentAlignment = Alignment.Center) {
                            Text("✦", color = GLIMT_LILLA32B, fontSize = 13.sp)
                        }
                        Text(sug, color = p.ink, fontSize = 14.5.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                        Text("↗", color = p.mut, fontSize = 15.sp)
                    }
                }
            }
        }
        val now = java.time.LocalTime.now().let { it.hour * 60 + it.minute }
        val soon = evs.filter { keep(it) && (it.date.isAfter(today) || (it.date == today && (it.eMin ?: 1440) > now)) }
            .sortedWith(compareBy<Kal26Ev> { it.date }.thenBy { it.sMin ?: -1 }).take(4)
        Text("SNART", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.padding(start = 4.dp))
        if (soon.isEmpty()) Text("Ingenting de neste dagene.", color = p.mut, fontSize = 13.5.sp, modifier = Modifier.padding(start = 4.dp))
        else Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card)) {
            soon.forEachIndexed { i, e ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 54.dp).press24 { close(); s.cur = e.date; s.sel = e; if (s.view == "maaned" || s.view == "liste") vm.setKalView27("dag") }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.width(42.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(KAL_WS[e.date.dayOfWeek.value - 1], color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp)
                        PSerif("${e.date.dayOfMonth}", 20.sp, maxLines = 1)
                    }
                    Box(Modifier.size(4.dp, 30.dp).clip(RoundedCornerShape(2.dp)).background(Color(kalColor27(e, s))))
                    Column(Modifier.weight(1f)) {
                        Text(e.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(e.timeText + (noUrl31(e.room).takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        return
    }
    // Live-treff: serverens søk (s.results) eller lokalt, −30 … +120 dager, gruppert per dag (kommende først, så tidligere).
    val lo = today.minusDays(30); val hi = today.plusDays(120)
    val src = s.results ?: kalLocalSearch27(evs, q.trim())
    val hits = src.filter { keep(it) && !it.date.isBefore(lo) && !it.date.isAfter(hi) }.distinctBy { it.id + it.date }
    val up = hits.filter { !it.date.isBefore(today) }.sortedWith(compareBy<Kal26Ev> { it.date }.thenBy { it.sMin ?: -1 })
    val past = hits.filter { it.date.isBefore(today) }.sortedWith(compareByDescending<Kal26Ev> { it.date }.thenBy { it.sMin ?: -1 })
    val fName = if (flt == "alle") "" else " i " + (KAL_FILTERS.firstOrNull { it.first == flt }?.second ?: flt)
    Text(if (hits.isEmpty()) "Ingen treff$fName. Trykk ✦ Spør for å spørre Glimt." else "${hits.size} treff$fName", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(start = 4.dp))
    (up + past).groupBy { it.date }.entries.take(40).forEach { (d, l) ->
        Row(Modifier.padding(start = 4.dp, top = 2.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(kalCap(kalLong(d)), color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
            Text(kalRel32b(d, today), color = p.mut, fontSize = 12.sp)
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).alpha(if (d.isBefore(today)) .75f else 1f)) {
            l.forEachIndexed { i, e -> KalRow32b(vm, e, q, i > 0, showDay = false, close = close) }
        }
    }
}
