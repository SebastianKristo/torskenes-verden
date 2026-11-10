package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 81 (SPANAND): store skuffer og «Skjold Lab-hylla (3D-print)» i Skjold Lab på Android.
 *  - SpanRow81: «Bredde 1/2 · Høyde 1/2» i skuffkortet (slå sammen / del én skuff – enkelt, ikke mer).
 *  - PresetCard81: «Bruk Skjold Lab-hylla (3D-print)» i Skap-oppsett med 4 eller 5 etasjer og bekreftelse.
 *  - NewPresetCard81 / NewPresetAsk81: «Skjold Lab-hylla (3D)» som forhåndsvalg for nytt skap (ved siden av egne rader × kolonner).
 * Tegningen (felt over flere ruter, trykk på dekket rute = ankeret, utheving over hele feltet) ligger i Skjold76Ui.kt via cells81/cellOf81.
 */

/** «Bredde 1/2 · Høyde 1/2» for skuffen (anker [r], [c]). Lagres med en gang (PUT {spanR, spanC}). */
@Composable
internal fun SpanRow81(vm: AppViewModel, cab: SkjCab76, d: SkjDrawer76?, r: Int, c: Int) {
    val p = PaperPal.current
    val sr = d?.spanR ?: 1
    val sc = d?.spanC ?: 1
    val busy = Skjold81.busy
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Bredde", color = p.mut, fontSize = 13.sp, modifier = Modifier.width(54.dp))
            listOf(1, 2).forEach { n -> PChip("$n", sc == n) { if (!busy && sc != n) vm.putSpan81(cab.id, r, c, sr, n) } }
            Text("·", color = p.mut, fontSize = 13.sp)
            Text("Høyde", color = p.mut, fontSize = 13.sp)
            listOf(1, 2).forEach { n -> PChip("$n", sr == n) { if (!busy && sr != n) vm.putSpan81(cab.id, r, c, n, sc) } }
        }
        if (sr > 1 || sc > 1) Text(
            (if (sr > 1 && sc > 1) "Stor skuff" else if (sc > 1) "Bred skuff" else "Høy skuff") + " · " + spanText81(r, c, sr, sc) + ". Deler i rutene som slås sammen, flyttes hit.",
            color = p.mut, fontSize = 12.sp,
        )
    }
}

/** «Bruk Skjold Lab-hylla (3D-print)»: velg 4 eller 5 etasjer, bekreft («Skapet blir 11 × 11 med 8 store og 10 brede skuffer»). */
@Composable
internal fun PresetCard81(vm: AppViewModel, cab: SkjCab76) {
    val p = PaperPal.current
    var open by remember(cab.id) { mutableStateOf(false) }
    var et by remember(cab.id) { mutableStateOf(if (cab.rows >= 13) 5 else 4) }
    if (!open) { PButton("Bruk $PRESET_NAME81", Modifier.fillMaxWidth(), kind = "line") { open = true }; return }
    PCard(shadow = true) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PLabel(PRESET_NAME81)
            Text("Samme oppsett som 3D-modellen: store skuffer (2 × 2) og brede (2 × 1) i venstre del, LED-geometrien settes også.", color = p.mut, fontSize = 13.sp)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Etasjer", color = p.mut, fontSize = 13.sp)
                presetEtasjer81().forEach { n -> PChip("$n", et == n) { et = n } }
            }
            Text(presetSummary81(et) + ".", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            if (cab.parts > 0) Text("Delene blir liggende. Deler i ruter som blir en del av en stor skuff, flyttes til skuffen. Ligger noen utenfor det nye skapet, endres ingenting.", color = p.mut, fontSize = 12.5.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton(if (Skjold81.busy) "Lagrer …" else "Bruk oppsettet", Modifier.weight(1f)) { if (!Skjold81.busy) vm.applyPreset81(cab.id, et) { open = false } }
                PButton("Avbryt", Modifier.weight(1f), kind = "line") { open = false }
            }
        }
    }
}

/** Kortet i oversikten: «Skjold Lab-hylla (3D)» → arket med 4/5 etasjer. */
@Composable
internal fun NewPresetCard81() {
    val p = PaperPal.current
    PCard(Modifier.width(150.dp), onClick = { Haptics.tap(); Skjold81.newAsk = true }) {
        Column(Modifier.height(186.dp).fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("▦", color = p.lab, fontSize = 28.sp)
            Text("Skjold Lab-hylla (3D)", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, textAlign = TextAlign.Center)
            Text("ferdig oppsett med store skuffer", color = p.mut, fontSize = 12.sp, textAlign = TextAlign.Center)
        }
    }
}

/** Nytt skap med forhåndsoppsettet (navn + 4/5 etasjer). Egne rader × kolonner: «Legg til skap» ved siden av. */
@Composable
internal fun NewPresetAsk81(vm: AppViewModel) {
    val p = PaperPal.current
    val a = Skjold81
    var name by remember { mutableStateOf("Skjold Lab-hylla") }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .4f)).clickable { a.newAsk = false }, contentAlignment = Alignment.Center) {
        PCard(Modifier.padding(24.dp).widthIn(max = 420.dp), shadow = true) {
            Column(Modifier.clickable(enabled = false) {}.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                PSerif("Nytt skap: Skjold Lab-hylla (3D)", 20.sp)
                PField("Navn", name, { name = it })
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Etasjer", color = p.mut, fontSize = 13.sp)
                    presetEtasjer81().forEach { n -> PChip("$n", a.etasjer == n) { a.etasjer = n } }
                }
                Text(presetSummary81(a.etasjer) + ".", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                PButton(if (a.busy) "Lagrer …" else "Legg til skapet", Modifier.fillMaxWidth()) { if (!a.busy) vm.newPresetCab81(name, a.etasjer) }
                PButton("Egne rader × kolonner i stedet", Modifier.fillMaxWidth(), kind = "line") { a.newAsk = false; newCab76(vm, threeD = false) }
                PButton("Avbryt", Modifier.fillMaxWidth(), kind = "line") { a.newAsk = false }
            }
        }
    }
}
