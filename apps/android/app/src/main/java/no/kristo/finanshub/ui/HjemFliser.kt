package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.LocalDateTime
import kotlinx.coroutines.delay
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.Screen
import no.kristo.finanshub.kalWidget
import no.kristo.finanshub.loadBirthdays24
import no.kristo.finanshub.loadKal26
import no.kristo.finanshub.loadTrials31
import no.kristo.finanshub.openBirthdays24
import no.kristo.finanshub.openKal26
import no.kristo.finanshub.refreshHomeDeps27
import no.kristo.finanshub.trialDays32b

/* ======================= Hjem 3a ======================= */

internal val TILE_KEYS52 = listOf("h52av", "h52fi", "h52ma", "h52fa", "h52do")

private val TILE_LABELS52 = mapOf("h52av" to "Avgang", "h52fi" to "Økonomi", "h52ma" to "Middag", "h52fa" to "Familie", "h52do" to "Domener")

/** Halve fliser på telefon (fasit: h7, h9, h10, h11 og h13–h17 får grid-column auto). */
internal val HALF52 = setOf("h7", "h9", "h10", "h11") + TILE_KEYS52

/** Kortlista for 3a: «Fliser» (hm) erstattes av de fem flisene som egne kort på samme plass. */
internal fun homeSecs52(secs: List<PSec>): List<PSec> = secs.flatMap { s -> if (s.key == "hm") TILE_KEYS52.map { PSec(it, TILE_LABELS52.getValue(it)) } else listOf(s) }

/**
 * Hjem: med [g52] (telefon, «Hjem som fliser» på) 2 kolonner der halve fliser står side om side og Avgang er dobbelt høy
 * med de to neste halve flisene oppå hverandre ved siden av. Ellers som før (pageGridSecs).
 */
internal fun LazyGridScope.homeGridSecs52(vm: AppViewModel, g52: Boolean, secs0: List<PSec>, wide: Boolean, skip: (String) -> Boolean = { false }, body: @Composable (String) -> Unit) {
    if (!g52) { pageGridSecs(vm, "hjem", secs0, wide, skip, body); return }
    val page = "hjem"
    val secs = homeSecs52(secs0)
    val keys = secs.map { it.key }
    val edit = vm.editPage == page
    vm.b28.pageSecs[page] = secs.map { it.key to it.label }
    val order0 = vm.pageLayouts[page]?.order ?: emptyList()
    // «Fliser» var skjult i et lagret oppsett (og flisene er ikke plassert ennå): de fem er skjult også.
    val hid = vm.pageHidden(page).let { h -> if ("hm" in h && TILE_KEYS52.none { it in order0 }) h + TILE_KEYS52 else h }
    val shown0 = vm.pageOrder(page, keys).filter { it !in hid }
    // Med Avgang-flisen vises ikke Avganger-kortet (h3), med Familie-flisen ikke Posisjon (h6) – som før med flisene.
    val skip52: (String) -> Boolean = { k -> skip(k) || (k == "h3" && "h52av" in shown0) || (k == "h6" && "h52fa" in shown0) }
    val vis = shown0.filter { edit || !skip52(it) }
    if (edit) item(key = "edit-$page", span = { GridItemSpan(maxLineSpan) }) { WiggleSpace30(true, extra = (-10).dp) }
    var i = 0
    while (i < vis.size) {
        val k = vis[i]
        val idx = i
        if (k == "h52av") {
            val nx = vis.drop(i + 1).takeWhile { it in HALF52 && it != "h52av" }.take(2)
            val h = if (nx.size == 2) TILE_H52 * 2 + 10.dp else 212.dp
            item(key = "sec-$page-$k", span = { GridItemSpan(1) }) {
                EditWrap(vm, page, secs.first { it.key == k }, keys, idx, vis.size) { Tile52(vm, k, h) }
            }
            if (nx.isNotEmpty()) item(key = "col52-" + nx.joinToString("-"), span = { GridItemSpan(1) }) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    nx.forEachIndexed { j, x ->
                        EditWrap(vm, page, secs.first { it.key == x }, keys, idx + 1 + j, vis.size) { Tile52(vm, x, if (nx.size == 2) TILE_H52 else h, body) }
                    }
                }
            }
            i += 1 + nx.size
            continue
        }
        val half = k in HALF52
        item(key = "sec-$page-$k", span = { GridItemSpan(if (half) 1 else maxLineSpan) }) {
            EditWrap(vm, page, secs.first { it.key == k }, keys, idx, vis.size) { if (half || k == "h5") Tile52(vm, k, TILE_H52, body) else body(k) }
        }
        i++
    }
    if (!edit) item(key = "hint-$page", span = { GridItemSpan(maxLineSpan) }) { EditHint() }
}

private val TILE_H52 = 101.dp // prompt 80: liten flis 101 dp (som SMALL73 i HjemRutenett.kt)

private val SHAPE52 = RoundedCornerShape(24.dp)

/** Én flis i 3a. Prompt 70 (ANDHOME70): h = Dp.Unspecified → innholdets høyde (raden i HjemRutenett.kt strekker begge likt). */
@Composable
internal fun Tile52(vm: AppViewModel, k: String, h: Dp, body: @Composable (String) -> Unit = {}) {
    val m = if (h == Dp.Unspecified) Modifier.fillMaxWidth().fillMaxHeight() else Modifier.fillMaxWidth().height(h)
    when (k) {
        "h52av" -> {
            GjentaMensSynlig { while (true) { delay(30_000); if (!vm.ruterOpen && vm.b27.homeStops?.isNotEmpty() == true) runCatching { vm.refreshHomeDeps27() } } }
            AvgangTile50(vm, tileDeps50(vm), m)
        }
        "h52fi" -> FinTile50(vm, m)
        "h52ma" -> MatTile50(vm, m)
        "h52fa" -> { GjentaMensSynlig { while (true) { vm.loadPositions(); delay(60_000) } }; FamTile50(vm, m) }
        "h52do" -> DomTile50(vm, m)
        "h10" -> KalTile52(vm, m)
        "h9" -> BdTile52(vm, m)
        "h7" -> BoligTile52(vm, m)
        "h11" -> TrialTile52(vm, m)
        "h5" -> NewsTile52(vm)
        else -> Box(m) { body(k) }
    }
}

@Composable
internal fun TLabel52(text: String, color: Color) =
    Text(text.uppercase(), color = color, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = 1.2.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)

@Composable
private fun TileBox52(bg: Color, label: String, modifier: Modifier, onClick: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.clip(SHAPE52).background(bg).then(if (Tone.glass) glassEdge50(SHAPE52) else Modifier)
            .clickable(role = Role.Button, onClickLabel = "Åpne $label", onClick = onClick).padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) { content() }
}

/** Varme (Bursdag) og mørke (Prøve) flisfarger som Middag og Avgang. */
private class TCol52(val bg: Color, val ink: Color, val lab: Color)

private val warm52: TCol52 get() = when { Tone.glass -> TCol52(Color(0x2EFF7A3D), Color.White, Color(0xFFFFB08A)); Tone.paperDark -> TCol52(Color(0xFF452C17), Color(0xFFF4E3CF), Color(0xFFF2C38F)); else -> TCol52(Color(0xFFF4E3CF), Color(0xFF3A2410), Color(0xFF8A4F12)) }

private val dark52: TCol52 get() = when { Tone.glass -> TCol52(Color(0x12FFFFFF), Color.White, Color(0xFFA9A397)); Tone.paperDark -> TCol52(Color(0xFF0F0E0C), Color(0xFFF3EFE6), Color(0xFFA9A397)); else -> TCol52(Color(0xFF1B1A17), Color(0xFFF3EFE6), Color(0xFFA9A397)) }

@Composable
private fun minute52(): LocalDateTime {
    var now by remember { mutableStateOf(LocalDateTime.now()) }
    LaunchedEffect(Unit) { while (true) { delay(60_000L - LocalDateTime.now().second * 1000L + 200L); now = LocalDateTime.now() } }
    return now
}

@Composable
private fun KalTile52(vm: AppViewModel, m: Modifier) {
    val p = PaperPal.current
    val s = vm.kal26
    LaunchedEffect(vm.base) { if (s.events == null) vm.loadKal26(quiet = true) }
    val now = minute52()
    val w = kalWidget(s.events ?: emptyList(), now, s.subjectColors)
    TileBox52(p.card, "Kalender", m, { Haptics.tap(); vm.openKal26(w.evId) }) {
        TLabel52("Kalender · " + w.k, p.lab)
        Spacer(Modifier.weight(1f))
        if (s.events == null) Text("Henter …", color = p.mut, fontSize = 13.sp)
        else {
            PSerif(w.title, 20.sp, p.ink, maxLines = 1) // prompt 80: én linje i 101 dp
            Text(listOf(w.big, w.whenText).filter { it.isNotBlank() }.joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun BdTile52(vm: AppViewModel, m: Modifier) {
    val c = warm52
    LaunchedEffect(vm.base) { if (vm.bd24.items == null) vm.loadBirthdays24(quiet = true) }
    val l = (vm.bd24.items ?: emptyList()).take(3)
    TileBox52(c.bg, "Bursdager", m, { Haptics.tap(); vm.openBirthdays24() }) {
        // Prompt 80: fast 101 dp – avatarene (24 dp) står på linje med etiketten i stedet for på egen rad.
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TLabel52("Bursdag", c.lab)
            Spacer(Modifier.weight(1f))
            if (l.isNotEmpty()) Box(Modifier.height(24.dp)) {
                l.forEachIndexed { i, b -> Box(Modifier.padding(start = (i * 16).dp).size(24.dp).clip(CircleShape).background(c.bg).padding(2.dp)) { BdAvatar(vm, b, 20) } }
            }
        }
        Spacer(Modifier.weight(1f))
        val f = l.firstOrNull()
        PSerif(f?.let { it.name.substringBefore(' ') + " " + it.whenText.lowercase() } ?: if (vm.bd24.items == null) "Henter …" else "Ingen ennå", 20.sp, c.ink, maxLines = 1)
        Text(f?.let { listOfNotNull(it.age?.let { a -> "fyller $a" }, it.short).joinToString(" · ") } ?: "Legg til bursdager", color = c.lab, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
    }
}

@Composable
private fun BoligTile52(vm: AppViewModel, m: Modifier) {
    val p = PaperPal.current
    val b = vm.homeBolig
    TileBox52(p.card, "Bolig", m, { Haptics.tap(); vm.paperTab("fin"); vm.openFromMer(Screen.Folders); b?.id?.toIntOrNull()?.let { vm.openFolder(it) } }) {
        TLabel52("Bolig", p.mut)
        Spacer(Modifier.weight(1f))
        if (b == null) Text("Utgifter og kvitteringer for boligen", color = p.mut, fontSize = 12.5.sp, maxLines = 3)
        else {
            // Prompt 80: fast 101 dp – beløp, én linje (budsjett · kvitteringer) og stripen.
            PSerif("${n0(b.spent)} kr", 22.sp, p.ink, maxLines = 1)
            Text((b.budget?.let { "av ${n0(it)} kr" } ?: "brukt denne måneden") + if (b.review > 0) " · ${b.review} kvittering${if (b.review == 1) "" else "er"}" else "",
                color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            b.budget?.takeIf { it > 0 }?.let { bud ->
                Box(Modifier.padding(top = 4.dp).fillMaxWidth().height(5.dp).clip(CircleShape).background(p.line)) {
                    Box(Modifier.height(5.dp).fillMaxWidth((b.spent / bud).toFloat().coerceIn(.02f, 1f)).clip(CircleShape).background(if (b.spent > bud) p.lab else p.ink))
                }
            }
        }
    }
}

@Composable
private fun TrialTile52(vm: AppViewModel, m: Modifier) {
    val c = dark52
    LaunchedEffect(vm.account?.id) { if (vm.p31.trials.isEmpty()) vm.loadTrials31() }
    val today = LocalDate.now()
    val top = vm.p31.trials.filter { it.status == "active" && trialDays32b(it.endsAt, today) >= 0 }.minByOrNull { it.endsAt }
    TileBox52(c.bg, "Prøveperioder", m, { Haptics.tap(); vm.openFromMer(Screen.Sub) }) {
        TLabel52("Prøve", Color(0xFFF29A8A))
        Spacer(Modifier.weight(1f))
        if (top == null) {
            PSerif("Ingen aktive", 22.sp, c.ink, maxLines = 1)
            Text("+ Legg til", color = c.lab, fontSize = 12.sp)
        } else {
            val d = trialDays32b(top.endsAt, today)
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                // Prompt 80: fast 101 dp – tallet 30 sp og tjeneste + pris på én linje (kortes med «…»).
                PSerif(if (d == 0) "I dag" else "$d", 30.sp, c.ink, weight = FontWeight.Normal, maxLines = 1)
                if (d > 0) Text(if (d == 1) "dag" else "dager", color = c.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.padding(bottom = 4.dp))
            }
            Text(top.service + if (top.priceAfter.isNotBlank()) " · ${top.priceAfter} etterpå" else "", color = c.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Siste nytt (3a): uansett hvor du trykker, åpner hele flisen nyhetsleseren – med en kort vibrasjon. */
@Composable
internal fun NewsTile52(vm: AppViewModel) {
    val p = PaperPal.current
    val items = vm.homeNews.ifEmpty { vm.news?.items?.take(5) ?: emptyList() }
    val top = items.firstOrNull()
    Column(
        Modifier.fillMaxWidth().clip(SHAPE52).background(p.card).then(if (Tone.glass) glassEdge50(SHAPE52) else Modifier)
            .clickable(role = Role.Button, onClickLabel = "Åpne nyhetsleseren") { Haptics.tap(); vm.openNews() }.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth()) {
            TLabel52("Siste nytt", p.mut)
            Spacer(Modifier.weight(1f))
            if (top != null) Text(feedShort(top.feed) + " · " + newsTime(top.published), color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, maxLines = 1)
        }
        if (top == null) { Text("Ingen saker ennå. Legg til kilder i nyhetsleseren.", color = p.mut, fontSize = 13.sp); return@Column }
        PSerif(top.title, 24.sp, p.ink, maxLines = 3)
        val rest = items.drop(1).take(2)
        if (rest.isNotEmpty()) Column(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                rest.forEach { x ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(feedShort(x.feed), color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, maxLines = 1, modifier = Modifier.width(30.dp))
                        PSerif(x.title, 15.sp, p.ink, maxLines = 1, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
        val more = items.size - 1 - rest.size
        Text(if (more > 0) "+ $more saker til ›" else "Åpne nyhetsleseren ›", color = p.mut, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
    }
}
