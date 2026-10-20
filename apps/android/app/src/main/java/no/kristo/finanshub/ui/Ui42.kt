package no.kristo.finanshub.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 42 (ANDROID42): Hjem-knappen i fanelinja (Standard / 1a / 1b / 1c / 1d med forhåndsvisning), Vel fremme-fanen i Familie,
 * Innstillinger → Helse (Familie) med Home Assistant, personvern og widget-valgene som lå i den slettede klassiske Utseende-siden,
 * og PostNord-logoen som er pakket med appen. Fasit: design_handoff_homelab/prompts/prompt-42-pakke/design/Mobil Papir App.dc.html
 * (navHome / nhVals / nhHide, Innstillinger → HELSE (FAMILIE)), Navbar Hjem-knapp Forslag.dc.html og Familie.dc.html (Vel fremme).
 */

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
            .clickable(role = Role.Button, onClickLabel = "Hjem") { Haptics.tap(); vm.goHome42() }.semantics { contentDescription = "Hjem" },
        contentAlignment = Alignment.Center,
    ) { GlyphIcon("⌂", if (home) p.navActInk else p.navInk, 22.dp) }
}

/** 1b: Hjem-ikonet som første plass i pillen, med en tynn strek mot fanene. */
@Composable
internal fun RowScope.HomeSlot42(vm: AppViewModel, home: Boolean) {
    val p = PaperPal.current
    Box(
        Modifier.size(46.dp).clip(CircleShape).background(if (home) p.navAct else Color.Transparent)
            .clickable(role = Role.Button, onClickLabel = "Hjem") { Haptics.tap(); vm.goHome42() }.semantics { contentDescription = "Hjem" },
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
            .clickable(role = Role.Button, onClickLabel = "Hjem") { Haptics.tap(); vm.goHome42() }.semantics { contentDescription = "Hjem" },
        contentAlignment = Alignment.Center,
    ) { GlyphIcon("⌂", p.onLab, 22.dp) }
}

/** Modulene i 1d (designets MODN): nøkkel, navn og ikon. «mer» = Alle. */
private val MODS42 = listOf(
    Triple("hjem", "Hjem", "⌂"), Triple("finans", "Finans", "kr"), Triple("mat", "Mat", "◐"), Triple("sporing", "Sporing", "▣"),
    Triple("domener", "Domener", "◎"), Triple("familie", "Familie", "◉"), Triple("boliger", "Boliger", "⌂"), Triple("abonnementer", "Abonnement", "↻"),
    Triple("kalender", "Kalender", "▦"), Triple("huske", "Gjøremål", "☑"), Triple("chat", "Chat", "✉"), Triple("mer", "Alle", "⋯"),
)

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
                Box(Modifier.height(10.dp).clip(CircleShape).background(Color(0x8C1B1A17)).padding(horizontal = 5.dp), contentAlignment = Alignment.Center) { Text("‹ Hjem", color = Color.White, fontSize = 6.5.sp, lineHeight = 7.sp, maxLines = 1) }
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
            if (on) Text("✓", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
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
            Text("Velg hvordan du kommer hjem fra modulene. Med 1a–1d forsvinner «‹ Hjem» øverst på modulens forside.", color = p.mut, fontSize = 13.sp, lineHeight = 18.sp)
            NAV_HOME42.forEach { (k, n, d) -> NavHomeCard42(vm, k, n, d, Modifier.fillMaxWidth(), compact = false) }
        }
    }
}

/* ======================= Familie → Vel fremme ======================= */

private val VF_GREEN42 = Color(0xFF2F9E5B)
private val VF_RED42 = Color(0xFFD9412E)
private val VF_GOLD42 = Color(0xFFE2B33C)

/** Rekkefølge i «Aktive i familien»: forsinket først, så på vei, så sjekket inn. */
private fun vfRank42(state: String): Int = when (state) { "late" -> 0; "checked_in", "checkedIn", "inne" -> 2; else -> 1 }

private fun vfTitle42(m: HlMember40): String {
    val n = firstName37(m.name)
    val min = hlMinutes40(m.eta)
    return when (m.state) {
        "late" -> "$n er ${min?.takeIf { it < 0 }?.let { "${-it} min " } ?: ""}forsinket"
        "checked_in", "checkedIn", "inne" -> "$n sjekket inn"
        else -> "$n er på vei hjem"
    }
}

private fun vfSub42(m: HlMember40): String = when (m.state) {
    "late" -> "Trykk for siste posisjon og ring"
    "checked_in", "checkedIn", "inne" -> listOfNotNull(m.share?.optString("place")?.takeIf { it.isNotBlank() }, hlClock40(m.since)).joinToString(" · ").ifBlank { "Sjekket inn" }
    else -> (hlClock40(m.eta)?.let { "Hjemme ca. $it" } ?: "På vei") + " · i rute"
}

/** Statuslinja over kartet når en Vel fremme-økt pågår («Vel fremme på · Rune er på vei · 12 min»). Trykk åpner fanen. */
@Composable
internal fun VelFremmeStatus42(vm: AppViewModel) {
    val p = PaperPal.current
    val h = vm.p40.hl ?: return
    val meId = vm.myUserId40()
    val mine = h.mine?.takeIf { it.state != "home" && it.state != "ended" }
    val others = h.household.filter { it.userId != meId && it.userId != h.mine?.userId && it.state !in setOf("home", "ended") }.sortedBy { vfRank42(it.state) }
    val first = others.firstOrNull()
    if (mine == null && first == null) return
    val text = when {
        first != null -> "Vel fremme på · " + vfTitle42(first).replace(" er på vei hjem", " er på vei") + (hlMinutes40(first.eta)?.takeIf { it >= 0 }?.let { " · $it min" } ?: "")
        else -> "Vel fremme på · du er på vei" + (hlMinutes40(mine?.eta)?.takeIf { it >= 0 }?.let { " · $it min" } ?: "")
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(16.dp))
            .clickable(role = Role.Button) { vm.famTab = "velfremme" }.padding(12.dp, 9.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        HlDot40(if (first?.state == "late") "late" else "onTheWay", 22.dp)
        Text(text, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Text("›", color = p.mut, fontSize = 15.sp)
    }
}

/**
 * Fanen Vel fremme (tidligere Hjemlys): tittel med lys-prikken, «Hva vil du si fra om?» (På vei hjem · Sjekket inn · Drar snart · Drar nå),
 * egen økt, «Aktive i familien» (forsinket først) og Glimt-forslaget («Ja, start» / «Ikke nå»).
 */
@Composable
internal fun VelFremmeTab42(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p40
    LaunchedEffect(vm.account?.id) { vm.loadHjemlys40(force = true) }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(30_000); vm.loadHjemlys40(force = true) } }
    val h = s.hl
    val meId = vm.myUserId40()
    val mine = h?.mine?.takeIf { it.state != "home" && it.state != "ended" }
    val others = (h?.household ?: emptyList()).filter { it.userId != meId && it.userId != h?.mine?.userId && it.state !in setOf("home", "ended") }.sortedBy { vfRank42(it.state) }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(horizontal = 4.dp)) {
            HlDot40(mine?.state, 34.dp)
            Column(Modifier.weight(1f)) {
                PSerif("Vel fremme", 26.sp, maxLines = 1)
                Text("Si fra til de du vil når du er trygt fremme.", color = p.mut, fontSize = 13.sp, maxLines = 2)
            }
        }
        if (s.hlMissing) Text("Vel fremme finnes ikke på serveren ennå. Oppdater Homelab.", color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
        if (mine != null) HjemlysCard40(vm)
        else {
            PLabel("Hva vil du si fra om?", modifier = Modifier.padding(start = 4.dp))
            val opts = listOf(
                Triple("På vei hjem", "Med tid og «Alt OK?»", true), Triple("Sjekket inn", "Jeg er fremme", false),
                Triple("Drar snart", "Om 15 min, 30 min, 1 t", false), Triple("Drar nå", "Hjem, annet sted eller ikke oppgi", false),
            )
            opts.chunked(2).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { (n, d, main) ->
                        Column(
                            Modifier.weight(1f).heightIn(min = 92.dp).clip(RoundedCornerShape(20.dp)).background(if (main) p.ink else p.card)
                                .then(if (main) Modifier else Modifier.border(1.dp, p.line, RoundedCornerShape(20.dp)))
                                .clickable(role = Role.Button, onClickLabel = n) { Haptics.tap(); s.hlSheet = true }.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(n, color = if (main) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1)
                            Text(d, color = if (main) p.bg.copy(alpha = .75f) else p.mut, fontSize = 12.sp, lineHeight = 15.sp, maxLines = 2)
                        }
                    }
                }
            }
        }
        if (others.isNotEmpty()) {
            PLabel("Aktive i familien", modifier = Modifier.padding(start = 4.dp, top = 4.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                others.forEachIndexed { i, m ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    val dot = when (m.state) { "late" -> VF_RED42; "checked_in", "checkedIn", "inne" -> VF_GOLD42; else -> VF_GREEN42 }
                    Row(
                        Modifier.fillMaxWidth().clickable(role = Role.Button) {
                            Haptics.tap()
                            if (m.state == "late") { s.hlLateFor = m.userId; s.hlSheet = true }
                            else { vm.famSelect(m.userId); vm.famTab = "kart" }
                        }.padding(14.dp, 12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(40.dp).clip(CircleShape).background(AV39_BG), contentAlignment = Alignment.Center) {
                            Text(initials39(m.name), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
                        }
                        Column(Modifier.weight(1f)) {
                            Text(vfTitle42(m), color = if (m.state == "late") VF_RED42 else p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(vfSub42(m), color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Box(Modifier.size(10.dp).clip(CircleShape).background(dot))
                    }
                }
            }
        }
        // Glimt-forslaget (1b) under valgene, med samme kortstil.
        if (mine == null) Suggest40(vm, false)
    }
}

/* ======================= Innstillinger → Helse (Familie) ======================= */

/**
 * HELSE (FAMILIE): Apple Health og Health Connect (flyttet fra Familie → Helse), hva som deles med familien, og
 * Home Assistant · Mobilapp (enheter, koble til person, velg sensorer og lagre).
 */
@Composable
internal fun HealthFamily42(vm: AppViewModel, hcState: Int, myShare: Set<String>, onAsk: () -> Unit) {
    val p = PaperPal.current
    val members = vm.family?.members ?: emptyList()
    val appleOn = members.any { m -> m.last?.device?.let { it.contains("iPhone", true) || it.contains("iPad", true) } == true && m.health != null }
    val hcOn = hcState == 0 && myShare.isNotEmpty()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Helse (Familie)", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        PCard {
            PRow("Apple Health", "Koblet til via appen · iPhone", if (appleOn) "✓ Koblet" else "Koble til", if (appleOn) p.pos else p.lab, serif = false) {
                vm.flash("Apple Health godkjennes i Homelab-appen på iPhone (Innstillinger → Helse og posisjon)")
            }
            PRow("Health Connect", "Koblet til via appen · Android", if (hcOn) "✓ Koblet" else "Koble til", if (hcOn) p.pos else p.lab, serif = false, top = true) { onAsk() }
            PRow("Hva deles med familien", HEALTH_KEYS.filter { it.first in myShare }.joinToString(", ") { it.second.lowercase() }.ifBlank { "Ingenting ennå" }.replaceFirstChar { it.uppercase() },
                "", serif = false, top = true)
        }
        HaHealth42(vm)
    }
}

/** Home Assistant · Mobilapp: enhetene fra HA Companion med antall helsesensorer, kobling til person og sensorvalg. */
@Composable
private fun HaHealth42(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p42
    LaunchedEffect(vm.account?.id) { vm.loadHa42() }
    PLabel("Home Assistant · Mobilapp", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
    when {
        s.haMissing -> PCard { Text("Serveren har ikke helse fra Home Assistant ennå. Oppdater Homelab, og koble til Home Assistant under Innstillinger → Integrasjoner.",
            color = p.mut, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(14.dp)) }
        s.haError != null -> PCard {
            Text(s.haError ?: "", color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(14.dp, 12.dp, 14.dp, 4.dp))
            PRow("Prøv igjen", null, "↻", serif = false, top = true) { vm.loadHa42(force = true) }
        }
        s.haDevices == null -> PCard { Text(if (s.haBusy) "Henter enhetene fra Home Assistant …" else "Ingen enheter ennå.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp)) }
        s.haDevices!!.isEmpty() -> PCard { Text("Fant ingen enheter fra Mobilapp-integrasjonen i Home Assistant.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp)) }
        else -> PCard {
            s.haDevices!!.forEachIndexed { i, d -> HaDeviceRow42(vm, d, i > 0) }
        }
    }
    Text("Alle i familien har allerede Home Assistant-appen. Da leser Homelab skritt, puls og søvn derfra. Hver person godkjenner deling første gang, og kan trekke den tilbake.",
        color = p.mut, fontSize = 12.sp, lineHeight = 16.5.sp, modifier = Modifier.padding(horizontal = 6.dp))
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HaDeviceRow42(vm: AppViewModel, d: HaDevice42, top: Boolean) {
    val p = PaperPal.current
    val s = vm.p42
    val open = s.haOpen == d.id
    val people = s.haPeople
    val person = people.firstOrNull { it.id == d.personId }
    val ios = d.platform.contains("ios") || d.name.contains("iPhone", true) || d.name.contains("iPad", true)
    val none = d.sensors.isEmpty()
    Column(Modifier.fillMaxWidth()) {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().clickable(enabled = !none) { s.haOpen = if (open) null else d.id }.padding(14.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(d.name, color = if (none) p.mut else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(d.model, d.entities.takeIf { it > 0 }?.let { "$it entiteter" },
                    if (none) "Ingen helsesensorer" else "${d.sensors.size} helsesensorer").joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1)
                d.unavailableSince?.let { Text("Ingen data fra ${d.name} siden ${hlClock40(it) ?: it}", color = p.lab, fontSize = 12.sp, maxLines = 1) }
            }
            if (!none) Text(person?.name?.let { firstName37(it) } ?: "Koble til ›", color = if (person != null) p.ink else p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
        if (open && !none) {
            var pid by remember(d.id) { mutableStateOf(d.personId ?: haGuess42(d, people)?.id) }
            var sel by remember(d.id) { mutableStateOf(d.sensors.filter { it.on }.map { it.key }.toSet()) }
            Column(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (ios) Text("Begrenset på iPhone: bare skritt, etasjer og aktivitet fra HA. Puls og søvn krever Homelab-appen (Apple Health).",
                    color = p.mut, fontSize = 12.sp, lineHeight = 16.sp)
                PLabel("Koble til person", p.mut)
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    (listOf(HaPerson42("", "Ingen")) + people).forEach { pp ->
                        val on = (pid ?: "") == pp.id
                        Box(Modifier.height(34.dp).clip(CircleShape).background(if (on) p.ink else p.bg).border(1.dp, if (on) p.ink else p.line, CircleShape)
                            .clickable { pid = pp.id.ifBlank { null } }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                            Text(if (pp.id.isBlank()) pp.name else firstName37(pp.name), color = if (on) p.bg else p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                        }
                    }
                }
                PLabel("Sensorer", p.mut)
                d.sensors.forEachIndexed { i, x ->
                    PToggle(x.label, x.entity.ifBlank { null }, x.key in sel, top = i > 0) { on -> sel = if (on) sel + x.key else sel - x.key }
                }
                PButton("Lagre", Modifier.fillMaxWidth(), height = 46.dp) { vm.saveHa42(d, pid, sel); s.haOpen = null }
            }
        }
    }
}

/* ======================= Tilpass: personvern og widgets (fra den slettede klassiske Utseende-siden) ======================= */

/** «Skjul beløp til jeg trykker», widget-stil (One UI) og låseskjerm-widgetene. Lå bare i Material You-«Klassisk» før prompt 42. */
@Composable
internal fun LookExtras42(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Personvern", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PToggle("Skjul beløp til jeg trykker", "Beløp vises som prikker til du trykker på saldoen eller øyet", vm.flag(AppPrefs.HIDE_AMOUNTS)) { vm.setPref(AppPrefs.HIDE_AMOUNTS, it) }
        }
        PLabel("Widgets · One UI-stil", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            var alpha by remember { mutableStateOf(vm.optionInt(AppPrefs.W_ALPHA, 75).toFloat()) }
            Row(Modifier.fillMaxWidth().padding(12.dp, 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("system" to "Som systemet", "dark" to "Mørk", "light" to "Lys").forEach { (k, n) ->
                    val on = vm.option(AppPrefs.W_THEME, "system") == k
                    Box(Modifier.weight(1f).height(38.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).border(1.dp, if (on) p.ink else p.line, CircleShape)
                        .clickable(role = Role.RadioButton) { vm.setPref(AppPrefs.W_THEME, k); no.kristo.finanshub.widget.WidgetSync.styleChanged(ctx) }, contentAlignment = Alignment.Center) {
                        Text(n, color = if (on) p.bg else p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    }
                }
            }
            Column(Modifier.fillMaxWidth().padding(14.dp, 0.dp, 14.dp, 10.dp)) {
                Row { Text("Bakgrunn", color = p.ink, fontSize = 14.sp, modifier = Modifier.weight(1f)); Text("${alpha.toInt()} %", color = p.mut, fontSize = 13.sp) }
                Slider(value = alpha, onValueChange = { alpha = it }, valueRange = 0f..100f, steps = 9,
                    onValueChangeFinished = { vm.setPref(AppPrefs.W_ALPHA, alpha.toInt()); no.kristo.finanshub.widget.WidgetSync.styleChanged(ctx) },
                    colors = SliderDefaults.colors(thumbColor = p.ink, activeTrackColor = p.ink, inactiveTrackColor = p.line))
            }
        }
        Text("Gjelder Samsung-widgetene (Søk, Klokke, Vær, Pakker, Skann, Budsjett, Aksjer, Middag, FinansHub, Domener og Finn).",
            color = p.mut, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(horizontal = 6.dp))
        PLabel("Widgets · låseskjerm", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            var hide by remember { mutableStateOf(no.kristo.finanshub.widget.Lock40.hide(ctx)) }
            PToggle("Skjul beløp og navn på låseskjermen", "Budsjett og Pakker viser «•••» til telefonen er låst opp", hide) { hide = it; no.kristo.finanshub.widget.Lock40.setHide(ctx, it) }
        }
    }
}

/* ======================= PostNord-logoen (pakket med appen) ======================= */

/** PostNord-merket på hvit flis (radius 14 per 52), 12 % luft, fyller bredden. Ingen nettoppslag (virker i flymodus). */
@Composable
internal fun PostNordLogo42(size: Int, white: Boolean = true) {
    val shape = RoundedCornerShape((size * 14f / 52f).dp)
    Box(Modifier.size(size.dp).clip(shape).background(if (white) Color.White else Color.Transparent), contentAlignment = Alignment.Center) {
        Image(painterResource(R.drawable.carrier_postnord), "PostNord", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding((size * .12f).dp))
    }
}

/* ======================= Familie → Soner: ikonvelger med søk ======================= */

/**
 * Ikonvelger (ny og rediger sone): søkefelt («Søk i ikoner, f.eks. båt, kirke, ski …»), 18 vanlige + «Vis alle (N)», «N treff» /
 * «Ingen ikoner heter …», og treff fra Lucide og Tabler via Iconify under de innebygde («36 fra Lucide og Tabler · søkte «boat»»).
 */
@Composable
internal fun IconPicker42(
    selected: String, accent: Color, min: Dp, icons: List<Triple<String, String, String>>,
    draw: @Composable (String, Color) -> Unit, onPick: (String) -> Unit,
) {
    val p = PaperPal.current
    var q by remember { mutableStateOf("") }
    var all by remember { mutableStateOf(false) }
    var ext by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var extBusy by remember { mutableStateOf(false) }
    LaunchedEffect(q) {
        ext = emptyList()
        if (q.trim().length < 2) return@LaunchedEffect
        kotlinx.coroutines.delay(450)
        extBusy = true
        ext = Ify42.search(q)
        extBusy = false
    }
    val hits = icons.filter { (k, n, _) -> iconHit42(k, n, q) }
    val shown = if (q.isNotBlank() || all) hits else hits.take(18)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PField("Ikon", q, { q = it }, placeholder = "Søk i ikoner, f.eks. båt, kirke, ski …")
        IconRows42(shown.map { it.first to it.second } + (if (selected.startsWith("ify:") && q.isBlank()) listOf(selected to "Valgt ikon") else emptyList()), selected, accent, min, draw, onPick)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(when {
                q.isBlank() -> "${icons.size} ikoner"
                hits.isEmpty() -> "Ingen ikoner heter «${q.trim()}»"
                else -> "${hits.size} treff"
            }, color = p.mut, fontSize = 12.sp, modifier = Modifier.weight(1f))
            if (q.isBlank() && icons.size > 18) Box(Modifier.height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable { all = !all }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                Text(if (all) "Vis færre" else "Vis alle (${icons.size})", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
            }
        }
        if (extBusy) Text("Søker i Lucide og Tabler …", color = p.mut, fontSize = 12.sp)
        if (ext.isNotEmpty()) {
            Text("${ext.size} fra Lucide og Tabler · søkte «${ICON_EN42[q.trim().lowercase()] ?: q.trim()}»", color = p.mut, fontSize = 12.sp)
            IconRows42(ext.map { it.first to it.first.substringAfterLast(':').replace('-', ' ') }, selected, accent, min, draw, onPick)
        }
    }
}

@Composable
private fun IconRows42(list: List<Pair<String, String>>, selected: String, accent: Color, min: Dp, draw: @Composable (String, Color) -> Unit, onPick: (String) -> Unit) {
    val p = PaperPal.current
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val cols = maxOf(1, ((maxWidth + 6.dp) / (min + 6.dp)).toInt())
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            list.chunked(cols).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    row.forEach { (k, n) ->
                        val on = k == selected
                        Box(
                            Modifier.weight(1f).height(min).clip(RoundedCornerShape(12.dp)).background(if (on) accent else Color.Transparent)
                                .border(2.dp, if (on) accent else p.line, RoundedCornerShape(12.dp))
                                .clickable(role = Role.Button, onClickLabel = n) { Haptics.select(); onPick(k) }.semantics { contentDescription = n },
                            contentAlignment = Alignment.Center,
                        ) { draw(k, if (on) Color.White else p.ink) }
                    }
                    repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}
