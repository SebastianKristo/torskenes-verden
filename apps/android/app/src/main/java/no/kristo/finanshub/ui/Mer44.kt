package no.kristo.finanshub.ui

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.ChronoUnit

/*
 * Prompt 44 (claude-code-mer-ny-design.md, fasit Mer Ny.dc.html): Mer med levende kort.
 *  - «Søk i moduler» øverst filtrerer kortene og verktøylista på navn og undertekst.
 *  - Store (standard): HVERDAG OG FAMILIE som 2 × 2 kort (150, 22 hjørner; 4 i rad på stor skjerm) med levende innhold, VERKTØY som liste.
 *  - Lave: ingen kort og ingen overskrifter; Kalender, Gjøremål, Bursdager og Familie blir rader i samme liste.
 *  - Store · Lave vises bare i wiggle-redigering (hold inne), lagres per konto (papir_mer_tsz). Innstillinger står nederst som egen rad.
 *  Rekkefølge, skjulte og wiggle er som før (MerList28 / papir_mer).
 */

private val DAILY44 = listOf("kalender", "huske", "bursdag", "kart")

internal object Mer44 {
    var q by mutableStateOf("")
    fun key(vm: AppViewModel) = "papir_mer_tsz_" + (vm.account?.id ?: "")
    fun low(vm: AppViewModel): Boolean = vm.prefs.str(key(vm), "store") == "lave"
}

/** Levende undertekst; aldri plassholdere. */
internal fun liveSub44(vm: AppViewModel, key: String, def: String): String = when (key) {
    "kalender" -> nextEv44(vm)?.let { (t, w) -> "Neste: $t · $w" } ?: "Ingen hendelser i dag"
    "huske" -> vm.tasks?.items?.count { !it.done }?.let { "$it åpne for familien" } ?: def
    "bursdag" -> nextBd44(vm)?.let { (n, d) -> "$n ${dLabel44(d)}" } ?: if (vm.bd24.items != null) "Ingen bursdager de neste 30 dagene" else def
    "kart" -> home44(vm)?.let { (h, n) -> "$h av $n hjemme" } ?: def
    "media" -> {
        val dl = vm.p43.torrents?.count { it.progress < 1f && it.state == "dl" } ?: 0
        val nx = vm.p43.upcoming?.firstOrNull { it.day >= LocalDate.now().toString() }?.title
        listOfNotNull(if (dl > 0) "$dl lastes ned" else null, nx?.let { "neste: $it" }).joinToString(" · ").ifBlank { def }
    }
    else -> def
}

private fun dLabel44(d: Long) = when (d) { 0L -> "i dag"; 1L -> "i morgen"; else -> "om $d dager" }

private fun nextEv44(vm: AppViewModel): Pair<String, String>? {
    val now = LocalTime.now(); val today = LocalDate.now()
    val e = vm.kal26.events.orEmpty().filter { (it.date == today && (it.allDay || (it.end ?: it.start ?: LocalTime.MAX) >= now)) || it.date.isAfter(today) }
        .sortedWith(compareBy({ it.date }, { it.start ?: LocalTime.MIN })).firstOrNull() ?: return null
    val day = when (e.date) { today -> "i dag"; today.plusDays(1) -> "i morgen"; else -> "${e.date.dayOfMonth}.${e.date.monthValue}." }
    return e.title to (day + (e.start?.let { " " + it.toString().take(5) } ?: ""))
}

private fun nextBd44(vm: AppViewModel): Pair<String, Long>? {
    val today = LocalDate.now()
    val b = vm.bd24.items.orEmpty().minByOrNull { it.next } ?: return null
    val d = ChronoUnit.DAYS.between(today, b.next)
    return if (d > 30) null else firstName37(b.name) to d
}

private fun home44(vm: AppViewModel): Pair<Int, Int>? {
    val m = vm.family?.members?.takeIf { it.isNotEmpty() } ?: return null
    return m.count { it.last?.place?.contains("hjem", ignoreCase = true) == true } to m.size
}

/** Ikke-redigering: søkefelt, kort/rader og Innstillinger. Kalles fra MerList28. */
internal fun LazyListScope.mer44(vm: AppViewModel, vis: List<MerItem28>, wide: Boolean, onLong: () -> Unit) {
    val (sok52, tit52, vkt52) = Mer52.vis(vm, "mer") // prompt 52: skjul søkefelt og titler (wiggle)
    if (sok52) item(key = "mer44-q") { MerSearch44() }
    val q = norm44(Mer44.q)
    val rows = vis.filter { it.key != "innst" }.map { MerItem28(it.key, it.title, liveSub44(vm, it.key, it.sub), it.index, it.go) }
        .filter { q.isEmpty() || norm44(it.title).contains(q) || norm44(it.sub).contains(q) }
    val low = Mer44.low(vm)
    // Prompt 45 (claude-code-mer-tittel-og-store-bokser.md): brukeren velger de fire store boksene og kan skjule/gi nytt navn til tittelen.
    val big = Mer45.big(vm)
    val cards = if (low) emptyList() else big.mapNotNull { k -> rows.firstOrNull { it.key == k } }
    val tools = if (low) rows else rows.filter { it.key !in big }
    if (cards.isNotEmpty()) {
        if (tit52 && Mer45.showTitle(vm)) item(key = "mer44-hl") { PLabel(Mer45.title(vm), modifier = Modifier.padding(start = 4.dp, top = 4.dp)) }
        cards.chunked(if (wide) 4 else 2).forEachIndexed { i, ch ->
            item(key = "mer44-c$i") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ch.forEach { r -> MerCard44(vm, r, Modifier.weight(1f), onLong) }
                    repeat((if (wide) 4 else 2) - ch.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
    if (tools.isNotEmpty()) {
        if (!low && vkt52) item(key = "mer44-tl") { PLabel("Verktøy", modifier = Modifier.padding(start = 4.dp, top = 6.dp)) }
        item(key = "mer-card") { PCard(shadow = true) { tools.forEachIndexed { i, r -> MerRowNormal28(vm, r, top = i > 0, onLong = onLong) } } }
    }
    if (rows.isEmpty()) item(key = "mer44-none") { Text("Ingen moduler heter «${Mer44.q}».", color = PaperPal.current.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp)) }
    vis.firstOrNull { it.key == "innst" }?.takeIf { q.isEmpty() || norm44(it.title).contains(q) }?.let { st ->
        item(key = "mer44-set") {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (PaperPal.current.bg.luminance44() > .5f) Color(0xFFE9E2D4) else PaperPal.current.card)) {
                MerRowNormal28(vm, st, top = false, onLong = onLong)
            }
        }
    }
    item(key = "mer-hint") {
        Text("Hold inne for å endre rekkefølgen, skjule moduler eller velge Store · Lave.", color = PaperPal.current.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(4.dp, 2.dp))
    }
}

private fun Color.luminance44(): Float = .2126f * red + .7152f * green + .0722f * blue

@Composable
private fun MerSearch44() {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().padding(top = 4.dp).heightIn(min = 48.dp).shadow(6.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(p.card)
        .padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("⌕", color = p.mut, fontSize = 17.sp)
        Box(Modifier.weight(1f).padding(start = 8.dp)) {
            if (Mer44.q.isEmpty()) Text("Søk i moduler", color = p.mut, fontSize = 15.sp)
            BasicTextField(Mer44.q, { Mer44.q = it }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 15.sp), cursorBrush = SolidColor(p.lab), modifier = Modifier.fillMaxWidth())
        }
        if (Mer44.q.isNotEmpty()) Text("✕", color = p.mut, modifier = Modifier.semantics { contentDescription = "Tøm søket" }.size(40.dp).clip(CircleShape).clickable { Mer44.q = "" }.wrapContentSize())
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MerCard44(vm: AppViewModel, r: MerItem28, modifier: Modifier, onLong: () -> Unit) {
    val p = PaperPal.current
    Column(modifier.height(150.dp).shadow(8.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black.copy(alpha = .25f), spotColor = Color.Black.copy(alpha = .25f))
        .clip(RoundedCornerShape(22.dp)).background(p.card)
        .combinedClickable(role = Role.Button, onClickLabel = r.title, onLongClick = { Haptics.tap(); onLong() }) { Haptics.select(); r.go() }.padding(14.dp),
        verticalArrangement = Arrangement.SpaceBetween) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(30.dp)) { MerIcon25(vm, r.index, r.key) }
            Text(r.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            when (r.key) {
                "kalender" -> {
                    val e = nextEv44(vm)
                    Text(if (e != null) "Neste" else "I dag", color = p.mut, fontSize = 12.sp)
                    PSerif(e?.first ?: "Ingen hendelser i dag", 20.sp, maxLines = 2)
                    e?.let { Text(it.second.replaceFirstChar { c -> c.uppercase() }, color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1) }
                }
                "huske" -> {
                    val n = vm.tasks?.items?.count { !it.done }
                    PSerif(n?.toString() ?: "–", 40.sp, maxLines = 1)
                    Text("åpne for familien", color = p.mut, fontSize = 12.sp, maxLines = 1)
                }
                "bursdag" -> {
                    val b = nextBd44(vm)
                    Text("Snart", color = p.mut, fontSize = 12.sp)
                    PSerif(b?.first ?: "Ingen de neste 30 dagene", 20.sp, maxLines = 2)
                    b?.let { Text(dLabel44(it.second), color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 12.sp) }
                }
                "kart" -> {
                    val m = vm.family?.members.orEmpty()
                    if (m.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy((-8).dp)) {
                        m.take(4).forEach { x ->
                            Box(Modifier.size(28.dp).clip(CircleShape).background(x.color?.let { Color(it) } ?: p.ink).border(2.dp, p.card, CircleShape), contentAlignment = Alignment.Center) {
                                Text(x.name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                    Text(home44(vm)?.let { (h, n) -> "$h av $n hjemme" } ?: r.sub, color = p.mut, fontSize = 12.sp, maxLines = 2)
                }
                // Prompt 45: andre moduler valgt som stor boks viser den levende underteksten.
                else -> PSerif(r.sub, 18.sp, maxLines = 3)
            }
        }
    }
}

/** I wiggle-redigering: Store · Lave (ved Ferdig). */
@Composable
internal fun MerSize44(vm: AppViewModel) {
    val p = PaperPal.current
    var low by remember(vm.account?.id) { mutableStateOf(Mer44.low(vm)) }
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.Center) {
        Row(Modifier.clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).padding(3.dp)) {
            listOf(false to "Store", true to "Lave").forEach { (v, n) ->
                Box(Modifier.heightIn(min = 40.dp).clip(CircleShape).background(if (low == v) p.ink else Color.Transparent)
                    .clickable(role = Role.Tab) { Haptics.select(); low = v; vm.prefs.set(Mer44.key(vm), if (v) "lave" else "store") }.padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
                    Text(n, color = if (low == v) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
        }
    }
}

/** Data til kortene hentes stille når Mer åpnes. */
@Composable
internal fun MerLoad44(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) {
        if (vm.kal26.events == null) runCatching { vm.loadKal26(quiet = true) }
        if (vm.bd24.items == null) runCatching { vm.loadBirthdays24(quiet = true) }
        if (vm.tasks == null) runCatching { vm.refreshTasks37() }
        if (vm.family == null) runCatching { vm.loadFamily() }
    }
}
