package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import kotlinx.coroutines.delay
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.PosCard
import no.kristo.finanshub.Screen
import no.kristo.finanshub.homeShown27
import no.kristo.finanshub.refreshHomeDeps27
import no.kristo.finanshub.ruterModeColor

/*
 * Prompt 50 (ANDROID50B, claude-code-hjem-fliser.md, fasit widget «h4»/«tl» i Mobil Papir App.dc.html, mal Hjem Retninger 1d):
 *  - Der minikortene (Finans · Mat · Domener, widget «hm») sto: 2 kolonner, 10 dp mellomrom, radius 24.
 *    Avgang 1×2 (min 212 dp, mørk) til venstre, Finans og Middag til høyre; Familie og Domener på raden under.
 *  - Fold/brett (≥ 600 dp): 3 kolonner som i fasiten (Avgang 1×2 | Finans, Familie | Middag, Domener).
 *  - Med fliser på skjules Avganger-kortet (h3) og Posisjon-kortet (h6) når flisene faktisk står i samme liste (Min reise vises fortsatt).
 *  - Farger per tema: lys (svart, sand, grønn), mørk (#0f0e0c, oklch(.32 .05 60), oklch(.31 .04 150) med lys tekst) og
 *    Liquid Glass (gjennomsiktige flater med glasskant). Finans og Domener bruker kortfargen.
 *  - Bryteren «Hjem som fliser» i Innstillinger → Utseende (papir_home_tiles, standard på).
 */

private class TileTok50(
    val av: Color, val avInk: Color, val mat: Color, val matInk: Color, val matLab: Color,
    val fam: Color, val famInk: Color, val famLab: Color, val ring: Color, val edge: Color?,
)

private val TILE_LIGHT50 = TileTok50(Color(0xFF1B1A17), Color(0xFFF3EFE6), Color(0xFFF4E3CF), Color(0xFF3A2410), Color(0xFF8A4F12),
    Color(0xFFE1ECE4), Color(0xFF1B1A17), Color(0xFF2F6B4A), Color(0xFFE1ECE4), null)
private val TILE_DARK50 = TileTok50(Color(0xFF0F0E0C), Color(0xFFF3EFE6), Color(0xFF452C17), Color(0xFFF4E3CF), Color(0xFFF2C38F),
    Color(0xFF213625), Color(0xFFE1ECE4), Color(0xFF9FD3B0), Color(0xFF213625), Color(0x14FFFFFF))
private val TILE_GLASS50 = TileTok50(Color(0x12FFFFFF), Color.White, Color(0x2EFF7A3D), Color.White, Color(0xFFFFB08A),
    Color(0x2E4D6BFF), Color.White, Color(0xFFAFC0FF), Color(0xFF1B1D33), Color(0x2EFFFFFF))

private val tileTok50: TileTok50 get() = if (Tone.glass) TILE_GLASS50 else if (Tone.paperDark) TILE_DARK50 else TILE_LIGHT50

private val TILE_SHAPE50 = RoundedCornerShape(24.dp)

/** h3 (Avganger) og h6 (Posisjon) skjules når flisene står i samme liste og ikke er skjult. */
internal fun tilesHide50(vm: AppViewModel, k: String, secs: List<PSec>): Boolean =
    (k == "h3" || k == "h6") && vm.homeTiles50() && secs.any { it.key == "hm" } && "hm" !in vm.pageHidden("hjem")

/** Én avgang i flisen: linje, farger, mål og minutter. */
private data class TileDep50(val line: String, val color: Long, val ink: Color, val to: String, val num: String, val unit: String)

@Composable
private fun tileDeps50(vm: AppViewModel): List<TileDep50> {
    if (homeRuter27(vm)) {
        val s = vm.b27
        val shown = vm.homeShown27()
        val rows = if (shown.size > 1) shown.mapNotNull { st -> (s.homeDeps[st.id]?.departures ?: emptyList()).firstOrNull { !it.cancelled } }
            else shown.firstOrNull()?.let { st -> (s.homeDeps[st.id]?.departures ?: emptyList()).filter { !it.cancelled }.take(2) } ?: emptyList()
        return rows.map { d ->
            val c = d.color ?: ruterModeColor(d.mode, d.line)
            val m = d.minutes
            TileDep50(d.line, c, lineInk28(c), d.to, m?.let { if (it <= 0) "nå" else "$it" } ?: hm50(d.expected ?: d.aimed), if (m != null && m > 0) "min" else "")
        }
    }
    val lines = vm.mobileHome?.ruter ?: emptyList()
    return lines.flatMap { l -> l.departures.map { d -> l to d } }.sortedBy { (_, d) -> d.min ?: Int.MAX_VALUE }.take(2).map { (l, d) ->
        val c = d.color ?: ruterModeColor(d.mode, d.line)
        TileDep50(d.line, c, d.textColor?.let { Color(it) } ?: lineInk28(c), d.to ?: l.to, d.min?.let { if (it <= 0) "nå" else "$it" } ?: d.time ?: "–",
            if ((d.min ?: 0) > 0) "min" else "")
    }
}

private fun hm50(t: String?): String = t?.let { Regex("""(\d{2}:\d{2})""").find(it)?.value ?: it } ?: "–"

/** Fliser på Hjem (widget «hm»). */
@Composable
internal fun HomeTiles50(vm: AppViewModel) {
    LaunchedEffect(Unit) { while (true) { vm.loadPositions(); delay(60_000) } }
    // Sanntid hvert 30. sekund mens Hjem er synlig (som Avganger-kortet).
    LaunchedEffect(Unit) { while (true) { delay(30_000); if (!vm.ruterOpen && vm.b27.homeStops?.isNotEmpty() == true) runCatching { vm.refreshHomeDeps27() } } }
    val deps = tileDeps50(vm)
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val wide = maxWidth >= 600.dp
        val gap = 10.dp
        if (wide) Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(gap)) {
            AvgangTile50(vm, deps, Modifier.weight(1f).fillMaxHeight())
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(gap)) { FinTile50(vm, Modifier.fillMaxWidth().weight(1f)); FamTile50(vm, Modifier.fillMaxWidth().weight(1f)) }
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(gap)) { MatTile50(vm, Modifier.fillMaxWidth().weight(1f)); DomTile50(vm, Modifier.fillMaxWidth().weight(1f)) }
        } else Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(gap)) {
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(gap)) {
                AvgangTile50(vm, deps, Modifier.weight(1f).fillMaxHeight())
                Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(gap)) {
                    FinTile50(vm, Modifier.fillMaxWidth().weight(1f))
                    MatTile50(vm, Modifier.fillMaxWidth().weight(1f))
                }
            }
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(gap)) {
                FamTile50(vm, Modifier.weight(1f).fillMaxHeight())
                DomTile50(vm, Modifier.weight(1f).fillMaxHeight())
            }
        }
    }
}

@Composable
private fun Tile50(bg: Color, label: String, modifier: Modifier, onClick: () -> Unit, pad: Boolean = false, edge: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    val t = tileTok50
    Column(
        modifier.clip(TILE_SHAPE50).background(bg).then(t.edge?.takeIf { edge || Tone.glass }?.let { if (Tone.glass) glassEdge50(TILE_SHAPE50) else Modifier.border(1.dp, it, TILE_SHAPE50) } ?: Modifier)
            .clickable(role = Role.Button, onClickLabel = "Åpne $label", onClick = onClick).padding(if (pad) 16.dp else 14.dp, if (pad) 16.dp else 14.dp),
        verticalArrangement = Arrangement.spacedBy(if (pad) 6.dp else 2.dp),
        content = content,
    )
}

@Composable
private fun TileLabel50(text: String, color: Color) = PLabel(text, color, 10.sp)

@Composable
private fun AvgangTile50(vm: AppViewModel, deps: List<TileDep50>, modifier: Modifier) {
    val t = tileTok50
    val r = deps.firstOrNull()
    val r2 = deps.getOrNull(1)
    Tile50(t.av, "Avganger", modifier.heightIn(min = 212.dp), { vm.openRuter() }, pad = true) {
        TileLabel50("Avgang", Color(0xFFF29A8A))
        Box(Modifier.widthIn(min = 34.dp).height(26.dp).clip(RoundedCornerShape(7.dp)).background(Color(0xFF000000 or ((r?.color ?: 0xFFA9D3F5) and 0xFFFFFF))).padding(horizontal = 5.dp),
            contentAlignment = Alignment.Center) {
            Text(r?.line ?: "–", color = r?.ink ?: Color(0xFF1B1A17), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, fontFamily = PaperFonts.sans, maxLines = 1)
        }
        Text(r?.to ?: "Henter avganger …", color = t.avInk, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, fontFamily = PaperFonts.sans, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.weight(1f))
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PSerif(r?.num ?: "", 64.sp, t.avInk, weight = FontWeight.Normal, maxLines = 1)
            if (r != null && r.unit.isNotEmpty()) Text(r.unit, color = Color(0xFFA9A397), fontWeight = FontWeight.SemiBold, fontSize = 14.sp, fontFamily = PaperFonts.sans, modifier = Modifier.padding(bottom = 10.dp))
        }
        if (r2 != null) Text("Så ${r2.line} ${r2.to} · ${r2.num}${if (r2.unit.isNotEmpty()) " ${r2.unit}" else ""}", color = Color(0xFFA9A397), fontWeight = FontWeight.SemiBold,
            fontSize = 12.5.sp, fontFamily = PaperFonts.sans, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun FinTile50(vm: AppViewModel, modifier: Modifier) {
    val p = PaperPal.current
    val saldo = vm.boot?.accounts?.sumOf { it.balance }
    val review = vm.boot?.reviewCount ?: vm.summary?.review?.size ?: 0
    Tile50(p.card, "Finans", modifier, { vm.paperTab("fin") }, edge = false) {
        TileLabel50("Finans", p.mut)
        PSerif(saldo?.let { neg0(it) } ?: "–", 26.sp, p.ink, maxLines = 1)
        Text(if (review > 0) "$review ${if (review == 1) "kvittering" else "kvitteringer"}" else "alt bokført", color = if (review > 0) p.lab else p.mut, fontSize = 12.sp, maxLines = 1)
    }
}

@Composable
private fun MatTile50(vm: AppViewModel, modifier: Modifier) {
    val t = tileTok50
    Tile50(t.mat, "Mat", modifier, { vm.paperTab("mat") }) {
        TileLabel50("Middag", t.matLab)
        PSerif(vm.todayMeal ?: "Ingen rett i dag", 20.sp, t.matInk, maxLines = 2)
    }
}

@Composable
private fun DomTile50(vm: AppViewModel, modifier: Modifier) {
    val p = PaperPal.current
    val dom = vm.domainToday
    Tile50(p.card, "Domener", modifier, { vm.domSection = "oversikt"; vm.go(Screen.Domains) }, edge = false) {
        TileLabel50("Domener", p.mut)
        PSerif(dom?.let { count(it.second) } ?: "–", 26.sp, p.ink, maxLines = 1)
        // Serveren gir ikke oppetid her, så flisen viser domenet i dag (som minikortet) – «besøk i dag».
        Text("● ${dom?.first ?: "besøk i dag"}", color = p.pos, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** «Alle på plass» når alle er i en kjent sone, ellers «Ingrid · Går · Bislett» for den første som er på vei. */
private fun famLine50(list: List<PosCard>?): String {
    if (list == null) return "Se hvor familien er"
    if (list.isEmpty()) return "Ingen i familien ennå"
    val away = list.filter { !it.self && it.zone == null && it.status == "fresh" }.ifEmpty { list.filter { it.self && it.zone == null && it.status == "fresh" } }
    val first = away.firstOrNull() ?: return "Alle på plass"
    return "${first.name} · ${first.line2}"
}

@Composable
private fun FamTile50(vm: AppViewModel, modifier: Modifier) {
    val t = tileTok50
    val list = vm.famPositions
    Tile50(t.fam, "Familie", modifier, { vm.openFamily() }) {
        TileLabel50("Familie", t.famLab)
        Spacer(Modifier.height(6.dp))
        val ppl = (list ?: emptyList()).take(5)
        if (ppl.isNotEmpty()) Box(Modifier.height(32.dp)) {
            ppl.forEachIndexed { i, c ->
                Box(Modifier.padding(start = (i * 24).dp).size(32.dp).clip(CircleShape).background(t.ring).padding(2.dp)) {
                    ServerImage(vm, c.photo, Modifier.size(28.dp).clip(CircleShape).background(Color(c.color))) {
                        Text(c.initials, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp, fontFamily = PaperFonts.sans, modifier = Modifier.align(Alignment.Center))
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(famLine50(list), color = t.famLab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, fontFamily = PaperFonts.sans, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
