package no.kristo.finanshub.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 25 (Android): sidelinjen på Fold med rød Hjem-knapp, fanelinje-stil (Innstillinger og «Rediger fanelinjen» → STIL),
 * ikoner i Mer, fremdrift og Avbryt for AI-søk, og fremheving av en rad i Innstillinger («Ta meg dit →»).
 */

/* ---------------- Strekikoner fra designet (Mobil Papir App → Mer), 24 × 24 ---------------- */

internal const val P25_HOUSE = "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"

private val MER_PATHS25: Map<String, String> = mapOf(
    "hjem" to P25_HOUSE,
    // Prompt 46: Kart (holdeplasser, sanntid og soner) og «Logg inn på annen enhet» (QR).
    "tkart" to "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
    "qrlogin" to "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2M17 17h.01",
    "brief" to "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 3v3M20.5 4.5h-3", // prompt 36: ✦ Now Brief
    "domener" to "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
    "sporing" to "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
    "bursdag" to "M4 11h16v9H4zM2 7h20v4H2zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1zM12 7c1.5-3 5-3 5-1s-3 1-5 1z",
    "kalender" to "M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h.01M8 17h2",
    "studie" to "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6", // prompt 44: Studie (studenthatt)
    "chat" to "M4 5h16v11H9l-5 4zM9 10.5h6",
    "huske" to "M4 4h16v16H4zM8 12l3 3 5-6", // prompt 37: ☑ Gjøremål
    "bibel" to "M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 7v7M8.5 9.5h5", // prompt 37: Bibel
    "kart" to "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    "media" to "M5 4l14 8-14 8z",
    "finans" to "M3 6h18v12H3zM3 10h18M7 15h4",
    "abo" to "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3", // Prompt 28: Subscription OS (to piler i ring)
    "rss" to "M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M6 18h.01",
    "innst" to "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
)

/** Ikonet til venstre i Mer: 40 × 40 (radius 12, papirfarge) med strekikon 21 (strek 1,9) i fargen fra ikonpaletten. */
@Composable
internal fun MerIcon25(vm: AppViewModel, i: Int, key: String) {
    val p = PaperPal.current
    val pal = iconPalette(vm.iconTheme)
    val c = Color(pal[((i % pal.size) + pal.size) % pal.size])
    // Prompt 40: Økonomi-ikon 3c (hvit lommebok med budsjettring på #1B2A40) for Finans.
    if (key == "finans") { Okonomi40Icon(40.dp, 12.dp); return }
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(p.bg), contentAlignment = Alignment.Center) {
        WxIcon(MER_PATHS25[key] ?: "M12 12h.01", c, 21.dp, stroke = 1.9f)
    }
}

/* ---------------- Sidelinjen på Fold (bredde ≥ 600 dp) ---------------- */

/**
 * Loddrett variant av den flytende fanelinja: 84 bred, radius 28, padding 12 / 6, avstand 4, samme farge som fanelinja
 * på telefonen (nav / navInk / navAct). Ikon på alle faner (vektorikoner, aldri tekst) og navn på én linje under,
 * utenom i «Bare ikoner». Øverst en rød Hjem-knapp (60) når man ikke er på Hjem.
 */
@Composable
internal fun PaperRail25(vm: AppViewModel, bar: String, float: Boolean, modifier: Modifier, onTap: () -> Unit, onHold: () -> Unit) {
    val p = PaperPal.current
    val tabs = navTabs(vm, bar, float)
    val cur = navCurrent(vm, bar)
    val home = vm.screen == Screen.Homelab && vm.paperPage == null
    val style = NavStyle25.v
    val shape = RoundedCornerShape(28.dp)
    Column(
        modifier.width(84.dp).fillMaxHeight()
            .shadow(16.dp, shape, ambientColor = Color.Black.copy(alpha = .5f), spotColor = Color.Black.copy(alpha = .5f))
            .clip(shape).background(p.nav)
            .longPressEdit26(bar == "main" || bar == "fin", bar) { Haptics.tap(); if (bar == "fin") vm.b26.finEdit = true else vm.tabEdit = true }
            .padding(horizontal = 6.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AnimatedVisibility(
            visible = !home,
            enter = fadeIn(tween(150)) + scaleIn(tween(150), initialScale = .8f),
            exit = fadeOut(tween(150)) + scaleOut(tween(150), targetScale = .8f),
        ) { RedHome25(vm) }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            tabs.forEach { t -> RailTab25(t.label, t.icon, cur == t.key, style) { if (cur == t.key) vm.tabReselect26(bar, t) else t.go(); Haptics.select() } }
        }
        if (!float && !noScanHere(vm)) ScanPress(vm, bar, Modifier, 56.dp, RoundedCornerShape(18.dp), onTap, onHold) { Text("+", color = p.onLab, fontSize = 22.sp) }
    }
}

/**
 * Prompt 41 (claude-code-fold-hjem-knapp.md): rød Hjem-knapp med samme form som den aktive fanen («Oversikt»):
 * full bredde i linja, 58 høy, radius 18, ikon 20 over «Hjem» (samme skrift som fanene), lab / onLab, skygge som før,
 * 8 luft ned til første fane og trykkeffekt 0,96 som fanene. TalkBack: «Til Hjem».
 */
@Composable
private fun RedHome25(vm: AppViewModel) {
    val p = PaperPal.current
    val src = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val sc by animateFloatAsState(if (pressed) .96f else 1f, tween(120), label = "home41")
    val shape = RoundedCornerShape(18.dp)
    Box(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(
            Modifier.fillMaxWidth().height(58.dp).graphicsLayer { scaleX = sc; scaleY = sc }
                .shadow(12.dp, shape, ambientColor = Color.Black.copy(alpha = .5f), spotColor = Color.Black.copy(alpha = .5f))
                .clip(shape).background(p.lab)
                .clickable(interactionSource = src, indication = null, role = Role.Button, onClickLabel = "Til Hjem") { Haptics.select(); vm.settingsPage = null; vm.paperTab("hjem") }
                .semantics(mergeDescendants = true) { contentDescription = "Til Hjem" }
                .padding(horizontal = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
        ) {
            WxIcon(P25_HOUSE, p.onLab, 20.dp, stroke = 2.2f)
            Text("Hjem", color = p.onLab, style = TAB_TEXT24.copy(fontSize = 11.5.sp, lineHeight = 13.sp), maxLines = 1)
        }
    }
}

/** Én fane i sidelinja: 58 høy, radius 18, ikon og navn under (Manrope 600 11,5, én linje). */
@Composable
internal fun RailTab25(label: String, icon: String, on: Boolean, style: String, onClick: () -> Unit) {
    val p = PaperPal.current
    val fg = if (on) p.navActInk else p.navInk
    val showLabel = style != "icons"
    Column(
        Modifier.fillMaxWidth().height(58.dp).clip(RoundedCornerShape(18.dp)).background(if (on) p.navAct else Color.Transparent)
            .clickable(role = Role.Tab, onClickLabel = label, onClick = onClick)
            .then(if (showLabel) Modifier else Modifier.semantics { contentDescription = label })
            .padding(horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
    ) {
        GlyphIcon(icon, fg, if (showLabel) 20.dp else 22.dp)
        if (showLabel) Text(label, color = fg, style = TAB_TEXT24.copy(fontSize = 11.5.sp, lineHeight = 13.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/* ---------------- Fanelinje-stil: «Rediger fanelinjen» → STIL ---------------- */

/** STIL · FORHÅNDSVISNING (stor, med dine egne faner, Mer og skanneknappen) og de tre stil-kortene. Valget brukes med en gang. */
@Composable
internal fun NavStyleSection25(vm: AppViewModel, items: List<TabItem>, mer: Boolean = true) {
    val p = PaperPal.current
    // Prompt 32: sider uten «Mer» (Domener, Abonnement, Familie) viser ingen ⋯ i forhåndsvisningen.
    val prev = remember(items, mer) { if (mer) items.filter { it.id != "mer" }.take(3).map { it.label to it.icon } + ("Mer" to "⋯") else items.take(4).map { it.label to it.icon } }
    PLabel("Stil · forhåndsvisning")
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
            .background(Brush.verticalGradient(*HERO_FALLBACK)).padding(12.dp, 18.dp),
    ) { NavPreview25(prev, NavStyle25.v, big = true) }
    PLabel("Stil")
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        NAV_STYLES25.forEach { (k, n, _) ->
            val on = NavStyle25.v == k
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(p.card).border(2.dp, if (on) p.ink else Color.Transparent, RoundedCornerShape(16.dp))
                    .clickable(role = Role.RadioButton, onClickLabel = n) { vm.setNavStyle25(k) }.padding(8.dp, 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                NavPreview25(prev.take(3), k, big = false)
                Text(n, color = p.ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, lineHeight = 15.sp)
            }
        }
    }
}

/** Forhåndsvisning av fanelinja i en stil. Første fane er valgt. Stor = full størrelse med skanneknapp. */
@Composable
private fun NavPreview25(tabs: List<Pair<String, String>>, style: String, big: Boolean) {
    val p = PaperPal.current
    if (big) {
        Row(
            Modifier.fillMaxWidth().height(62.dp).shadow(16.dp, CircleShape).clip(CircleShape).background(p.nav).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            tabs.forEachIndexed { i, (n, ic) -> PaperTab24(n, ic, i == 0, p.navInk, p.navActInk, p.navAct, style = style) {} }
            Box(Modifier.padding(start = 4.dp).size(46.dp).clip(CircleShape).background(p.lab), contentAlignment = Alignment.Center) {
                Text("+", color = p.onLab, fontSize = 22.sp)
            }
        }
    } else {
        Row(
            Modifier.fillMaxWidth().height(30.dp).clip(CircleShape).background(p.nav).padding(horizontal = 3.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            tabs.forEachIndexed { i, (n, ic) -> MiniTab25(n, ic, i == 0, style) }
        }
    }
}

@Composable
private fun RowScope.MiniTab25(label: String, icon: String, on: Boolean, style: String) {
    val p = PaperPal.current
    val showIcon = style != "text" || on
    val showLabel = style == "text" || (style == "icons_active_label" && on)
    val fg = if (on) p.navActInk else p.navInk
    Row(
        (if (style == "icons" || !on) Modifier.weight(1f) else Modifier).height(24.dp).clip(CircleShape).background(if (on) p.navAct else Color.Transparent)
            .padding(horizontal = if (on && showLabel) 6.dp else 2.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterHorizontally),
    ) {
        if (showIcon) GlyphIcon(icon, fg, if (showLabel) 10.dp else 13.dp)
        if (showLabel) Text(label, color = fg, fontSize = 8.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Clip, lineHeight = 9.sp)
    }
}

/** Verdien i raden «Fanelinje-stil» i Innstillinger, og neste stil ved trykk. */
internal fun navStyleName25(): String = NAV_STYLES25.firstOrNull { it.first == NavStyle25.v }?.second ?: "Tekst"
internal fun navStyleSub25(): String = NAV_STYLES25.firstOrNull { it.first == NavStyle25.v }?.third ?: NAV_STYLES25[0].third
internal fun nextNavStyle25(): String {
    val i = NAV_STYLES25.indexOfFirst { it.first == NavStyle25.v }.coerceAtLeast(0)
    return NAV_STYLES25[(i + 1) % NAV_STYLES25.size].first
}

/* ---------------- AI-søk: fremdrift og Avbryt ---------------- */

/** «✦ Ollama tenker … 34 s av 60 s» med fremdriftslinje og Avbryt, mens AI-søket går som jobb. */
@Composable
internal fun AiJobCard25(vm: AppViewModel, modifier: Modifier = Modifier) {
    val p = PaperPal.current
    val j = vm.p25.job ?: return
    val frac = j.limitS?.let { (j.elapsedS.toFloat() / it).coerceIn(0f, 1f) }
    val shown by animateFloatAsState(frac ?: 0f, tween(900), label = "aiJob")
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp, 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(j.text, color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Box(
                Modifier.height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape)
                    .clickable(role = Role.Button, onClickLabel = "Avbryt AI-søket") { Haptics.select(); vm.cancelAiJob25() }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Avbryt", color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
        }
        Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(p.line)) {
            if (frac != null) Box(Modifier.fillMaxHeight().fillMaxWidth(shown).clip(RoundedCornerShape(2.dp)).background(p.lab))
            else Box(Modifier.fillMaxHeight().fillMaxWidth(.15f).clip(RoundedCornerShape(2.dp)).background(p.lab))
        }
    }
}

/* ---------------- Innstillinger: fremheving («Ta meg dit →» og søketreff) ---------------- */

/**
 * Raden med denne nøkkelen fremheves når vm.p25.hl peker på den: scrolles fram, lys rød bakgrunn og rød strek
 * til venstre i ca. 3 s, som så toner ut.
 */
@OptIn(ExperimentalFoundationApi::class)
internal fun Modifier.hl25(vm: AppViewModel, key: String): Modifier = composed {
    val p = PaperPal.current
    val on = vm.p25.hl == key
    val req = remember { BringIntoViewRequester() }
    val a = remember { Animatable(0f) }
    val seq = vm.p25.hlSeq
    LaunchedEffect(on, seq) {
        if (!on) { a.snapTo(0f); return@LaunchedEffect }
        a.snapTo(1f)
        delay(350)
        runCatching { req.bringIntoView() }
        delay(2300)
        a.animateTo(0f, tween(700))
        if (vm.p25.hl == key && vm.p25.hlSeq == seq) vm.p25.hl = null
    }
    // Tegnes over innholdet (et kort har egen bakgrunn): svak rød flate og rød strek til venstre.
    this.bringIntoViewRequester(req).drawWithContent {
        drawContent()
        val v = a.value
        if (v > 0f) {
            drawRect(p.lab.copy(alpha = .12f * v))
            drawRect(p.lab.copy(alpha = v), size = Size(3.dp.toPx(), size.height))
        }
    }
}

/** Nøkkelen for en vanlig rad i Innstillinger (SetRow) er tittelen. */
internal fun rowKey25(title: String): String = "row:$title"

/* ---------------- Vær på Fold ---------------- */

/** true når værsiden har bred layout (≥ 700 dp): detaljarkene åpnes da som sidepanel til høyre. */
internal val LocalWxWide25 = compositionLocalOf { false }
