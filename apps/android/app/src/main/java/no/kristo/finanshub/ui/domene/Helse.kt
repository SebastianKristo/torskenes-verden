@file:JvmName("DomeneHelse")

package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Helse: kode som lå i blandingsfilene (Ui42.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

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
    vm.p45.haStatus?.let { Text("● Tilkoblet · $it", color = p.pos, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 6.dp)) }
    // Prompt 45: Telefoner (standard, uten nettbrett) · Alle mobilapp.
    Row(Modifier.clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).padding(3.dp)) {
        listOf("phones" to "Telefoner", "all" to "Alle mobilapp").forEach { (k, n) ->
            val on = vm.p45.haView == k
            Box(Modifier.height(36.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent)
                .clickable(role = Role.Tab) { if (!on) { Haptics.select(); vm.p45.haView = k; vm.loadHa42(force = true) } }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }
        }
    }
    when {
        s.haMissing -> PCard { Text("Serveren har ikke helse fra Home Assistant ennå. Oppdater Homelab, og koble til Home Assistant under Innstillinger → Integrasjoner.",
            color = p.mut, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(14.dp)) }
        s.haError != null -> PCard {
            Text(s.haError ?: "", color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(14.dp, 12.dp, 14.dp, 4.dp))
            PRow("Prøv igjen", null, "↻", serif = false, top = true) { vm.loadHa42(force = true) }
        }
        s.haDevices == null -> PCard { Text(if (s.haBusy) "Henter enhetene fra Home Assistant …" else "Ingen enheter ennå.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp)) }
        s.haDevices!!.isEmpty() -> PCard { Text("Fant ingen enheter fra Mobilapp-integrasjonen i Home Assistant.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp)) }
        else -> {
            // Prompt 45: gruppert per person (overskrift i personens navn), «IKKE KOBLET» sist.
            val devs = s.haDevices!!
            val groups = devs.groupBy { it.personId?.takeIf { id -> s.haPeople.any { it.id == id } } }
            groups.entries.sortedBy { if (it.key == null) 1 else 0 }.forEach { (pid, l) ->
                val name = s.haPeople.firstOrNull { it.id == pid }?.name?.let { firstName37(it) } ?: "Ikke koblet"
                PLabel("$name · ${l.size}", if (pid == null) p.mut else p.lab, modifier = Modifier.padding(start = 6.dp, top = 6.dp))
                PCard { l.forEachIndexed { i, d -> HaDeviceRow42(vm, d, i > 0) } }
            }
        }
    }
    vm.p45.haHidden?.let { Text(it, color = p.mut, fontSize = 12.sp, lineHeight = 16.5.sp, modifier = Modifier.padding(horizontal = 6.dp)) }
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
