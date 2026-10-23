package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 45 (claude-code-familie-fold-oppsett.md): Familie på Fold/brett.
 *  - Venstre sidelinje med rød Hjem-knapp øverst og Familie-fanene (Kart · Soner · Helse · Vel fremme).
 *  - To kolonner uten maksbredde (fyller flaten til 16 dp fra høyre kant): kartet til venstre (vekt 1,3, står fast mens høyre side
 *    scrolles) og innholdet for fanen til høyre (vekt 1, minst 300 dp), 24 dp mellom. Kartet vises i alle faner (Soner: alle soner,
 *    ny sone plasseres rett i kartet). Trykk på en person til høyre zoomer kartet (ingen sidebytte); trykk på en pin åpner personkortet.
 *  - Telefon / sammenbrettet: uendret (Family22Screen).
 */
@Composable
internal fun Family45Wide(
    vm: AppViewModel, tab: String, loading: Boolean,
    top: @Composable () -> Unit, map: @Composable (Modifier) -> Unit, body: @Composable () -> Unit,
) {
    val p = PaperPal.current
    Box(Modifier.fillMaxSize().background(p.bg)) {
        Row(Modifier.fillMaxSize()) {
            FamRail45(vm, tab, Modifier.statusBarsPadding().navigationBarsPadding().padding(start = 12.dp, top = 12.dp, bottom = 12.dp))
            Spacer(Modifier.width(24.dp))
            Row(Modifier.weight(1f).fillMaxHeight().statusBarsPadding().navigationBarsPadding().padding(top = 12.dp, end = 16.dp, bottom = 12.dp)) {
                Column(Modifier.weight(1.3f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column {
                        PSerif("Posisjon, soner og helse", 15.sp, p.mut, italic = true, weight = FontWeight.Normal, maxLines = 1)
                        PSerif("Familie", 34.sp, p.ink, maxLines = 1)
                    }
                    map(Modifier.fillMaxWidth().weight(1f).heightIn(min = 300.dp))
                }
                Spacer(Modifier.width(24.dp))
                Column(
                    Modifier.weight(1f).widthIn(min = 300.dp).fillMaxHeight().verticalScroll(rememberScrollState()).padding(top = 6.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    top()
                    if (loading) Text("Henter familien …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
                    body()
                }
            }
        }
        vm.message?.let { t ->
            Box(
                Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 24.dp, start = 24.dp, end = 24.dp)
                    .shadow(12.dp, RoundedCornerShape(20.dp)).clip(RoundedCornerShape(20.dp)).background(p.ink).padding(18.dp, 11.dp),
            ) { Text(t, color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 2, textAlign = TextAlign.Center) }
        }
    }
}

/** Sidelinja i Familie: Hjem (rød, lukker Familie) og Familie-fanene i samme stil som hovedsidelinja. */
@Composable
private fun FamRail45(vm: AppViewModel, tab: String, modifier: Modifier) {
    val p = PaperPal.current
    val shape = RoundedCornerShape(28.dp)
    val tabs = vm.secTabs32b("kart").let { t -> if (t.none { it.first == "velfremme" }) t + Triple("velfremme", "Vel fremme", "●") else t }
    Column(
        modifier.width(84.dp).fillMaxHeight()
            .shadow(16.dp, shape, ambientColor = Color.Black.copy(alpha = .5f), spotColor = Color.Black.copy(alpha = .5f))
            .clip(shape).background(p.nav)
            .longPressEdit26(true, "kart") { Haptics.tap(); vm.p32b.secEdit = "kart" }
            .padding(horizontal = 6.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        RailHome45(vm, true, onLeave = { vm.closeFamily() })
        tabs.forEach { (k, n, ic) ->
            RailTab25(n, ic, tab == k, NavStyle25.v) { Haptics.select(); vm.famTab = k }
        }
    }
}

/**
 * Prompt 45 (claude-code-sonevarsler-ikon-bryter.md): «Posisjonsvarsler» øverst i Familie → Soner – hovedbryter og bryter per person
 * (bilde/initialer). Hovedbryter av → personbryterne grå. «Vis eksempel på varsel» sender et ekte systemvarsel med soneikonet.
 * Eldre server (404): kortet vises ikke.
 */
@Composable
internal fun ZoneAlertsCard45(vm: AppViewModel) {
    val p = PaperPal.current
    androidx.compose.runtime.LaunchedEffect(vm.account?.id) { vm.loadZoneAlerts45() }
    val z = vm.p45.zoneAlerts ?: return
    PCard {
        PToggle("Posisjonsvarsler", "Varsle når noen kommer til eller forlater en sone", z.on) { vm.setZoneAlert45(null, it) }
        z.people.forEach { m ->
            Row(
                Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp).alpha(if (z.on) 1f else .45f),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.size(30.dp).clip(androidx.compose.foundation.shape.CircleShape).background(m.color?.let { Color(it) } ?: p.mut), contentAlignment = Alignment.Center) {
                    Text(m.initials.take(2), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, maxLines = 1)
                }
                Box(Modifier.weight(1f)) { PToggle(m.name, null, m.on && z.on, top = false) { if (z.on) vm.setZoneAlert45(m.id, it) } }
            }
        }
        Text(
            "Vis eksempel på varsel", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp,
            modifier = Modifier.fillMaxWidth().clickable(role = androidx.compose.ui.semantics.Role.Button) { Haptics.tap(); vm.sampleZoneNotify45() }.padding(14.dp, 12.dp),
        )
    }
}

/** Innstillinger → Varsler: hovedbryteren for sonevarsler (samme valg som Familie → Soner → Posisjonsvarsler). */
@Composable
internal fun ZoneAlertsToggle45(vm: AppViewModel) {
    androidx.compose.runtime.LaunchedEffect(vm.account?.id) { vm.loadZoneAlerts45() }
    val z = vm.p45.zoneAlerts ?: return
    val off = z.people.count { !it.on }
    PToggle("Sonevarsler", if (!z.on) "Av" else if (off > 0) "På · $off ${if (off == 1) "person" else "personer"} av (Familie → Soner)" else "Når noen i familien kommer eller går", z.on, top = true) { vm.setZoneAlert45(null, it) }
}
