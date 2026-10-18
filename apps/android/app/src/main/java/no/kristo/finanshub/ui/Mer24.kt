package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 24 (A): felles komponenter som skal være like på iOS og Android.
 *  - Fanelinje: ikon ved siden av tekst (claude-code-familie-design.md): egen Row, ikonboks 18 × 18 med glyf 16, flyttet 1,5 ned,
 *    7 mellomrom, pille 46 høy med padding 0 16 (valgt) og 0 6 (uvalgt). Bare valgt fane viser ikon. Teksten uten fontpadding.
 *  - «Mer» (claude-code-mer-lik.md): ett kort, rader 13 / 14, Newsreader 500 19, undertekst 12,5, «›», skillelinjer bare mellom rader,
 *    ingen grå rippel (kort trykk-opasitet 0,6). Prompt 25: ikon i 40-boks til venstre.
 */

/** Manrope 600 12,5 med linjehøyde 12,5 og uten fontpadding, så teksten står på samme høyde som ikonet. */
internal val TAB_TEXT24: TextStyle = TextStyle(
    fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, lineHeight = 12.5.sp,
    platformStyle = PlatformTextStyle(includeFontPadding = false),
    lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.Both),
)

/**
 * Én fane i Papir-linjene (Hjem, Finans, Domener, Abonnementer, Familie).
 * Prompt 25: stilen (Innstillinger → Fanelinje-stil) gjelder alle linjene:
 *  - «text»: navn på alle, ikon (16) bare på valgt
 *  - «icons»: ikon (20) på alle i like brede felt, ingen navn (navnet er contentDescription)
 *  - «icons_active_label»: ikon (20) på alle, valgt fane viser ikon (16) og navn i pillen
 */
@Composable
internal fun RowScope.PaperTab24(
    label: String, icon: String, on: Boolean, ink: Color, actInk: Color, act: Color, serif: Boolean = false,
    style: String = NavStyle25.v, onClick: () -> Unit,
) {
    val showIcon = style != "text" || on
    val showLabel = style == "text" || (style == "icons_active_label" && on)
    val glyph = if (showLabel) 16 else 20
    val equal = style == "icons" || !on
    Row(
        (if (equal) Modifier.weight(1f) else Modifier).height(46.dp).clip(CircleShape).background(if (on) act else Color.Transparent)
            .clickable(role = Role.Tab, onClickLabel = label, onClick = onClick)
            .then(if (showLabel) Modifier else Modifier.semantics { contentDescription = label })
            .padding(horizontal = if (on && showLabel) 16.dp else 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally),
    ) {
        // Tegn-ikoner (◎ ◌ ♡ ⋯ i Familie) i Newsreader 500, ellers vektorikon.
        if (showIcon) Box(Modifier.size((glyph + 2).dp).offset(y = if (showLabel) 1.5.dp else 0.dp), contentAlignment = Alignment.Center) {
            val c = if (on) actInk else ink
            if (serif) Text(icon, color = c, style = TAB_TEXT24.copy(fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = glyph.sp, lineHeight = glyph.sp), maxLines = 1)
            else GlyphIcon(icon, c, glyph.dp)
        }
        if (showLabel) Text(label, color = if (on) actInk else ink, style = TAB_TEXT24, maxLines = 1, overflow = TextOverflow.Clip)
    }
}

/** En rad i Mer: ikon (40-boks, strekikon i palettfarge), tittel (Newsreader 500 19), undertekst og «›». */
@Composable
private fun MerRow24(vm: AppViewModel, i: Int, icon: String, title: String, sub: String, top: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().press24 { Haptics.select(); onClick() }.padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MerIcon25(vm, i, icon)
            Column(Modifier.weight(1f)) {
                PSerif(title, 19.sp, maxLines = 1)
                Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text("›", color = p.mut, fontSize = 17.sp)
        }
    }
}

private class MerItem24(val icon: String, val title: String, val sub: String, val go: () -> Unit)

/**
 * Mer (side «mer»): Sporing (eller Domener når Sporing er en fane), Bursdager, Huskeliste, Familie og kart, Media, Finans,
 * Nyhetsleser og Innstillinger. Faner som allerede står i fanelinja tas ut. I en profil (Finans + Boliger) står Hjem først.
 * Prompt 25: ikon til venstre på hver rad (som i Innstillinger).
 */
@Composable
internal fun PaperMore24(vm: AppViewModel, navBottom: Dp, barSpace: Dp) {
    val inBar = vm.tabBarItems().map { it.id }.toSet()
    val onWay = vm.packagesOnWay
    val sporingInBar = "sporing" in inBar || (vm.tabBar.isEmpty() && vm.tab4 == "sporing")
    val rows = buildList {
        if (vm.b24ProfileOn) add(MerItem24("hjem", "Hjem", "Pakker, avganger og widgets") { vm.paperTab("hjem") })
        if (sporingInBar) { if ("domener" !in inBar) add(MerItem24("domener", "Domener", "Trafikk, besøk og oppetid") { vm.domSection = "oversikt"; vm.openFromMer(Screen.Domains) }) }
        else add(MerItem24("sporing", "Sporing", if (onWay > 0) "$onWay pakker på vei" else "Pakker og sendinger") { vm.openFromMer(Screen.Tracking) })
        add(MerItem24("bursdag", "Bursdager", "Hvem har bursdag snart") { vm.openBirthdays24() })
        add(MerItem24("huske", "Huskeliste", "Oppgaver og widgets") { vm.openTasks() })
        if ("familie" !in inBar) add(MerItem24("kart", "Familie og kart", "Posisjon, soner og helse") { vm.openFamily() })
        if ("media" !in inBar) add(MerItem24("media", "Media", "Spilles nå og historikk") { vm.openPaperPage("media") })
        if ("finans" !in inBar) add(MerItem24("finans", "Finans", "Oversikt, liste, Finn og mer") { vm.paperTab("fin") })
        if ("nyheter" !in inBar) add(MerItem24("rss", "Nyhetsleser", "RSS med AI-sammendrag") { vm.openNews() })
        add(MerItem24("innst", "Innstillinger", "Tema, bakgrunn og konto") { vm.openPaperPage("set") })
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, barSpace + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            PCard(shadow = true) {
                rows.forEachIndexed { i, r -> MerRow24(vm, i, r.icon, r.title, r.sub, top = i > 0, onClick = r.go) }
            }
        }
    }
}
