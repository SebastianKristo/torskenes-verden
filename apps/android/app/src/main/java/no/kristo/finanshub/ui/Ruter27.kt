package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 27 (ANDROID-B): Ruter-kortet på Hjem (claude-code-ruter-hjem.md, fasit «av.home» i Mobil Papir App.dc.html).
 *  - «Velg stopp» på kortet åpner arket: kryss av opptil 3 av Mine stopp (rekkefølgen følger Mine stopp), 1–4 avganger per stopp.
 *  - Én gruppe per stopp (navn over når flere; da høyst 2 avganger per stopp), sanntid hvert 30. s mens Hjem er synlig.
 *  - «Legg til eller fjern stopp ›» åpner Avganger i redigeringsmodus. Valget lagres per konto og på serveren (home_departures).
 */

/** true når brukeren har egne stopp (da tegnes RuterHome27, ellers det gamle kortet fra /mobile/home). */
@Composable
internal fun homeRuter27(vm: AppViewModel): Boolean {
    LaunchedEffect(vm.account?.id, vm.base) { vm.loadHomeDep27() }
    // Tilbake fra Avganger (stopp lagt til, fjernet eller flyttet): hent Mine stopp på nytt.
    LaunchedEffect(vm.ruterOpen) { if (!vm.ruterOpen && vm.b27.homeStops != null) runCatching { vm.refreshHomeDeps27(stops = true) } }
    return !vm.b27.homeStops.isNullOrEmpty()
}

@Composable
internal fun RuterHome27(vm: AppViewModel, modifier: Modifier = Modifier) {
    val p = PaperPal.current
    val s = vm.b27
    val life = LocalLifecycleOwner.current.lifecycle
    // Sanntid: nye tider hvert 30. sekund mens Hjem er synlig (ikke når Avganger ligger over eller appen er i bakgrunnen).
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            if (!vm.ruterOpen && life.currentState.isAtLeast(Lifecycle.State.RESUMED)) runCatching { vm.refreshHomeDeps27() }
        }
    }
    val shown = vm.homeShown27()
    val multi = shown.size > 1
    val title = if (multi) "Avganger · ${shown.size} stopp" else "Avganger · " + (shown.firstOrNull()?.name ?: "")
    PCard(modifier, onClick = { vm.openRuter() }) {
        Column(Modifier.padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PLabel(title, modifier = Modifier.weight(1f))
                Box(
                    Modifier.height(30.dp).clip(CircleShape).border(1.dp, p.line, CircleShape)
                        .clickable(role = Role.Button, onClickLabel = "Velg stopp") { Haptics.select(); s.homeSheet = true }.padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("Velg stopp", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1) }
                Text("sanntid ›", color = p.mut, fontSize = 12.sp)
            }
            shown.forEachIndexed { gi, st ->
                val n = if (multi) minOf(s.homeDep.n, 2) else s.homeDep.n
                val deps = (s.homeDeps[st.id]?.departures ?: emptyList()).filter { !it.cancelled }.take(n)
                if (multi) Text(st.name, color = p.mut, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = if (gi > 0) 4.dp else 0.dp))
                if (deps.isEmpty()) Text(if (s.homeDeps.containsKey(st.id)) "Ingen avganger nå." else "Henter …", color = p.mut, fontSize = 13.sp)
                deps.forEach { d -> DepRow27(d) }
            }
        }
    }
    if (s.homeSheet) VelgStopp27(vm)
}

@Composable
private fun DepRow27(d: Dep) {
    val p = PaperPal.current
    val c = d.color ?: ruterModeColor(d.mode, d.line)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.widthIn(min = 30.dp).height(24.dp).clip(RoundedCornerShape(6.dp)).background(Color(c)).padding(horizontal = 5.dp), contentAlignment = Alignment.Center) {
            Text(d.line, color = Color(d.textColor ?: 0xFFFFFFFF), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
        }
        Text(d.to, color = p.ink, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        val m = d.minutes
        PSerif(m?.let { if (it <= 0) "nå" else "$it" } ?: (d.expected ?: d.aimed)?.let(::hm27) ?: "–", 22.sp, maxLines = 1)
        Text(if (m != null && m > 0) "min" else "", color = p.mut, fontSize = 12.sp, modifier = Modifier.width(26.dp))
    }
}

/** «19:04» fra ISO-tid eller klokkeslett. */
private fun hm27(t: String): String = Regex("""(\d{2}:\d{2})""").find(t)?.value ?: t

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VelgStopp27(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b27
    val ctx = LocalContext.current
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val stops = s.homeStops ?: emptyList()
    val sel = s.homeDep.stops.filter { id -> stops.any { it.id == id } }.ifEmpty { stops.take(1).map { it.id } }
    ModalBottomSheet(onDismissRequest = { s.homeSheet = false }, sheetState = state, containerColor = p.bg, contentColor = p.ink,
        dragHandle = { Box(Modifier.padding(top = 10.dp).size(40.dp, 5.dp).clip(RoundedCornerShape(3.dp)).background(p.line)) }) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(16.dp, 8.dp, 16.dp, 30.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    PLabel("Hjem · Ruter-kortet")
                    PSerif("Velg stopp", 24.sp)
                }
                Box(Modifier.height(36.dp).clip(CircleShape).background(p.ink).clickable { s.homeSheet = false }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                    Text("Ferdig", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
            Text("Velg opptil 3 stopp. Rekkefølgen følger Mine stopp.", color = p.mut, fontSize = 13.sp)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
                if (stops.isEmpty()) Text("Ingen egne stopp ennå. Legg til en holdeplass under.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
                stops.forEachIndexed { i, st ->
                    val on = st.id in sel
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Checkbox) {
                            Haptics.select()
                            val v = if (on) sel.filter { it != st.id } else (sel + st.id).takeLast(3)
                            if (v.isNotEmpty()) vm.setHomeDep27(s.homeDep.copy(stops = stops.map { it.id }.filter { it in v }), ctx)
                        }.padding(14.dp, 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            Modifier.size(24.dp).clip(RoundedCornerShape(8.dp)).background(if (on) p.ink else Color.Transparent).border(1.5.dp, if (on) p.ink else p.line, RoundedCornerShape(8.dp)),
                            contentAlignment = Alignment.Center,
                        ) { Text("✓", color = if (on) p.bg else Color.Transparent, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold) }
                        Column(Modifier.weight(1f)) {
                            Text(st.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            val sub = st.locality.ifBlank { s.homeDeps[st.id]?.departures?.firstOrNull()?.let { "${it.line} ${it.to}" } ?: "Holdeplass" }
                            Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1)
                        }
                    }
                }
            }
            PLabel("Avganger per stopp", modifier = Modifier.padding(top = 4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..4).forEach { k ->
                    val on = s.homeDep.n == k
                    Box(
                        Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(14.dp)).background(if (on) p.ink else p.card)
                            .clickable(role = Role.RadioButton) { Haptics.select(); vm.setHomeDep27(s.homeDep.copy(n = k), ctx) },
                        contentAlignment = Alignment.Center,
                    ) { Text("$k", color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp) }
                }
            }
            Box(
                Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(23.dp)).border(1.dp, p.line, RoundedCornerShape(23.dp)).clickable { vm.manageStops27() },
                contentAlignment = Alignment.Center,
            ) { Text("Legg til eller fjern stopp ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
        }
    }
}
