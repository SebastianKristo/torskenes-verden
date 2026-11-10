package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
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
 * Prompt 79 (PICKAND): plukklista og «Feilsøk LED» – UI. Tilstand og API i Skjold79.kt.
 *  - PickBtn79: «+» / «✓» på hvert treff (rund) og «＋ Legg i plukklista» på detaljsiden.
 *  - PickBar79: linja nederst «Plukkliste (3)» · «💡 Vis alle med LED» · ›; mens det lyser: nedtelling og «Slå av».
 *  - PickScreen79: plukklista med bilde, navn, plassering, fargeprikk, ± antall jeg tar, «Fjern», «Tøm» og «Ta ut av lager».
 *  - Diagnose79: veiviseren «Feilsøk LED» i LED-oppsettet.
 */

private fun hex79(h: String?): Color = runCatching { Color(android.graphics.Color.parseColor(normColor78(h) ?: LED_COLOR78)) }.getOrDefault(Color(0xFF2F6BFF))

/** Linja nederst vises på lista, detaljsiden og skapsiden når plukklista har deler. */
internal fun pickBarOn79(): Boolean = Skjold79.items.isNotEmpty() && Skjold76.screen in setOf("list", "part", "cab")

/** Fargeprikk (med kant, så hvit og gul synes på papiret). */
@Composable
internal fun Dot79(color: String?, size: Int = 12) {
    val p = PaperPal.current
    Box(Modifier.size(size.dp).clip(CircleShape).background(hex79(color)).border(1.dp, p.ink.copy(alpha = .35f), CircleShape))
}

/** Fargene som lyser nå (én per del når plukklista er tent, ellers skapets farge). */
@Composable
internal fun LitDots79(fallback: Color) {
    val s = Skjold79
    val cols = if (s.colorSeq == Skjold78.locSeq) s.drawerColors.values.distinct().take(6) else emptyList()
    if (cols.isEmpty()) Box(Modifier.size(12.dp).clip(CircleShape).background(fallback))
    else Row(horizontalArrangement = Arrangement.spacedBy((-3).dp)) { cols.forEach { Dot79(it, 12) } }
}

/* ---------------- + / ✓ ---------------- */

@Composable
internal fun PickBtn79(vm: AppViewModel, pt: SkjPart76, big: Boolean = false) {
    val p = PaperPal.current
    val on = Skjold79.items.any { it.id == pt.id }
    if (big) {
        PButton(if (on) "✓ I plukklista – trykk for å fjerne" else "＋ Legg i plukklista", Modifier.fillMaxWidth()
            .semantics { contentDescription = if (on) "Fjern ${pt.name} fra plukklista" else "Legg ${pt.name} i plukklista" }, kind = if (on) "line" else "ink") { vm.togglePick79(pt) }
        return
    }
    Box(Modifier.size(40.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).border(1.dp, if (on) p.ink else p.line, CircleShape)
        .clickable(role = Role.Button) { vm.togglePick79(pt) }
        .semantics { contentDescription = if (on) "Fjern ${pt.name} fra plukklista" else "Legg ${pt.name} i plukklista" }, contentAlignment = Alignment.Center) {
        Text(if (on) "✓" else "+", color = if (on) p.bg else p.ink, fontSize = if (on) 16.sp else 20.sp, fontWeight = FontWeight.Bold)
    }
}

/* ---------------- Linja nederst ---------------- */

/** Sekunder igjen mens skuffer lyser (0 = av). Slukker tilstanden når tiden er ute. */
@Composable
private fun litSecs79(): Long {
    val s = Skjold78
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(s.litUntil) {
        while (s.litUntil > 0) {
            now = System.currentTimeMillis()
            if (now >= s.litUntil) { s.lit = emptyList(); s.litUntil = 0L; break }
            delay(1_000)
        }
    }
    return if (s.litUntil <= 0 || s.lit.isEmpty()) 0 else ((s.litUntil - now + 999) / 1000).coerceAtLeast(0)
}

@Composable
internal fun PickBar79(vm: AppViewModel, modifier: Modifier) {
    if (!pickBarOn79()) return
    val s = Skjold79
    val l78 = Skjold78
    val p = PaperPal.current
    val secs = litSecs79()
    val lit = secs > 0
    val ready = locatablePick79(s.items) { ledReady78(l78.leds[it]) }.size
    Row(modifier.navigationBarsPadding().padding(16.dp).fillMaxWidth().widthIn(max = 560.dp).shadow(10.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp))
        .background(p.ink).padding(start = 6.dp, end = 6.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.weight(1f).heightIn(min = 48.dp).clip(RoundedCornerShape(14.dp)).clickable(role = Role.Button) { vm.openPick79() }
            .semantics { contentDescription = "Åpne plukklista, ${s.items.size} deler" }.padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (lit) LitDots79(hex79(l78.lit.firstNotNullOfOrNull { it.cabinetId?.let { c -> l78.leds[c]?.color } }))
            Column(Modifier.weight(1f)) {
                Text(barText79(s.items.size), color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
                Text(if (lit) litText78(l78.lit.size, secs) else if (l78.locBusy) "Tenner …" else if (ready > 0) "$ready med LED" else "Trykk for å åpne",
                    color = p.bg.copy(alpha = .7f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        when {
            lit -> BarPill79("Slå av", "Slå av lyset") { vm.locateOff78() }
            ready > 0 -> BarPill79(if (l78.locBusy) "Tenner …" else "💡 Vis alle med LED", "Vis alle delene i plukklista med LED") { if (!l78.locBusy) vm.locatePick79() }
        }
        Box(Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Button) { vm.openPick79() }.semantics { contentDescription = "Åpne plukklista" }, contentAlignment = Alignment.Center) {
            Text("›", color = p.bg, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun BarPill79(t: String, desc: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Text(t, color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1,
        modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape).border(1.dp, p.bg.copy(alpha = .5f), CircleShape).clickable(role = Role.Button) { onClick() }
            .semantics { contentDescription = desc }.wrapContentHeight().padding(horizontal = 12.dp))
}

/* ---------------- Plukklista ---------------- */

@Composable
internal fun PickScreen79(vm: AppViewModel) {
    val s = Skjold79
    val l78 = Skjold78
    val p = PaperPal.current
    LaunchedEffect(Unit) { vm.refreshPick79() }
    val ready = { c: String -> ledReady78(l78.leds[c]) }
    val n = locatablePick79(s.items, ready).size
    val lit = l78.litUntil > 0 && l78.lit.isNotEmpty()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 140.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (s.items.isEmpty()) {
            PCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PSerif("Plukklista er tom", 22.sp)
                    Text("Trykk «+» på en del i søket eller på detaljsiden, f.eks. gul diode, ESP32 og transistor. Så tenner «💡 Vis alle med LED» skuffene – hver del i sin farge.",
                        color = p.sub, fontSize = 14.sp)
                }
            }
            return@Column
        }
        Text("${s.items.size} ${if (s.items.size == 1) "del" else "deler"} · $n i skap med LED", color = p.mut, fontSize = 13.sp)
        if (lit) PButton("Slå av lyset", Modifier.fillMaxWidth(), kind = "line") { vm.locateOff78() }
        else if (n > 0) PButton(if (l78.locBusy) "Tenner …" else "💡 Vis alle med LED ($n)", Modifier.fillMaxWidth()) { if (!l78.locBusy) vm.locatePick79() }
        l78.locErr?.let { Text(it, color = p.lab, fontSize = 13.sp) }
        s.items.forEach { it -> PickRow79(vm, it) }
        PHead("Ferdig med å plukke")
        Text("«Ta ut av lager» trekker fra antallet du tar for alle delene og tømmer lista. Du kan angre i 10 s.", color = p.mut, fontSize = 12.5.sp)
        PickProject82() // prompt 82: «Til produkt: [velg/ingen]»
        val busy = s.busy || Skjold82.busy
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton(if (busy) "Trekker fra …" else "Ta ut av lager", Modifier.weight(1.4f)) { if (!busy) vm.takeOut79() }
            PButton("Tøm", Modifier.weight(1f), kind = "line") { vm.clearPick79() }
        }
    }
}

@Composable
private fun PickRow79(vm: AppViewModel, it: SkjPick79) {
    val p = PaperPal.current
    val col = colorOf79(it)
    val why = Skjold79.skipped[it.id]
    PCard(shadow = true, onClick = { Haptics.tap(); vm.openPart76(it.id) }) {
        Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box {
                Img76(vm, it.thumb, 200, Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)))
                if (col != null) Box(Modifier.align(Alignment.TopEnd).offset(4.dp, (-4).dp).semantics { contentDescription = "Lyser" }) { Dot79(col, 18) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(it.name.ifBlank { "Del ${it.id}" }, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(it.loc.ifBlank { "Uten plass" }, color = if (it.placed) p.sub else p.lab, fontSize = 12.5.sp, fontFamily = PaperFonts.mono, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val stock = it.qty?.let { q -> "På lager: ${qtyText76(q)} ${it.unit}" + if (it.take > q) " – du tar flere enn det er" else "" }
                stock?.let { t -> Text(t, color = if ((it.qty ?: 0.0) < it.take) p.lab else p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                if (col == null && why != null) Text(why, color = p.lab, fontSize = 12.sp, maxLines = 1)
                Text("Fjern", color = p.sub, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.heightIn(min = 36.dp).clip(RoundedCornerShape(8.dp))
                    .clickable(role = Role.Button) { vm.removePick79(it.id) }.semantics { contentDescription = "Fjern ${it.name} fra plukklista" }.wrapContentHeight().padding(end = 8.dp))
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                PLabel("Tar", p.mut, 9.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Step79("−", "Ta én færre av ${it.name}", it.take > 1) { vm.takePick79(it.id, -1) }
                    Text("${it.take}", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.widthIn(min = 28.dp), maxLines = 1,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    Step79("+", "Ta én mer av ${it.name}", true) { vm.takePick79(it.id, 1) }
                }
                Text(it.unit, color = p.mut, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun Step79(t: String, desc: String, enabled: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(40.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(enabled = enabled, role = Role.Button) { onClick() }
        .semantics { contentDescription = desc }, contentAlignment = Alignment.Center) {
        Text(t, color = if (enabled) p.ink else p.mut, fontSize = 18.sp, fontWeight = FontWeight.Bold)
    }
}

/* ---------------- Feilsøk LED ---------------- */

@Composable
internal fun Diagnose79(vm: AppViewModel) {
    val s = Skjold79
    val p = PaperPal.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(s.diagBusy) { while (s.diagBusy) { now = System.currentTimeMillis(); delay(250) } }
    PCard(shadow = true) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PLabel("Feilsøk LED")
            PSerif("Hvorfor lyser ikke stripa?", 22.sp)
            if (s.diagSteps.isEmpty() && !s.diagBusy) {
                Text("Skjold Lab spør WLED om info og tilstand, lyser hele stripa rødt i 3 s med vanlig farge, så én LED blått i 3 s slik appen gjør det, og setter alt tilbake. " +
                    "Se på stripa mens det skjer.", color = p.sub, fontSize = 14.sp)
                PButton("Start feilsøkingen", Modifier.fillMaxWidth()) { vm.runDiag79() }
            }
            if (s.diagBusy) {
                val t = (now - s.diagStarted).coerceAtLeast(0) / 1000.0
                val (col, txt) = when {
                    t < 1.0 -> null to "Spør WLED …"
                    t < 4.5 -> "#FF1744" to "Se på stripa: hele stripa skal lyse RØDT nå"
                    t < 8.0 -> "#2F6BFF" to "Se på stripa: én LED skal lyse BLÅTT nå"
                    else -> null to "Setter tilbake …"
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (col != null) Dot79(col, 18) else CircularProgressIndicator(color = p.mut, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    Text(txt, color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                }
                Text("Omtrentlig tid – serveren styrer stegene.", color = p.mut, fontSize = 12.sp)
            }
            s.diagErr?.let { Text(it, color = p.lab, fontSize = 13.5.sp) }
            s.diagSteps.forEach { st ->
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(if (st.ok) "✓" else "✕", color = if (st.ok) Color(0xFF2E9D57) else p.lab, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.width(18.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (st.name == "?" || st.name == st.key) diagLabel79(st.key ?: st.name) else st.name, color = p.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        st.detail?.let { Text(it, color = p.mut, fontSize = 12.5.sp, fontFamily = PaperFonts.mono, maxLines = 4, overflow = TextOverflow.Ellipsis) }
                    }
                }
            }
            if (!s.diagBusy && diagAsk79(s.diagSteps)) {
                Ask79("Lyste stripa rødt?", s.diagRed) { s.diagRed = it; Haptics.select() }
                Ask79("Lyste én LED blått?", s.diagBlue) { s.diagBlue = it; Haptics.select() }
            }
            if (s.diagWarnings.isNotEmpty()) Text("Funnet i WLED: " + s.diagWarnings.joinToString(" "), color = p.lab, fontSize = 13.sp)
            val hint = diagHintText79(s.diagRed, s.diagBlue, s.diagHints)
            hint?.let {
                Text(it, color = p.ink, fontSize = 14.sp, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.surf2).padding(12.dp))
            }
            if (!s.diagBusy && s.diagHint != null && !diagAsk79(s.diagSteps)) Text(s.diagHint!!, color = p.sub, fontSize = 13.5.sp)
            if (!s.diagBusy && (s.diagSteps.isNotEmpty() || s.diagErr != null)) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Kjør igjen", Modifier.weight(1f), kind = "line", height = 44.dp) { vm.runDiag79() }
                PButton("Ferdig", Modifier.weight(1f), height = 44.dp) { stopDiag79() }
            }
            if (s.diagSteps.isEmpty() && !s.diagBusy) PButton("Avbryt", Modifier.fillMaxWidth(), kind = "line", height = 44.dp) { stopDiag79() }
        }
    }
}

@Composable
private fun Ask79(q: String, v: Boolean?, set: (Boolean) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(q, color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        listOf(true to "Ja", false to "Nei").forEach { (b, t) ->
            val on = v == b
            Text(t, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.heightIn(min = 44.dp).widthIn(min = 56.dp).clip(CircleShape)
                .background(if (on) p.ink else Color.Transparent).border(1.dp, if (on) p.ink else p.line, CircleShape).clickable(role = Role.RadioButton) { set(b) }
                .semantics { contentDescription = "$q $t" }.wrapContentHeight().padding(horizontal = 14.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}
