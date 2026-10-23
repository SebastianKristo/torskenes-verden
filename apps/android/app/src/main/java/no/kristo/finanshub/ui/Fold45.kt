package no.kristo.finanshub.ui

import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.*

/*
 * Prompt 45 (ANDROID45) – Fold/brett (claude-code-ipad-brettoppsett.md og claude-code-fold-*.md):
 *  - Én felles LayoutMode: brettoppsett når vinduet er ≥ 700 dp bredt (LocalWide45). Brukes av skallet, Hjem, Familie og Gjøremål.
 *  - Sidelinja (PaperRail45): rød Hjem-knapp med jevn animasjon (ut: skala 1 → 0,55 + uttoning 200 ms, høyden kollapser; sidebyttet
 *    starter etter 190 ms; inn: skala 0,6 → 1 med lett fjæring 320 ms), skann-knappen (46, aksent, skann-ikon) nederst, og
 *    wiggle-knappene (＋ Legg til widget med antall skjulte, ↺ Tilbakestill når endret, ✓ Ferdig) i stedet for knapperaden øverst.
 *  - Sidelinja kan også tegnes i fullskjermsflatene (Gjøremål, Familie) med [onLeave], som lukker flaten før man navigerer.
 */

/** Felles LayoutMode (Fold utbrettet, nettbrett): true når vinduet er bredt nok til brettoppsett. */
internal val LocalWide45 = compositionLocalOf { false }

/** Regelen (felles for alle plattformer): ≥ 700 dp tilgjengelig bredde (og ikke Compact-klassen). */
internal fun layoutWide45(sizeClassWide: Boolean, widthDp: Int): Boolean = sizeClassWide && widthDp >= 700

/** Tastaturets høyde nå (0 når det er lukket). Følger IME-animasjonen bilde for bilde. */
@Composable
internal fun imeBottom45(): Dp {
    val d = LocalDensity.current
    return with(d) { WindowInsets.ime.getBottom(d).toDp() }
}

/** «Fjern animasjoner» i systemet (animasjonsskala 0) → bare uttoning. */
@Composable
internal fun reduceMotion45(): Boolean {
    val ctx = LocalContext.current
    return remember(ctx) { runCatching { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false) }
}

/** Skann-ikonet: fire hjørner og strek i midten (samme som den flytende skanneknappen på telefon). */
internal const val SCAN45 = "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16"
private const val RESET45 = "M3 12a9 9 0 1 0 3-6.7M3 4v5h5"
private const val CHECK45 = "M5 12.5l4.5 4.5L19 7.5"
private const val PLUS45 = "M12 5v14M5 12h14"
private const val HOUSE45 = "M4 11l8-7 8 7M6 10v10h12V10"

private val EASE_OUT45 = CubicBezierEasing(.4f, 0f, .2f, 1f)
private val SPRING45 = CubicBezierEasing(.2f, .9f, .25f, 1.15f)

/** Sider uten skann-knapp i sidelinja (i tillegg til noScanHere): Kart (Familie), Bibelvers, Nordlys, Innstillinger, Mer. */
internal fun noRailScan45(vm: AppViewModel): Boolean = noScanHere(vm) || vm.familyOpen || vm.p31.nordOpen || vm.p37.biblePage ||
    vm.paperPage == "set" || vm.screen == Screen.Settings || vm.paperPage == "fmer"

/**
 * Sidelinja på Fold/brett (84 bred). [onLeave] ≠ null: tegnet i en fullskjermsflate (Gjøremål, Familie); ingen fane er markert,
 * og flaten lukkes før man navigerer.
 */
@Composable
internal fun PaperRail45(vm: AppViewModel, bar: String, float: Boolean, modifier: Modifier, onTap: () -> Unit, onHold: () -> Unit, onLeave: (() -> Unit)? = null) {
    val p = PaperPal.current
    val s = vm.p45
    val tabs = navTabs(vm, bar, float)
    val cur = if (onLeave != null) "" else navCurrent(vm, bar)
    val home = onLeave == null && vm.screen == Screen.Homelab && vm.paperPage == null
    LaunchedEffect(home) { if (home) s.homeLeaving = false }
    val style = NavStyle25.v
    val shape = RoundedCornerShape(28.dp)
    val edit = railEdit45(vm)
    Column(
        modifier.width(84.dp).fillMaxHeight()
            .shadow(16.dp, shape, ambientColor = Color.Black.copy(alpha = .5f), spotColor = Color.Black.copy(alpha = .5f))
            .clip(shape).background(p.nav)
            .longPressEdit26(onLeave == null && edit == null && (bar == "main" || bar == "fin"), bar) { Haptics.tap(); if (bar == "fin") vm.b26.finEdit = true else vm.tabEdit = true }
            .padding(horizontal = 6.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        RailHome45(vm, !home && !s.homeLeaving, onLeave)
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            tabs.forEach { t ->
                RailTab25(t.label, t.icon, cur == t.key, style) {
                    onLeave?.invoke()
                    if (cur == t.key) vm.tabReselect26(bar, t) else t.go()
                    Haptics.select()
                }
            }
        }
        RailEdit45(vm, edit)
        // Prompt 45 (claude-code-fold-skann-i-navbar.md): skann-knappen ligger alltid i sidelinja på brett (ingen flytende knapp),
        // skjult mens man redigerer (ingen to ＋-knapper) og på sider der den ikke hører hjemme.
        if (edit == null && !noRailScan45(vm)) Box(Modifier.padding(top = 8.dp)) {
            ScanPress(vm, bar, Modifier.shadow(10.dp, CircleShape), 46.dp, CircleShape, onTap, onHold) {
                if (bar == "dom") Text("✦", color = p.onLab, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                else if (vm.screen == Screen.Tracking && bar == "main") WxIcon(PLUS45, p.onLab, 22.dp, stroke = 2.6f)
                else WxIcon(SCAN45, p.onLab, 22.dp, stroke = 2.2f)
            }
        }
    }
}

/**
 * Den røde Hjem-knappen (samme form som aktiv fane). Ut: skala → 0,55 og uttoning på 200 ms mens høyden kollapser, så fanene
 * glir opp; sidebyttet starter etter 190 ms så tegningen av Hjem ikke hakker animasjonen. Inn: vokser fra 0,6 med lett fjæring
 * (320 ms). Doble trykk ignoreres mens animasjonen pågår. «Fjern animasjoner»: bare uttoning.
 */
@Composable
internal fun RailHome45(vm: AppViewModel, visible: Boolean, onLeave: (() -> Unit)?) {
    val p = PaperPal.current
    val s = vm.p45
    val scope = rememberCoroutineScope()
    val reduce = reduceMotion45()
    val enter = if (reduce) fadeIn(tween(200)) else
        scaleIn(tween(320, easing = SPRING45), initialScale = .6f) + fadeIn(tween(240)) + expandVertically(tween(320, easing = EASE30), expandFrom = Alignment.Top)
    val exit = if (reduce) fadeOut(tween(200)) else
        scaleOut(tween(200, easing = EASE_OUT45), targetScale = .55f) + fadeOut(tween(200, easing = EASE_OUT45)) + shrinkVertically(tween(200, easing = EASE_OUT45), shrinkTowards = Alignment.Top)
    AnimatedVisibility(visible = visible, enter = enter, exit = exit) {
        val src = remember { MutableInteractionSource() }
        val pressed by src.collectIsPressedAsState()
        val sc by animateFloatAsState(if (pressed) .96f else 1f, tween(120), label = "home45")
        val shape = RoundedCornerShape(18.dp)
        Box(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
            Column(
                Modifier.fillMaxWidth().height(58.dp).graphicsLayer { scaleX = sc; scaleY = sc }
                    .shadow(12.dp, shape, ambientColor = Color.Black.copy(alpha = .5f), spotColor = Color.Black.copy(alpha = .5f))
                    .clip(shape).background(p.lab)
                    .clickable(interactionSource = src, indication = null, role = Role.Button, onClickLabel = "Til Hjem") {
                        if (s.homeBusy) return@clickable
                        s.homeBusy = true
                        Haptics.tap()
                        s.homeLeaving = true
                        vm.p46.homeFromRail = true // prompt 46: Hjem tones inn med fjær etter at modulen har skalert ut (ui/Ui46.kt)
                        scope.launch {
                            delay(if (reduce) 0L else 190L)
                            onLeave?.invoke()
                            vm.settingsPage = null
                            vm.paperTab("hjem")
                            delay(140)
                            s.homeBusy = false
                        }
                    }
                    .semantics(mergeDescendants = true) { contentDescription = "Til Hjem" }
                    .padding(horizontal = 2.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
            ) {
                WxIcon(HOUSE45, p.onLab, 20.dp, stroke = 2.2f)
                Text("Hjem", color = p.onLab, style = TAB_TEXT24.copy(fontSize = 11.5.sp, lineHeight = 13.sp), maxLines = 1)
            }
        }
    }
}

/* ======================= Wiggle-knappene i sidelinja ======================= */

/** Hva som redigeres nå: "page:<side>" (Hjem, Finans, Mat, Sporing), "mer" eller "fmer" (Finans → Mer). null = ingen redigering. */
internal fun railEdit45(vm: AppViewModel): String? {
    vm.editPage?.let { page ->
        val base = vm.paperPage == null && vm.original == null && vm.editing == null && vm.detail == null && vm.selectedTx == null
        val here = base && when (page) {
            "hjem" -> vm.screen == Screen.Homelab
            "finans" -> vm.screen == Screen.Home
            "mat" -> vm.screen == Screen.Mat
            "sporing" -> vm.screen == Screen.Tracking
            else -> false
        }
        if (here) return "page:$page"
    }
    if (vm.paperPage == "mer" && vm.b28.merEdit) return "mer"
    if (vm.paperPage == "fmer" && vm.p32b.fmEdit) return "fmer"
    return null
}

/** ＋ (med antall skjulte), ↺ (bare når oppsettet er endret) og ✓, stablet nederst i sidelinja. Spretter inn på 320 ms. */
@Composable
private fun RailEdit45(vm: AppViewModel, edit: String?) {
    val p = PaperPal.current
    val reduce = reduceMotion45()
    AnimatedVisibility(
        visible = edit != null,
        enter = if (reduce) fadeIn(tween(200)) else scaleIn(tween(320, easing = SPRING45), initialScale = .6f) + fadeIn(tween(240)),
        exit = fadeOut(tween(160)) + scaleOut(tween(160), targetScale = .8f),
    ) {
        val e = edit ?: vm.p45.lastEdit
        SideEffect { if (edit != null) vm.p45.lastEdit = edit }
        val (hidden, changed) = railEditInfo45(vm, e)
        Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (e != "page:sporing") RailRound45("Legg til widget", Color.White.copy(alpha = .14f), badge = hidden.takeIf { it > 0 }, onClick = { railAdd45(vm, e) }) {
                WxIcon(PLUS45, Color.White, 20.dp, stroke = 2.6f)
            }
            if (changed) RailRound45("Tilbakestill", Color.White.copy(alpha = .14f), onClick = { railReset45(vm, e) }) { WxIcon(RESET45, Color.White, 19.dp, stroke = 2.4f) }
            RailRound45("Ferdig", p.lab, onClick = { railDone45(vm, e) }) { WxIcon(CHECK45, p.onLab, 20.dp, stroke = 2.8f) }
        }
    }
}

@Composable
private fun RailRound45(label: String, bg: Color, badge: Int? = null, onClick: () -> Unit, icon: @Composable () -> Unit) {
    val p = PaperPal.current
    Box {
        Box(
            Modifier.size(46.dp).clip(CircleShape).background(bg)
                .clickable(role = Role.Button, onClickLabel = label) { onClick() }.semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) { icon() }
        if (badge != null) Box(
            Modifier.align(Alignment.TopEnd).offset(4.dp, (-4).dp).sizeIn(minWidth = 18.dp, minHeight = 18.dp).clip(CircleShape).background(p.lab).padding(horizontal = 4.dp),
            contentAlignment = Alignment.Center,
        ) { Text("$badge", color = p.onLab, fontSize = 10.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Clip) }
    }
}

/** (antall skjulte, oppsettet er endret fra standard). */
private fun railEditInfo45(vm: AppViewModel, e: String?): Pair<Int, Boolean> = when {
    e == null -> 0 to false
    e.startsWith("page:") -> {
        val page = e.removePrefix("page:")
        val secs = vm.b28.pageSecs[page] ?: emptyList()
        val hid = vm.pageHidden(page).count { h -> secs.any { it.first == h } }
        val lay = vm.pageLayouts[page]
        hid to (lay != null && (lay.order.isNotEmpty() || lay.hidden.isNotEmpty()))
    }
    e == "mer" -> vm.b28.mer.h.count { it != "innst" } to (vm.b28.mer.o.isNotEmpty() || vm.b28.mer.h.isNotEmpty())
    else -> vm.p30.finHidden.size to (vm.fmOrder != FM_DEFAULT_ORDER || vm.p30.finHidden.isNotEmpty())
}

private fun railAdd45(vm: AppViewModel, e: String?) {
    Haptics.select()
    when {
        e == null -> {}
        e.startsWith("page:") -> vm.b28.addWidgetFor = e.removePrefix("page:")
        e == "mer" -> vm.p30.merAdd = !vm.p30.merAdd
        else -> vm.p30.fmAdd = !vm.p30.fmAdd
    }
}

private fun railReset45(vm: AppViewModel, e: String?) {
    Haptics.select()
    when {
        e == null -> {}
        e.startsWith("page:") -> vm.resetPage(e.removePrefix("page:"))
        e == "mer" -> vm.saveMer28(MerPref28())
        else -> { vm.resetFmOrder(); vm.setFinHidden30(emptyList()) }
    }
}

private fun railDone45(vm: AppViewModel, e: String?) {
    Haptics.success()
    when {
        e == null -> {}
        e.startsWith("page:") -> vm.editPage = null
        e == "mer" -> { vm.b28.merEdit = false; vm.p30.merAdd = false }
        // Finans → Mer har redigeringen lokalt i rutenettet: det lytter på fmDoneSeq og lagrer rekkefølgen.
        else -> { vm.p45.fmDoneSeq++; vm.p30.fmAdd = false }
    }
}
