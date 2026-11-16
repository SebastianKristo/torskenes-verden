package no.kristo.finanshub.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ViewWeek
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import androidx.compose.material3.Icon
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check

/* ======================= «Rediger fanelinjen» ======================= */

/** Én fane i arket: nøkkel, navn og ikon (tegn). */
internal data class NavEd32b(val key: String, val label: String, val icon: String)

/**
 * Arket «Rediger fanelinjen» (fasit: arket ne). Etikett «HJEM · FANELINJE», tittel Newsreader 26, Ferdig = SheetButton primary.
 * Ingen Avbryt: endringene lagres når arket lukkes (Ferdig, trykk utenfor eller dra ned). Rader: ikon (40, rund 12) · navn · ↑ · −.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun NavEditor32b(
    vm: AppViewModel, title: String, initial: List<NavEd32b>, all: List<NavEd32b>, max: Int, mer: Boolean, icons: List<String>,
    onSave: (List<NavEd32b>) -> Unit, onReset: () -> List<NavEd32b>, onClose: () -> Unit,
) {
    val p = PaperPal.current
    var items by remember { mutableStateOf(initial) }
    var dirty by remember { mutableStateOf(false) }
    var iconFor by remember { mutableStateOf<String?>(null) }
    fun set(v: List<NavEd32b>) { items = v; dirty = true }
    fun defLabel(k: String) = all.firstOrNull { it.key == k }?.label ?: k
    val close: () -> Unit = {
        if (dirty) onSave(items.map { if (it.label.isBlank()) it.copy(label = defLabel(it.key)) else it })
        onClose()
    }
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = close, sheetState = state, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 40.dp, height = 5.dp, color = p.line) },
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding()
                .padding(start = 18.dp, end = 18.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    PLabel("$title · fanelinje")
                    PSerif("Rediger fanelinjen", 26.sp, modifier = Modifier.padding(top = 4.dp), maxLines = 1)
                }
                SheetButton30("Ferdig", onClick = close)
            }
            Text("${items.size} av $max faner" + if (mer) " · Mer ligger alltid sist" else "", color = p.mut, fontSize = 12.5.sp, fontFamily = PaperFonts.sans)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(12.dp, 2.dp)) {
                items.forEachIndexed { i, t ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Column(Modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(
                                Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(p.bg)
                                    .border(if (iconFor == t.key) 1.5.dp else 1.dp, if (iconFor == t.key) p.ink else p.line, RoundedCornerShape(12.dp))
                                    .clickable(role = Role.Button, onClickLabel = "Velg ikon") { iconFor = if (iconFor == t.key) null else t.key },
                                contentAlignment = Alignment.Center,
                            ) { GlyphIcon(t.icon, p.ink, 19.dp) }
                            BasicTextField(
                                t.label, { v -> set(items.map { if (it.key == t.key) it.copy(label = v.take(18)) else it }) }, singleLine = true,
                                textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, fontFamily = PaperFonts.sans),
                                cursorBrush = SolidColor(p.lab),
                                modifier = Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).padding(horizontal = 12.dp),
                                decorationBox = { inner -> Box(Modifier.fillMaxHeight(), contentAlignment = Alignment.CenterStart) { if (t.label.isEmpty()) Text(defLabel(t.key), color = p.mut, fontSize = 15.sp); inner() } },
                            )
                            Box(
                                Modifier.size(40.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).alpha(if (i > 0) 1f else .3f)
                                    .clickable(enabled = i > 0, role = Role.Button, onClickLabel = "Flytt opp") { Haptics.select(); set(items.toMutableList().also { l -> val x = l[i]; l[i] = l[i - 1]; l[i - 1] = x }) },
                                contentAlignment = Alignment.Center,
                            ) { Text("↑", color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold) }
                            Box(
                                Modifier.size(36.dp).clip(CircleShape).alpha(if (items.size > 1) 1f else .3f)
                                    .clickable(enabled = items.size > 1, role = Role.Button, onClickLabel = "Fjern") { Haptics.select(); set(items.filter { it.key != t.key }) },
                                contentAlignment = Alignment.Center,
                            ) { Text("−", color = p.lab, fontSize = 22.sp, fontWeight = FontWeight.Bold) }
                        }
                        if (iconFor == t.key) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            icons.forEach { ic ->
                                val on = ic == t.icon
                                Box(
                                    Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(if (on) p.ink else p.bg).border(1.dp, p.line, RoundedCornerShape(12.dp))
                                        .clickable(role = Role.Button, onClickLabel = "Velg dette ikonet") { set(items.map { if (it.key == t.key) it.copy(icon = ic) else it }); iconFor = null }
                                        .semantics { selected = on },
                                    contentAlignment = Alignment.Center,
                                ) { GlyphIcon(ic, if (on) p.bg else p.ink) }
                            }
                        }
                    }
                }
            }
            NavStyleSection25(vm, items.map { TabItem(it.key, it.label.ifBlank { defLabel(it.key) }, it.icon) }, mer = mer)
            if (title == Moduler.oversikt || title == "Økonomi") HomeBtnSection42(vm) // Prompt 42: HJEM-KNAPP · FORHÅNDSVISNING
            if (title == Moduler.oversikt) PCard { ScanHomeRow41(vm) } // Prompt 41: samme valg som Innstillinger → Tilpass → Fanelinje
            val missing = all.filter { a -> items.none { it.key == a.key } }
            if (missing.isNotEmpty() && items.size < max) {
                PLabel("Legg til")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    missing.forEach { m ->
                        Row(
                            Modifier.height(40.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
                                .clickable(role = Role.Button, onClickLabel = "Legg til i fanelinja") { Haptics.select(); set(items + m) }.padding(horizontal = 14.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
                        ) {
                            GlyphIcon(m.icon, p.ink, 15.dp)
                            Text("+ ${m.label}", color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            Text(
                "Tilbakestill til standard", color = p.mut, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { Haptics.select(); items = onReset(); dirty = false }.padding(4.dp, 10.dp),
            )
        }
    }
}

/** Ikonene en side-fane kan få: sidens egne tegn og Hjem-ikonene. */
private fun secIcons32b(sec: String): List<String> =
    ((SEC32B[sec]?.second?.map { it.third } ?: emptyList()) + listOf("◎", "◍", "⚡", "▤", "⌂", "◔", "↻", "◌", "♡", "≡", "▥") + TAB_ICONS).distinct()

/** «Rediger fanelinjen» for Domener, Abonnement eller Familie (vm.p32b.secEdit). */
@Composable
internal fun SecNavEditor32b(vm: AppViewModel) {
    val sec = vm.p32b.secEdit ?: return
    val def = SEC32B[sec] ?: return
    val all = def.second.map { NavEd32b(it.first, it.second, it.third) }
    key(sec) {
        NavEditor32b(
            vm, def.first, vm.secTabs32b(sec).map { NavEd32b(it.first, it.second, it.third) }, all, all.size, mer = false, icons = secIcons32b(sec),
            onSave = { l -> vm.saveSecNav32b(sec, l.map { Triple(it.key, it.label, it.icon) }) },
            onReset = { vm.resetSecNav32b(sec); all },
            onClose = { vm.p32b.secEdit = null },
        )
    }
}

/** Innstillinger → Utseende og fanelinje: FANELINJE · ANDRE SIDER. */
@Composable
internal fun SecNavSettings32b(vm: AppViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Fanelinje · andre sider", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            SEC32B.entries.forEachIndexed { i, (sec, d) ->
                val n = vm.secTabs32b(sec).size
                SetRow(vm, i + 2, Icons.Filled.ViewWeek, d.first, "$n av ${d.second.size} faner · hold inne på fanelinjen", "Rediger ›", top = i > 0) { Haptics.select(); vm.p32b.secEdit = sec }
            }
        }
    }
}

/* ---------------- Innhold under fanelinjen ---------------- */

/** Boksen tegnes [up] høyere enn plassen sin og flyttes like mye opp: toppen ligger i fotovinduet, bunnen ved skjermkanten. */
internal fun Modifier.underNav34(up: Dp): Modifier = this.layout { m, c ->
    val e = up.roundToPx()
    val maxH = if (c.hasBoundedHeight) c.maxHeight + e else c.maxHeight
    val pl = m.measure(c.copy(minHeight = (c.minHeight + e).coerceAtMost(maxH), maxHeight = maxH))
    layout(pl.width, (pl.height - e).coerceAtLeast(0)) { pl.place(0, -e) }
}

/* ======================= Fanelinja: Hjem-knappen ======================= */

/** Hjem-knappen skal skjule «‹ Hjem» øverst på modulens toppside (ikke på undersider eller sider uten fanelinje). */
internal fun navHomeHidesBack42(vm: AppViewModel, wide: Boolean, backLabel: String): Boolean =
    !wide && vm.navHome42() != "standard" && backLabel == "Hjem" && vm.paperPage != "set" && vm.screen != Screen.Settings

/** 1a: rund knapp med samme høyde og bakgrunn som fanelinja, til venstre for den (linja flyttes 62 + 12 dp). */
@Composable
internal fun HomeCircle42(vm: AppViewModel, home: Boolean) {
    val p = PaperPal.current
    Box(
        Modifier.size(62.dp).shadow(16.dp, CircleShape).clip(CircleShape).background(if (home) p.navAct else p.nav)
            .clickable(role = Role.Button, onClickLabel = Moduler.oversikt) { Haptics.tap(); vm.goHome42() }.semantics { contentDescription = Moduler.oversikt },
        contentAlignment = Alignment.Center,
    ) { GlyphIcon("⌂", if (home) p.navActInk else p.navInk, 22.dp) }
}

/** 1b: Hjem-ikonet som første plass i pillen, med en tynn strek mot fanene. */
@Composable
internal fun RowScope.HomeSlot42(vm: AppViewModel, home: Boolean) {
    val p = PaperPal.current
    Box(
        Modifier.size(46.dp).clip(CircleShape).background(if (home) p.navAct else Color.Transparent)
            .clickable(role = Role.Button, onClickLabel = Moduler.oversikt) { Haptics.tap(); vm.goHome42() }.semantics { contentDescription = Moduler.oversikt },
        contentAlignment = Alignment.Center,
    ) { GlyphIcon("⌂", if (home) p.navActInk else p.navInk, 20.dp) }
    Box(Modifier.padding(horizontal = 4.dp).width(1.dp).height(26.dp).background(p.navInk.copy(alpha = .3f)).align(Alignment.CenterVertically))
}

/** 1c: hevet rød knapp (60 dp, 5 dp ring i bakgrunnsfargen) som ligger over midten av fanelinja. */
@Composable
internal fun HomeRaised42(vm: AppViewModel, home: Boolean, modifier: Modifier = Modifier) {
    val p = PaperPal.current
    Box(
        modifier.size(60.dp).shadow(10.dp, CircleShape).clip(CircleShape).background(if (home) p.navAct else p.bg).padding(5.dp).clip(CircleShape).background(p.lab)
            .clickable(role = Role.Button, onClickLabel = Moduler.oversikt) { Haptics.tap(); vm.goHome42() }.semantics { contentDescription = Moduler.oversikt },
        contentAlignment = Alignment.Center,
    ) { GlyphIcon("⌂", p.onLab, 22.dp) }
}

/**
 * Modulene i 1d (designets MODN): nøkkel, navn og ikon. Fase 6: Oversikt først, så de faste fanene fra modullisten (toppmeny,
 * Q6) og de andre sidene som hadde plass her før, til sammen 11, og «Alle» (Mer) sist. Navn og ikon kommer fra modullisten.
 */
private val MODS42: List<Triple<String, String, String>>
    get() {
        val faner = MAIN_TABS
        val nokler = (Moduler.liste.toppmeny.mapNotNull { no.kristo.felles.moduler.Fanenokler.fra(it) } +
            listOf("finans", "mat", "sporing", "domener", "familie", "boliger", "abonnementer", "kalender", "huske", "chat"))
            .filter { k -> k != "hjem" && faner.any { it.id == k } }.distinct().take(10)
        return listOf(Triple("hjem", Moduler.oversikt, "⌂")) +
            nokler.mapNotNull { k -> faner.firstOrNull { it.id == k }?.let { Triple(it.id, it.label, it.icon) } } +
            Triple("mer", "Alle", "⋯")
    }

/** Modulen du er i nå (for «kr Finans ▴»). */
internal fun curModule42(vm: AppViewModel): String = when {
    vm.paperPage == "mer" -> "mer"
    vm.screen == Screen.Homelab && vm.paperPage == null -> "hjem"
    vm.screen == Screen.Folders -> "boliger"
    vm.screen == Screen.Sub -> "abonnementer"
    vm.screen == Screen.Mat -> "mat"
    vm.screen == Screen.Tracking -> "sporing"
    vm.screen == Screen.Domains -> "domener"
    vm.screen.isFinance || vm.paperPage == "fmer" || vm.paperPage == "fsok" -> "finans"
    else -> "mer"
}

/** 1d: første plass viser modulen («kr Finans ▴», på Hjem «⌂ Hjem ▴»). Trykk åpner rutenettet. */
@Composable
internal fun RowScope.ModuleChip42(vm: AppViewModel) {
    val p = PaperPal.current
    val m = MODS42.firstOrNull { it.first == curModule42(vm) } ?: MODS42.last()
    val open = vm.p42.modPick
    Row(
        Modifier.height(46.dp).clip(CircleShape).background(p.navAct).clickable(role = Role.Button, onClickLabel = "Velg modul") { Haptics.select(); vm.p42.modPick = !open }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        GlyphIcon(m.third, p.navActInk, 16.dp)
        Text(m.second, color = p.navActInk, style = TAB_TEXT24, maxLines = 1)
        Text(if (open) "▾" else "▴", color = p.navActInk, fontSize = 11.sp)
    }
    Box(Modifier.padding(horizontal = 3.dp).width(1.dp).height(26.dp).background(p.navInk.copy(alpha = .3f)).align(Alignment.CenterVertically))
}

/** 1d: rutenettet (3 kolonner) med Hjem (rød) og alle modulene. Trykk utenfor lukker. */
@Composable
internal fun BoxScope.ModPicker42(vm: AppViewModel, bottom: Dp) {
    if (!vm.p42.modPick) return
    val p = PaperPal.current
    val cur = curModule42(vm)
    Box(Modifier.matchParentSize().clickable(remember { MutableInteractionSource() }, null) { vm.p42.modPick = false })
    Column(
        Modifier.align(Alignment.BottomCenter).padding(start = 12.dp, end = 12.dp, bottom = bottom).fillMaxWidth()
            .shadow(18.dp, RoundedCornerShape(26.dp)).clip(RoundedCornerShape(26.dp)).background(p.nav).padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        MODS42.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (k, n, ic) ->
                    val act = k == cur
                    val bg = when { k == "hjem" -> p.lab; act -> p.navAct; else -> Color.White.copy(alpha = .08f) }
                    val fg = when { k == "hjem" -> p.onLab; act -> p.navActInk; else -> p.navInk }
                    Column(
                        Modifier.weight(1f).height(66.dp).clip(RoundedCornerShape(18.dp)).background(bg).clickable(role = Role.Button, onClickLabel = n) {
                            Haptics.select(); vm.p42.modPick = false
                            if (k == "hjem") vm.goHome42() else { vm.paperPage = null; vm.mainTab(k) }
                        },
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                    ) {
                        GlyphIcon(ic, fg, 20.dp)
                        Spacer(Modifier.height(4.dp))
                        Text(n, color = fg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    }
                }
            }
        }
    }
}

/** Liten forhåndsvisning av fanelinja i et valg (bare ikoner, så ingen tekst renner ut). */
@Composable
internal fun NavHomePreview42(k: String, modifier: Modifier = Modifier) {
    val p = PaperPal.current
    val tabs = listOf("kr", "◐", "◎", "⋯")
    @Composable
    fun RowScope.ic(g: String, on: Boolean) = Box(Modifier.weight(1f).height(22.dp).clip(CircleShape).background(if (on) p.navAct else Color.Transparent), contentAlignment = Alignment.Center) {
        GlyphIcon(g, if (on) p.navActInk else p.navInk, 12.dp)
    }
    Box(modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(androidx.compose.ui.graphics.Brush.verticalGradient(*HERO_FALLBACK)).padding(6.dp, 6.dp)) {
        when (k) {
            "standard" -> Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
                Box(Modifier.height(10.dp).clip(CircleShape).background(Color(0x8C1B1A17)).padding(horizontal = 5.dp), contentAlignment = Alignment.Center) { Text("‹ ${Moduler.oversikt}", color = Color.White, fontSize = 6.5.sp, lineHeight = 7.sp, maxLines = 1) }
                Row(Modifier.fillMaxWidth().height(22.dp).clip(CircleShape).background(p.nav).padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) { tabs.forEachIndexed { i, g -> ic(g, i == 0) } }
            }
            "1a" -> Row(Modifier.fillMaxWidth().align(Alignment.BottomCenter), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.size(22.dp).clip(CircleShape).background(p.nav), contentAlignment = Alignment.Center) { GlyphIcon("⌂", p.navInk, 12.dp) }
                Row(Modifier.weight(1f).height(22.dp).clip(CircleShape).background(p.nav).padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) { tabs.forEachIndexed { i, g -> ic(g, i == 0) } }
            }
            "1b" -> Row(Modifier.fillMaxWidth().height(22.dp).align(Alignment.BottomCenter).clip(CircleShape).background(p.nav).padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                ic("⌂", false)
                Box(Modifier.width(1.dp).height(12.dp).background(p.navInk.copy(alpha = .35f)))
                tabs.forEachIndexed { i, g -> ic(g, i == 0) }
            }
            "1c" -> Box(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().height(22.dp).align(Alignment.BottomCenter).clip(CircleShape).background(p.nav).padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    ic(tabs[0], true); ic(tabs[1], false); Spacer(Modifier.width(26.dp)); ic(tabs[2], false); ic(tabs[3], false)
                }
                Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp).size(26.dp).clip(CircleShape).background(p.bg).padding(2.5.dp).clip(CircleShape).background(p.lab), contentAlignment = Alignment.Center) {
                    GlyphIcon("⌂", p.onLab, 12.dp)
                }
            }
            else -> Row(Modifier.fillMaxWidth().height(22.dp).align(Alignment.BottomCenter).clip(CircleShape).background(p.nav).padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(Modifier.height(18.dp).clip(CircleShape).background(p.navAct).padding(horizontal = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("kr ▴", color = p.navActInk, fontSize = 7.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, lineHeight = 8.sp)
                }
                tabs.drop(1).forEach { g -> ic(g, false) }
            }
        }
    }
}

/** Et valg-kort: forhåndsvisning, navn, kort forklaring og ✓ (mørk kant på valgt). */
@Composable
private fun NavHomeCard42(vm: AppViewModel, k: String, n: String, d: String, modifier: Modifier, compact: Boolean) {
    val p = PaperPal.current
    val on = vm.navHome42() == k
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(p.card).border(if (on) 2.dp else 1.dp, if (on) p.ink else p.line, RoundedCornerShape(18.dp))
            .clickable(role = Role.RadioButton, onClickLabel = n) { vm.setNavHome42(k) }.padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        NavHomePreview42(k)
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(n, color = p.ink, fontWeight = FontWeight.Bold, fontSize = if (compact) 13.sp else 14.5.sp, maxLines = 2, lineHeight = 17.sp)
                Text(d, color = p.mut, fontSize = 12.sp, maxLines = if (compact) 3 else 2, lineHeight = 15.sp, overflow = TextOverflow.Ellipsis)
            }
            if (on) Icon(Icons.Filled.Check, contentDescription = "Valgt", tint = p.ink, modifier = Modifier.size(18.dp))
        }
    }
}

/** «Rediger fanelinjen» → HJEM-KNAPP · FORHÅNDSVISNING: kort i 2 kolonner, trykk endrer med en gang. */
@Composable
internal fun HomeBtnSection42(vm: AppViewModel) {
    PLabel("Hjem-knapp · forhåndsvisning")
    NAV_HOME42.chunked(2).forEach { row ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { (k, n, d) -> NavHomeCard42(vm, k, n, d, Modifier.weight(1f), compact = true) }
            if (row.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

/** Innstillinger → Tilpass → Fanelinje → Hjem-knapp: arket med alle valgene og Ferdig. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun NavHomeSheet42(vm: AppViewModel) {
    val p = PaperPal.current
    val close = { vm.p42.navHomeSheet = false }
    ModalBottomSheet(
        onDismissRequest = close, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = p.bg, contentColor = p.ink,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp), dragHandle = { BottomSheetDefaults.DragHandle(width = 40.dp, height = 5.dp, color = p.line) },
    ) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(start = 18.dp, end = 18.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    PLabel("Fanelinje")
                    PSerif("Hjem-knapp", 26.sp, maxLines = 1)
                }
                SheetButton30("Ferdig", onClick = close)
            }
            Text("Velg hvordan du kommer hjem fra modulene. Med 1a–1d forsvinner «‹ ${Moduler.oversikt}» øverst på modulens forside.", color = p.mut, fontSize = 13.sp, lineHeight = 18.sp)
            NAV_HOME42.forEach { (k, n, d) -> NavHomeCard42(vm, k, n, d, Modifier.fillMaxWidth(), compact = false) }
        }
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
        if (!float && !noScanHere(vm)) ScanPress(vm, bar, Modifier, 56.dp, RoundedCornerShape(18.dp), onTap, onHold) { Icon(Icons.Filled.Add, contentDescription = null, tint = p.onLab, modifier = Modifier.size(26.dp)) }
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
                .clickable(interactionSource = src, indication = null, role = Role.Button, onClickLabel = "Til Oversikt") { Haptics.select(); vm.settingsPage = null; vm.paperTab("hjem") }
                .semantics(mergeDescendants = true) { contentDescription = "Til Oversikt" }
                .padding(horizontal = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
        ) {
            WxIcon(P25_HOUSE, p.onLab, 20.dp, stroke = 2.2f)
            Text(Moduler.oversikt, color = p.onLab, style = TAB_TEXT24.copy(fontSize = 11.5.sp, lineHeight = 13.sp), maxLines = 1)
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
                Icon(Icons.Filled.Add, contentDescription = null, tint = p.onLab, modifier = Modifier.size(26.dp))
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
