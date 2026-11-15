@file:JvmName("DomeneHjemlys")

package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Hjemlys: kode som lå i blandingsfilene (Ui40.kt, Ui41.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Hjemlys ======================= */

private val HL_GREEN40 = Color(0xFF2F9E5B)

private val HL_RED40 = Color(0xFFD9412E)

private val HL_GOLD40 = Color(0xFFF2A93B)

/** Den glødende prikken (#FFE7A3 → #F2A93B) med ring i tilstandsfargen. */
@Composable
internal fun HlDot40(state: String?, size: Dp = 34.dp) {
    val ring = when (state) { "late" -> HL_RED40; "home" -> HL_GOLD40; "onTheWay" -> HL_GREEN40; else -> Color(0x33F2A93B) }
    Box(Modifier.size(size).clip(CircleShape).background(ring.copy(alpha = .18f)).border(2.dp, ring, CircleShape), contentAlignment = Alignment.Center) {
        Box(Modifier.size(size * .46f).clip(CircleShape).background(Brush.radialGradient(listOf(Color(0xFFFFE7A3), Color(0xFFF2A93B)))))
    }
}

private fun hlStateText40(state: String, eta: String?): String {
    val m = hlMinutes40(eta)
    return when (state) {
        "late" -> "Sen" + (m?.takeIf { it < 0 }?.let { " · ${-it} min over" } ?: "")
        "home" -> "Hjemme"
        "ended" -> "Avsluttet"
        else -> "På vei hjem" + (hlClock40(eta)?.let { " · ca. $it" } ?: "")
    }
}

/**
 * Familie-kortet og Hjem-kortet: egen økt (tid, «+ 10 min», «Jeg er hjemme», «Alt OK» når sen), husstanden (bare at Hjemlys er
 * aktivt, delingsdata først når noen er sen), Glimt-forslaget og «Start Hjemlys».
 */
@Composable
internal fun HjemlysCard40(vm: AppViewModel, compact: Boolean = false) {
    val p = PaperPal.current
    val s = vm.p40
    LaunchedEffect(vm.account?.id) { vm.loadHjemlys40() }
    if (s.hlMissing) return
    val h = s.hl
    val mine = h?.mine?.takeIf { it.state != "ended" && it.state != "home" }
    val meId = vm.myUserId40()
    val others = h?.household?.filter { it.userId != meId && it.userId != h.mine?.userId && it.state != "ended" } ?: emptyList()
    if (compact && mine == null && others.isEmpty() && s.hlSuggest?.suggest != true) {
        // Hjem: liten rad når ingenting er aktivt.
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).clickable(role = Role.Button) { s.hlSheet = true }.padding(14.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HlDot40(null, 30.dp)
            Column(Modifier.weight(1f)) {
                Text("Vel fremme", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                Text("Si fra til familien når du er hjemme", color = p.mut, fontSize = 12.5.sp, maxLines = 1)
            }
            Text("Start ›", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
        }
        return
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(22.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HlDot40(mine?.state)
            Column(Modifier.weight(1f)) {
                PLabel("FAMILIE · VEL FREMME", p.mut)
                Text(mine?.let { hlStateText40(it.state, it.eta) } ?: "Si fra når du er hjemme", color = if (mine?.state == "late") HL_RED40 else p.ink, fontWeight = FontWeight.Bold, fontSize = 15.5.sp)
            }
            mine?.let { m -> hlMinutes40(m.eta)?.takeIf { it >= 0 }?.let { Text("$it min", color = HL_GREEN40, fontFamily = PaperFonts.serif, fontSize = 24.sp) } }
        }
        if (mine != null) {
            Text("Åpne Vel fremme ›", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable { s.hlSheet = true })
            Text(if (mine.state == "late") "Familien har fått beskjed med posisjonen din." else "Husstanden ser at Vel fremme er på. Ingenting deles før du er sen.",
                color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (mine.state == "late") {
                    PButton("Alt OK", Modifier.weight(1f), height = 42.dp) { vm.hjemlysAct40("ok") }
                    PButton("+ 15 min", Modifier.weight(1f), kind = "line", height = 42.dp) { vm.hjemlysAct40("plus15") }
                } else {
                    PButton("+ 10 min", Modifier.weight(1f), kind = "line", height = 42.dp) { vm.hjemlysAct40("plus") }
                    PButton("Jeg er hjemme", Modifier.weight(1f), height = 42.dp) { vm.hjemlysAct40("home") }
                }
            }
            Text("Avslutt", color = p.mut, fontSize = 12.5.sp, textDecoration = TextDecoration.Underline, modifier = Modifier.clickable { vm.hjemlysAct40("end") })
        }
        others.forEach { m ->
            // Trykk: mottakers visning (1a rolig / 1c rød om natten) når personen er sen, ellers Hjemlys-siden.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { s.hlLateFor = m.userId.takeIf { m.state == "late" }; s.hlSheet = true },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                HlDot40(m.state, 26.dp)
                Column(Modifier.weight(1f)) {
                    Text(firstName37(m.name), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    Text(hlStateText40(m.state, m.eta), color = if (m.state == "late") HL_RED40 else p.mut, fontSize = 12.5.sp)
                    // Delingsdataene finnes bare når personen er sen (serveren sender dem ikke ellers).
                    m.share?.takeIf { m.state == "late" }?.let { sh ->
                        val pos = sh.optJSONObject("pos")
                        val bat = sh.optJSONObject("battery")?.optInt("level", -1)?.takeIf { it >= 0 } ?: sh.optInt("battery", -1).takeIf { it >= 0 }
                        Text(listOfNotNull(sh.optString("place").takeIf { it.isNotBlank() } ?: pos?.let { "%.4f, %.4f".format(it.optDouble("lat"), it.optDouble("lon")) },
                            bat?.let { "batteri $it %" }, sh.optString("with").takeIf { it.isNotBlank() }?.let { "var med $it" }).joinToString(" · "), color = p.sub, fontSize = 12.sp)
                    }
                }
            }
        }
        // 1b: Glimt foreslår («Ja, start» / «Ikke nå»).
        if (mine == null) Suggest40(vm, false)
        if (mine == null) PButton("Start Vel fremme", Modifier.fillMaxWidth(), kind = "lab", height = 44.dp) { s.hlSheet = true }
    }
}

/* ======================= Hjemlys: Si fra ======================= */

/** Tre knapper øverst på Hjemlys: Sjekket inn · Drar snart · Drar nå. */
@Composable
internal fun SiFra41(vm: AppViewModel, night: Boolean) {
    val p = PaperPal.current
    val ink = if (night) Color(0xFFF3EFE6) else p.ink
    val card = if (night) Color(0x1FFFFFFF) else p.card
    PLabel("SI FRA", if (night) Color(0xFFB9B2A4) else p.mut)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(Triple("checkin", "Sjekket inn", "jeg er fremme"), Triple("leaving_soon", "Drar snart", "om litt"), Triple("leaving_now", "Drar nå", "på vei")).forEach { (k, n, sub) ->
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(card).clickable(role = Role.Button) { Haptics.tap(); vm.p41.sfSent = null; vm.p41.sfErr = null; vm.p41.sfKind = k }.padding(12.dp, 12.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(when (k) { "checkin" -> Color(0xFFF2A93B); "leaving_soon" -> Color(0xFF6FA8DC); else -> Color(0xFF3FAE6A) }))
                Text(n, color = ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
                Text(sub, color = if (night) Color(0xFFB9B2A4) else p.mut, fontSize = 11.5.sp, maxLines = 1)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SiFraSheet41(vm: AppViewModel, kind: String) {
    val p = PaperPal.current
    val s = vm.p41
    LaunchedEffect(Unit) { vm.loadSfPeople41(); if (vm.family == null) vm.loadFamily() }
    val people = vm.sfPeople41()
    var to by remember(kind, people.size) { mutableStateOf(vm.sfLastTo41(kind)?.filter { id -> people.any { it.first == id } }?.toSet()?.takeIf { it.isNotEmpty() } ?: people.map { it.first }.toSet()) }
    var place by remember(kind) { mutableStateOf(vm.sfPlace41() ?: "") }
    var mins by remember(kind) { mutableStateOf<Int?>(30) }
    var dest by remember(kind) { mutableStateOf("none") }
    val title = when (kind) { "checkin" -> "Sjekket inn"; "leaving_soon" -> "Drar snart"; else -> "Drar nå" }
    Sheet41({ s.sfKind = null }) {
        PSerif(title, 26.sp)
        val sent = s.sfSent
        if (sent != null) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("✓ SENDT", color = p.pos, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                Text(sent, color = p.ink, fontSize = 15.sp, lineHeight = 21.sp)
            }
            if (kind == "leaving_soon") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("+ 15 min", Modifier.weight(1f), kind = "line") { mins = (mins ?: 30) + 15; vm.plusNotice41(15); s.sfSent = "«${firstName37(vm.displayName)} drar om ca. $mins min» er sendt." }
                PButton("Drar nå", Modifier.weight(1f)) { vm.nowNotice41() }
            }
            PButton("Ferdig", Modifier.fillMaxWidth(), kind = if (kind == "leaving_soon") "line" else "ink") { s.sfKind = null; s.sfSent = null }
            return@Sheet41
        }
        PLabel(if (kind == "checkin") "Hvor er du? (valgfritt)" else "Fra (valgfritt)", p.mut)
        PField("Sted", place, { place = it }, placeholder = "F.eks. Bursdag hos Mari")
        if (kind == "leaving_soon") {
            PLabel("Når drar du?", p.mut)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf<Pair<Int?, String>>(15 to "15 min", 30 to "30 min", 60 to "1 t", null to "Ukjent").forEach { (m, n) -> Pill41(n, mins == m) { mins = m } }
            }
        }
        if (kind == "leaving_now") {
            PLabel("Mål", p.mut)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("home" to "Hjem", "place" to "Annet sted", "none" to "Ikke oppgi").forEach { (k, n) -> Pill41(n, dest == k) { dest = k } }
            }
            if (dest != "none") Text("Med mål starter Vel fremme en tur med forventet tid og «Alt OK?». Uten mål sendes bare beskjeden.", color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
        }
        PLabel("Hvem får beskjed?", p.mut)
        if (people.isEmpty()) Text("Ingen i husstanden ennå. Legg til personer i Familie.", color = p.mut, fontSize = 13.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            people.forEach { (id, n) -> Pill41((if (id in to) "✓ " else "") + firstName37(n), id in to) { to = if (id in to) to - id else to + id } }
        }
        Text("Bare beskjeden og stedet du skriver sendes. Posisjonen din deles ikke.", color = p.mut, fontSize = 12.sp, lineHeight = 16.sp)
        s.sfErr?.let { Text(it, color = p.lab, fontSize = 13.sp) }
        PButton(if (s.sfBusy) "Sender …" else "Send til ${to.size}", Modifier.fillMaxWidth(), kind = "lab", height = 52.dp) {
            // Drar nå med mål = vanlig Hjemlys-tur (serveren starter økta; Hjemlys-skjermen tar over med tid og fremdrift).
            vm.sendNotice41(kind, place, if (kind == "leaving_soon") mins else null, to.toList(), dest = if (kind == "leaving_now") dest else null)
        }
    }
}
