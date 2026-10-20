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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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
 * hovedkortet (12 dp + statuslinje). Portrett/halvbrettet (høyde > bredde): hovedkortet øverst, fanene under.
 * iPad: ikke valgt ennå (ingen endring).
 */

/** Hjem på Fold: [cards] er kortlista for valgt fane (bygges i PaperHome med foldKeys41). */
@Composable
internal fun FoldHome41(vm: AppViewModel, cards: @Composable (Modifier) -> Unit) {
    LaunchedEffect(Unit) { vm.initP41() }
    // 12 dp + statuslinje, pluss de 23 dp innholdsboksen ligger oppe i (underNav34 i Paper.kt), så fanene står på linje med kortet.
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 12.dp + 23.dp
    BoxWithConstraints(Modifier.fillMaxSize()) {
    val portrait = maxHeight > maxWidth
    if (portrait) {
        Column(Modifier.fillMaxSize().padding(top = top, end = 16.dp)) {
            FoldMain41(vm, Modifier.fillMaxWidth().weight(.46f))
            Spacer(Modifier.height(12.dp))
            Column(Modifier.fillMaxWidth().weight(.54f)) { FoldTabs41(vm); Spacer(Modifier.height(10.dp)); cards(Modifier.weight(1f)) }
        }
    } else {
        Row(Modifier.fillMaxSize().padding(top = top, end = 16.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            FoldMain41(vm, Modifier.weight(1f).fillMaxHeight())
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

/** Det store Glimt-kortet (26 dp hjørner, fyller høyden). */
@Composable
private fun FoldMain41(vm: AppViewModel, modifier: Modifier) {
    val bmp: Bitmap? = if (vm.photoKind == "cur" || vm.photoKind == "none") null else vm.photo
    val first = vm.displayName.split(' ').firstOrNull().orEmpty().ifBlank { "du" }
    val w = vm.mobileHome?.weather
    val shape = RoundedCornerShape(26.dp)
    Box(modifier.clip(shape).background(Color(0xFF2A3440))) {
        BgLayer(vm, bmp)
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = .15f), .3f to Color.Transparent, .72f to Color(0xE0101C2C))))
        Column(Modifier.fillMaxSize().padding(18.dp, 18.dp, 18.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif(vm.appName, 22.sp, Color.White, Modifier.weight(1f), maxLines = 1)
                Box(
                    Modifier.size(38.dp).clip(CircleShape).background(Color(0xFFF3EFE6)).clickable(onClickLabel = "Innstillinger") { vm.openPaperPage("set") }
                        .semantics { contentDescription = "Innstillinger" },
                    contentAlignment = Alignment.Center,
                ) { AvatarImage(vm, 38, Color(0xFFF3EFE6), Color(0xFF1B1A17)) }
            }
            PSerif(longDate(LocalDate.now()), 16.sp, Color.White.copy(alpha = .92f), italic = true, weight = FontWeight.Normal, maxLines = 1)
            AutoSerif("${greetingFor()},\n$first", 38.sp, Color.White, min = 22.sp)
            if (w?.temp != null) Row(
                Modifier.clip(RoundedCornerShape(12.dp)).clickable(onClickLabel = "Åpne Vær") { Haptics.tap(); vm.openWeather() },
                verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                PSerif("${Math.round(w.temp)}°", 64.sp, Color.White, weight = FontWeight.Light, maxLines = 1)
                Text("${w.text ?: w.place} ›", color = Color.White.copy(alpha = .92f), fontSize = 13.5.sp, maxLines = 1, modifier = Modifier.padding(bottom = 12.dp))
            }
            Spacer(Modifier.weight(1f))
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp))) { HomeBrief34(vm) }
            PaperSearch29(vm)
        }
    }
}
