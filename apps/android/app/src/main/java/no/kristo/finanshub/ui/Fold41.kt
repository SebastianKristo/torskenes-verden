package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate

/*
 * Prompt 41 (claude-code-hjem-fold-ipad-oppsett.md, valgt 1c for Fold): når telefonen er brettet ut (≥ 600 dp) skjules toppbildet
 * på Hjem. Venstre halvdel: stort Glimt-kort (bakgrunnsbildet med mørk overgang nederst, dato, hilsen, temperatur + kort vær,
 * Brief-kortet og søkefeltet med ✦ AI); det scroller ikke. Høyre halvdel: fanene Nå · I dag · Hjemme · Økonomi (piller øverst,
 * sveip mellom dem) og én kolonne med kort som scroller. Valgt fane huskes (papir_fold_tab). Fanene står på linje med toppen av
 * hovedkortet (12 dp + statuslinje). Halvbrettet (prompt 43): hovedkortet over hengselen, fanene under.
 * iPad: ikke valgt ennå (ingen endring).
 * Prompt 43: valget delt/halvbrettet/stablet gjøres av vinduet (ui/Fold43.kt), ikke av høyde > bredde i innholdsboksen.
 */

/** Hjem på Fold: [cards] er kortlista for valgt fane (bygges i PaperHome med foldKeys41). */
@Composable
internal fun FoldHome41(vm: AppViewModel, mode: FoldMode43, cards: @Composable (Modifier) -> Unit) {
    LaunchedEffect(Unit) { vm.initP41() }
    // 12 dp + statuslinje, pluss de 23 dp innholdsboksen ligger oppe i (underNav34 i Paper.kt), så fanene står på linje med kortet.
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 12.dp + 23.dp
    BoxWithConstraints(Modifier.fillMaxSize()) {
    // Prompt 43: før valgte vi «stående» med maxHeight > maxWidth her. Denne boksen er 112 dp smalere (sidelinja) og 23 dp høyere
    // (underNav34) enn vinduet, så utbrettet Fold (ca. 832 × 750 dp) ble 720 × 773 → stablet og klemt. Nå bestemmer vinduet (Fold43.kt).
    if (mode == FoldMode43.TABLETOP) {
        // Halvbrettet: Glimt-kortet over hengselen (midt i vinduet), fanene og kortene under den.
        val hinge = (maxHeight - 23.dp) / 2 + 23.dp
        Column(Modifier.fillMaxSize().padding(end = 16.dp)) {
            Spacer(Modifier.height(top))
            FoldMain41(vm, Modifier.fillMaxWidth().height((hinge - top - 12.dp).coerceAtLeast(160.dp)), compact = true)
            Spacer(Modifier.height(24.dp))
            Column(Modifier.fillMaxWidth().weight(1f)) { FoldTabs41(vm); Spacer(Modifier.height(10.dp)); cards(Modifier.weight(1f)) }
        }
    } else {
        // 1c: Glimt-kort venstre (fyller høyden, scroller ikke), faner høyre (bare denne kolonnen scroller).
        // Prompt 45 (claude-code-fold-sok-over-tastatur.md): bare venstre Glimt-kort følger tastaturet (WindowInsets.ime, som
        // animeres sammen med IME-en), så søkefeltet ligger rett over tastaturet. Høyre kolonne flytter seg ikke.
        val lift45 = (imeBottom45() - 12.dp).coerceAtLeast(0.dp)
        Row(Modifier.fillMaxSize().padding(top = top, end = 16.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            FoldMain41(vm, Modifier.weight(1f).fillMaxHeight().padding(bottom = lift45))
            Column(Modifier.weight(1f).fillMaxHeight()) { FoldTabs41(vm); Spacer(Modifier.height(10.dp)); cards(Modifier.weight(1f)) }
        }
    }
    }
}

/** Fanene som piller (36 høy, radius 18, Manrope 700 13): valgt = blekk, ellers strek. Sveip venstre/høyre bytter fane. */
@Composable
private fun FoldTabs41(vm: AppViewModel) {
    val p = PaperPal.current
    val cur = vm.p41.foldTab
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FOLD_TABS41.forEach { (k, n) ->
            val on = cur == k
            Box(
                Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) p.ink else Color.Transparent)
                    .border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(18.dp)).clickable(role = Role.Tab, onClickLabel = n) { vm.setFoldTab41(k) }.padding(horizontal = 15.dp),
                contentAlignment = Alignment.Center,
            ) { Text(n, color = if (on) p.bg else p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
        }
    }
}

/** Sveip mellom fanene på kortlista (horisontalt drag > 60 dp). */
internal fun Modifier.foldSwipe41(vm: AppViewModel): Modifier = this.pointerInput(Unit) {
    var dx = 0f
    detectHorizontalDragGestures(onDragStart = { dx = 0f }, onDragEnd = {
        val keys = FOLD_TABS41.map { it.first }
        val i = keys.indexOf(vm.p41.foldTab).coerceAtLeast(0)
        val lim = 60.dp.toPx()
        if (dx < -lim && i < keys.size - 1) vm.setFoldTab41(keys[i + 1]) else if (dx > lim && i > 0) vm.setFoldTab41(keys[i - 1])
    }) { _, d -> dx += d }
}

/** Det store Glimt-kortet (26 dp hjørner, fyller høyden). [compact] = halvbrettet: hilsen til venstre, Brief og søk til høyre. */
@Composable
private fun FoldMain41(vm: AppViewModel, modifier: Modifier, compact: Boolean = false) {
    val bmp: Bitmap? = if (vm.photoKind == "cur" || vm.photoKind == "none") null else vm.photo
    val shape = RoundedCornerShape(26.dp)
    Box(modifier.clip(shape).background(Color(0xFF2A3440))) {
        BgLayer(vm, bmp)
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = .15f), .3f to Color.Transparent, .72f to Color(0xE0101C2C))))
        if (compact) Row(Modifier.fillMaxSize().padding(18.dp, 18.dp, 18.dp, 16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(Modifier.weight(1f).fillMaxHeight().clipToBounds(), verticalArrangement = Arrangement.spacedBy(10.dp)) { FoldGreeting43(vm, 30.sp) }
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.Bottom)) { FoldBriefSearch43(vm) }
        }
        else Column(Modifier.fillMaxSize().padding(18.dp, 18.dp, 18.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // Prompt 43: toppen får plassen som er igjen (klippes heller enn å klemme Brief-kortet ved stor skrift);
            // Brief-kortet og søkefeltet har alltid sin egen høyde nederst.
            // Prompt 45: mens man skriver tones hilsen og temperatur ut, og Brief-kortet glir bort, så svaret får plass over feltet.
            val typing45 = imeBottom45() > 80.dp
            val greetA by androidx.compose.animation.core.animateFloatAsState(if (typing45) 0f else 1f, androidx.compose.animation.core.tween(200), label = "greet45")
            Column(Modifier.fillMaxWidth().weight(1f).clipToBounds().graphicsLayer { alpha = greetA }, verticalArrangement = Arrangement.spacedBy(12.dp)) { FoldGreeting43(vm, 38.sp) }
            FoldBriefSearch43(vm, typing45)
        }
    }
}

/** Homelab + profilbilde, dato, hilsen og temperatur. */
@Composable
private fun ColumnScope.FoldGreeting43(vm: AppViewModel, greet: androidx.compose.ui.unit.TextUnit) {
    val first = vm.displayName.split(' ').firstOrNull().orEmpty().ifBlank { "du" }
    val w = vm.mobileHome?.weather
    Row(verticalAlignment = Alignment.CenterVertically) {
        PSerif(vm.appName, 22.sp, Color.White, Modifier.weight(1f), maxLines = 1)
        Box(
            Modifier.size(38.dp).clip(CircleShape).background(Color(0xFFF3EFE6)).clickable(onClickLabel = "Innstillinger") { vm.openPaperPage("set") }
                .semantics { contentDescription = "Innstillinger" },
            contentAlignment = Alignment.Center,
        ) { AvatarImage(vm, 38, Color(0xFFF3EFE6), Color(0xFF1B1A17)) }
    }
    PSerif(longDate(LocalDate.now()), 16.sp, Color.White.copy(alpha = .92f), italic = true, weight = FontWeight.Normal, maxLines = 1)
    AutoSerif("${greetingFor()},\n$first", greet, Color.White, min = 22.sp)
    if (w?.temp != null) Row(
        Modifier.clip(RoundedCornerShape(12.dp)).clickable(onClickLabel = "Åpne Vær") { Haptics.tap(); vm.openWeather() },
        verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PSerif("${Math.round(w.temp)}°", 64.sp, Color.White, weight = FontWeight.Light, maxLines = 1)
        Text("${w.text ?: w.place} ›", color = Color.White.copy(alpha = .92f), fontSize = 13.5.sp, maxLines = 1, modifier = Modifier.padding(bottom = 12.dp))
    }
}

/** Brief-kortet (egen høyde, min. 148 dp, ikke klippet utenfra så Glimt-figuren vises hel) og søkefeltet med ✦ AI under. */
@Composable
private fun FoldBriefSearch43(vm: AppViewModel, typing: Boolean = false) {
    androidx.compose.animation.AnimatedVisibility(
        visible = !typing,
        enter = androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(220)) + androidx.compose.animation.expandVertically(androidx.compose.animation.core.tween(220)),
        exit = androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(180)) + androidx.compose.animation.shrinkVertically(androidx.compose.animation.core.tween(220)),
    ) { HomeBrief34(vm, Modifier.heightIn(min = 148.dp)) }
    // Prompt 45: svar og forslag over feltet (claude-code-fold-skannikon-og-sokefelt.md).
    PaperSearch29(vm, above45 = true)
}
