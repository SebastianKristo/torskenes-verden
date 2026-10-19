package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalTime
import java.time.format.DateTimeFormatter

/*
 * Prompt 24 (A): Ruter-visningen lik på iOS og Android (claude-code-ruter-lik.md, fasit «av» i Mobil Papir App.dc.html).
 * Fullskjerm uten fanelinje og skann-knapp. Toppbilde med «‹ Hjem» og «↻ 21:10», «Sanntid · Ruter», stoppnavn og
 * «Trikk og buss». Innholdet ligger 34 dp opp i bildet: stopp-piller (hold inne = «Mine stopp»), status, filter,
 * avvik, én liste i ett kort (minutter i Newsreader 24) og fotnote. Trykk på en avgang viser stoppene på turen.
 */

private fun modeKey(m: String?): String? = when (m?.lowercase()) {
    "tram", "trikk" -> "tram"; "bus", "coach", "buss" -> "bus"; "metro", "t-bane" -> "metro"; "rail", "tog" -> "rail"; "water", "båt" -> "water"; else -> null
}
private val MODE_ORDER = listOf("tram" to "Trikk", "bus" to "Buss", "metro" to "T-bane", "rail" to "Tog", "water" to "Båt")
/** Fallback-farger når Entur ikke sender linjefargen. */
private fun modeFallback(m: String?, line: String): Long = when (modeKey(m)) {
    "bus" -> 0xFFE60000; "tram" -> 0xFF0B91EF; "metro" -> 0xFFEC700C; "rail" -> 0xFFE1EB00; else -> ruterModeColor(m, line)
}
/** Lys eller mørk tekst på linjefargen. */
private fun onLine(c: Long, given: Long?): Color {
    given?.let { return Color(it) }
    val r = (c shr 16 and 0xFF) / 255.0; val g = (c shr 8 and 0xFF) / 255.0; val b = (c and 0xFF) / 255.0
    return if (0.299 * r + 0.587 * g + 0.114 * b < 0.55) Color.White else Color(0xFF1B1A17)
}

/** Mørk pille over bildet (36 høy, rgba(27,26,23,.55)). */
@Composable
private fun GlassPill(text: String, label: String, onClick: () -> Unit) {
    Box(Modifier.height(36.dp).clip(CircleShape).background(Color(0x8C1B1A17)).clickable(onClickLabel = label, onClick = onClick).padding(start = 12.dp, end = 14.dp), contentAlignment = Alignment.Center) {
        Text(text, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, fontFamily = PaperFonts.sans, maxLines = 1)
    }
}

@Composable
internal fun RuterScreen24(vm: AppViewModel) {
    val p = PaperPal.current
    BackHandler { if (vm.stopEdit) vm.stopEdit = false else vm.closeRuter() }
    LaunchedEffect(Unit) { vm.loadRuterPhoto() }
    val sel = vm.myStops.firstOrNull { it.id == vm.stopSel } ?: vm.myStops.firstOrNull()
    val sd = sel?.let { vm.stopDeps[it.id] }
    val deps = (sd?.departures ?: emptyList()).take(20)
    // Siste oppdatering: tidspunktet avgangene sist ble hentet (vises i «↻ 21:10»).
    val at = remember(vm.stopDeps) { LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")) }
    var filter by remember(sel?.id) { mutableStateOf("alle") }
    val modes = MODE_ORDER.filter { (k, _) -> deps.any { modeKey(it.mode) == k } }
    if (filter != "alle" && modes.none { it.first == filter }) filter = "alle"
    val shown = deps.filter { filter == "alle" || modeKey(it.mode) == filter }
    val sub = modes.map { it.second }.let { l -> if (l.isEmpty()) "Holdeplass" else l.mapIndexed { i, n -> if (i == 0) n else n.lowercase() }.let { x -> if (x.size == 1) x[0] else x.dropLast(1).joinToString(", ") + " og " + x.last() } }
    val alert = deps.firstNotNullOfOrNull { it.situation }
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    Box(Modifier.fillMaxSize().background(p.bg)) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 40.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding())) {
            item {
                Box(Modifier.fillMaxWidth().background(Brush.verticalGradient(*HERO_FALLBACK))) {
                    vm.ruterPhoto?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
                    Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = .30f), .45f to Color.Black.copy(alpha = .08f), 1f to Color.Black.copy(alpha = .50f))))
                    Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = maxOf(52.dp, top + 8.dp), bottom = 40.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            GlassPill("‹ Hjem", "Tilbake") { vm.closeRuter() }
                            Spacer(Modifier.weight(1f))
                            GlassPill("↻ $at", "Oppdater") { Haptics.select(); vm.refreshStops() }
                        }
                        Spacer(Modifier.height(26.dp))
                        Text("Sanntid · Ruter", color = Color.White.copy(alpha = .92f), fontFamily = PaperFonts.serif, fontStyle = FontStyle.Italic, fontWeight = FontWeight.Normal, fontSize = 17.sp)
                        Text(sel?.name ?: "Avganger", color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 40.sp, lineHeight = 40.8.sp,
                            style = TextStyle(shadow = Shadow(Color.Black.copy(alpha = .35f), Offset(0f, 4f), 28f)), maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                        Text(sub, color = Color.White.copy(alpha = .9f), fontSize = 13.sp, fontFamily = PaperFonts.sans)
                    }
                }
            }
            item {
                Column(Modifier.fillMaxWidth().offset(y = (-34).dp).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (!vm.stopEdit) StopPills24(vm, sel?.id) else MyStops24(vm)
                    when {
                        vm.stopsError != null -> Text(vm.stopsError ?: "", color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
                        sel == null -> Text("Legg til en holdeplass med «+ Stopp».", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
                        sd == null -> Text("Henter sanntid fra Entur …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
                        deps.isEmpty() -> Text("Fikk ikke kontakt med Entur. Trykk ↻ for å prøve igjen.", color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
                    }
                    if (modes.isNotEmpty()) Row(Modifier.fillMaxWidth().clip(CircleShape).background(p.card).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        (listOf("alle" to "Alle") + modes).forEach { (k, n) ->
                            val on = filter == k
                            Box(Modifier.weight(1f).height(34.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).press24 { Haptics.select(); filter = k }, contentAlignment = Alignment.Center) {
                                Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
                            }
                        }
                    }
                    alert?.let { a ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(16.dp)).padding(14.dp, 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("!", color = p.lab, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                            Text(a, color = p.ink, fontSize = 13.sp, lineHeight = 19.sp)
                        }
                    }
                    if (shown.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                        shown.forEachIndexed { i, d ->
                            val id = "${d.line}|${d.to}|${d.aimed ?: i}"
                            DepRow24(d, sel?.name, vm.depOpen == id, top = i > 0) { vm.depOpen = if (vm.depOpen == id) null else id }
                        }
                    } else if (deps.isNotEmpty()) Text("Ingen avganger av denne typen den neste timen.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
                    Text("Sanntid fra Entur/Ruter når tilkoblet. Trykk på en avgang for å se stoppene.", color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
                }
            }
        }
    }
}

/** Stopp-piller i én vannrett rad (ikke i et kort). Hold inne = «Mine stopp». «+ Stopp» med stiplet kant. */
@Composable
private fun StopPills24(vm: AppViewModel, selId: String?) {
    val p = PaperPal.current
    Row(
        Modifier.fillMaxWidth().longPressEdit(true) { Haptics.tap(); vm.stopEdit = true }.horizontalScroll(rememberScrollState()).padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        vm.myStops.forEach { st ->
            val on = st.id == selId
            Box(
                Modifier.height(36.dp).clip(CircleShape).background(if (on) p.ink else p.card).border(1.dp, if (on) p.ink else p.line, CircleShape)
                    .press24 { Haptics.select(); vm.stopSel = st.id }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text(st.name, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1, softWrap = false) }
        }
        Box(
            Modifier.height(36.dp).clip(CircleShape).background(p.card).dashedEdge(p.mut, 18.dp).press24 { vm.stopEdit = true }.padding(horizontal = 14.dp),
            contentAlignment = Alignment.Center,
        ) { Text("+ Stopp", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, softWrap = false) }
    }
}

/** «Mine stopp»: liste med ↑ ↓ og −, søk i Entur og «+ Legg til». */
@Composable
private fun MyStops24(vm: AppViewModel) {
    val p = PaperPal.current
    var q by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PSerif("Mine stopp", 20.sp, modifier = Modifier.weight(1f))
            Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(p.ink).press24 { Haptics.success(); vm.stopEdit = false }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                Text("Ferdig", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }
        }
        Column {
            vm.myStops.forEachIndexed { i, st ->
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(st.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(st.locality.ifBlank { vm.stopDeps[st.id]?.departures?.firstOrNull()?.let { "${it.line} ${it.to}" } ?: "Holdeplass" }, color = p.mut, fontSize = 12.sp, maxLines = 1)
                    }
                    StopBtn("↑", i > 0, border = true) { vm.moveStop(st.id, -1) }
                    StopBtn("↓", i < vm.myStops.size - 1, border = true) { vm.moveStop(st.id, 1) }
                    StopBtn("−", true, border = false, color = p.lab) { vm.removeStop(st.id) }
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Prompt 27: ✕ til venstre tømmer søket og avbryter det som venter.
            SearchLead27(q.isNotEmpty(), p.ink, p.mut, bg = p.line, idle = { Text("⌕", color = p.mut, fontSize = 15.sp) }) { q = ""; vm.searchStops("") }
            BasicTextField(
                q, { q = it; vm.searchStops(it) }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
                cursorBrush = SolidColor(p.lab), modifier = Modifier.weight(1f),
                decorationBox = { inner -> Box { if (q.isEmpty()) Text("Søk etter holdeplass", color = p.mut, fontSize = 15.sp, fontWeight = FontWeight.Medium); inner() } },
            )
        }
        if (vm.stopSearchBusy) Text("Søker i Entur …", color = p.mut, fontSize = 12.5.sp)
        else if (q.trim().length >= 2 && vm.stopSearch.isEmpty()) Text("Fant ingen holdeplasser.", color = p.mut, fontSize = 12.5.sp)
        if (vm.stopSearch.isNotEmpty() && q.trim().length >= 2) Column {
            vm.stopSearch.take(8).forEachIndexed { i, s ->
                val added = vm.myStops.any { it.id == s.id }
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().press24(enabled = !added) { vm.addStop(s); q = "" }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(s.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val modes = s.modes.mapNotNull { depModeName(it) }.joinToString(", ")
                        listOf(s.locality, modes).filter { it.isNotBlank() }.joinToString(" · ").takeIf { it.isNotBlank() }?.let { Text(it, color = p.mut, fontSize = 12.sp, maxLines = 1) }
                    }
                    Text(if (added) "Lagt til" else "+ Legg til", color = if (added) p.mut else p.lab, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                }
            }
        }
        Text("Hold inne på stoppene for å komme hit.", color = p.mut, fontSize = 11.5.sp)
    }
}

@Composable
private fun StopBtn(t: String, enabled: Boolean, border: Boolean, color: Color = PaperPal.current.ink, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.size(36.dp).clip(CircleShape).then(if (border) Modifier.border(1.dp, p.line, CircleShape) else Modifier)
            .press24(enabled = enabled) { Haptics.select(); onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(t, color = color.copy(alpha = if (enabled) 1f else .3f), fontSize = if (t == "−") 20.sp else 15.sp, fontWeight = FontWeight.SemiBold) }
}

/**
 * Én avgang: linjemerke (min 34 × 28, radius 7), destinasjon (Manrope 600 15), status (12, «lab» ved forsinkelse),
 * minutter (Newsreader 500 24) og klokkeslett (11,5). Trykk viser stoppene på turen og «Åpne i Ruter ›».
 */
@Composable
private fun DepRow24(d: Dep, from: String?, open: Boolean, top: Boolean, onToggle: () -> Unit) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val c = d.color ?: modeFallback(d.mode, d.line)
    val lineColor = Color(c)
    val status = depStatus(d)
    val late = (d.delayMin ?: 0) > 0 || status?.contains("forsinket") == true
    Column(Modifier.fillMaxWidth().animateContentSize(tween(200, easing = FastOutSlowInEasing))) {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().press24 { Haptics.select(); onToggle() }.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.widthIn(min = 34.dp).height(28.dp).clip(RoundedCornerShape(7.dp)).background(lineColor).padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
                Text(d.line, color = onLine(c, d.textColor?.takeIf { d.color != null }), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, maxLines = 1)
            }
            Column(Modifier.weight(1f)) {
                Text(d.to, color = if (d.cancelled) p.mut else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val parts = listOfNotNull(depModeName(d.mode), d.platform?.takeIf { it.isNotBlank() && it != "–" }?.let { "plattform $it" }, if (d.cancelled) "innstilt" else status)
                if (parts.isNotEmpty()) Text(parts.joinToString(" · "), color = if (late || d.cancelled) p.lab else p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    if (d.cancelled) "Innstilt" else d.minutes?.let { if (it <= 0) "nå" else "$it min" } ?: depClock(d.expected ?: d.aimed),
                    color = if (d.cancelled) p.lab else p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 24.sp, lineHeight = 24.sp, maxLines = 1,
                    textDecoration = if (d.cancelled) TextDecoration.LineThrough else null,
                )
                depClock(d.expected ?: d.aimed).takeIf { it.isNotBlank() }?.let { Text(it, color = p.mut, fontSize = 11.5.sp) }
            }
        }
        if (open) Column(Modifier.fillMaxWidth().padding(start = 60.dp, end = 14.dp, top = 2.dp, bottom = 14.dp)) {
            if (d.stops.isEmpty()) Text("Stoppene på turen kommer når serveren har dem.", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(vertical = 4.dp))
            else Stops24(d.stops, lineColor)
            Text("Åpne i Ruter ›", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, textDecoration = TextDecoration.Underline,
                modifier = Modifier.padding(top = 8.dp).clip(RoundedCornerShape(6.dp)).clickable { openLink(ctx, d.ruterUrl ?: ruterPlanner24(from, d.to)) }.padding(vertical = 4.dp))
        }
    }
}

private fun ruterPlanner24(from: String?, to: String?): String {
    fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20")
    val q = listOfNotNull(from?.takeIf { it.isNotBlank() }?.let { "from=" + enc(it) }, to?.takeIf { it.isNotBlank() }?.let { "to=" + enc(it) })
    return "https://ruter.no/reiseplanlegger/" + if (q.isEmpty()) "" else "?" + q.joinToString("&")
}

/** Stopplisten: linje i linjefargen, fylt første sirkel, hule ellers; første og siste i fet. Mer enn 6: 2 + «· · · N stopp» + 2. */
@Composable
private fun Stops24(stops: List<DepStop>, lineColor: Color) {
    val p = PaperPal.current
    var all by remember(stops) { mutableStateOf(false) }
    val n = stops.size
    val collapsed = n > 6 && !all
    val shown: List<Pair<Int, DepStop>?> = if (!collapsed) stops.mapIndexed { i, s -> i to s }
        else listOf(0 to stops[0], 1 to stops[1], null, n - 2 to stops[n - 2], n - 1 to stops[n - 1])
    shown.forEach { e ->
        if (e == null) {
            Row(Modifier.fillMaxWidth().heightIn(min = 30.dp).clickable { all = true }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.width(10.dp).height(30.dp), contentAlignment = Alignment.Center) { Box(Modifier.width(2.dp).fillMaxHeight().background(lineColor)) }
                Text("· · · ${n - 4} stopp", color = p.mut, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            return@forEach
        }
        val (i, s) = e
        val first = i == 0
        val last = i == n - 1
        Row(Modifier.fillMaxWidth().heightIn(min = 30.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.width(10.dp).height(30.dp), contentAlignment = Alignment.Center) {
                Column(Modifier.fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.width(2.dp).weight(1f).background(if (first) Color.Transparent else lineColor))
                    Box(Modifier.size(9.dp).clip(CircleShape).background(if (first) lineColor else p.card).border(2.dp, lineColor, CircleShape))
                    Box(Modifier.width(2.dp).weight(1f).background(if (last) Color.Transparent else lineColor))
                }
            }
            Text(s.name, color = p.ink, fontSize = 13.5.sp, fontWeight = if (first || last) FontWeight.Bold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(depClock(s.time ?: s.expected ?: s.aimed), color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        }
    }
}
