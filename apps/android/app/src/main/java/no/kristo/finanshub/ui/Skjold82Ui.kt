package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 82 (CHKAND): sjekk ut deler til et produkt – UI. Tilstand og API i Skjold82.kt.
 *  - ProjectsEntry82: «Produkter» på forsiden av Skjold Lab.
 *  - CheckoutBtn82 + UsedIn82 på delsiden; CheckoutSheet82 er arket «Sjekk ut» (antall ±, produkt, notat).
 *  - ProjectsScreen82 (liste) og ProjectScreen82 (stykkliste, «Sjekk inn», «Marker som ferdig», «Gi nytt navn», «Slett»).
 *  - PickProject82: «Til produkt: [velg/ingen]» i plukklista.
 */

/* ---------------- Forsiden ---------------- */

@Composable
internal fun ProjectsEntry82(vm: AppViewModel) {
    val p = PaperPal.current
    val l = Skjold82.projects.orEmpty()
    val active = l.count { !it.done }
    PCard(shadow = true, onClick = { vm.openProjects82() }) {
        Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 14.dp, vertical = 10.dp).semantics { contentDescription = "Produkter, $active aktive" },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f)) {
                Text("Produkter", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Text(if (l.isEmpty()) "Sjekk ut deler til det du bygger" else "$active aktive · ${l.size - active} ferdige", color = p.mut, fontSize = 12.5.sp, maxLines = 1)
            }
            Text("›", color = p.ink, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/* ---------------- Delsiden ---------------- */

@Composable
internal fun CheckoutBtn82(vm: AppViewModel, pt: SkjPart76) {
    val none = maxOut82(pt.qty) <= 0
    PButton(if (none) "Sjekk ut (tomt på lager)" else "Sjekk ut til produkt", Modifier.fillMaxWidth().semantics { contentDescription = "Sjekk ut ${pt.name} til et produkt" },
        kind = if (none) "line" else "ink") { vm.startCheckout82(pt) }
}

@Composable
internal fun UsedIn82(vm: AppViewModel, pt: SkjPart76) {
    val p = PaperPal.current
    val used = usedIn82(pt)
    if (used.isEmpty()) return
    PHead("Brukt i", "${used.size}")
    PCard {
        used.forEachIndexed { i, u ->
            PRow(u.name, statusText82(u.status), "${qtyText76(u.qty)} ${pt.unit} ›", p.ink, serif = false, top = i > 0) { vm.openProject82(u.projectId) }
        }
    }
}

/** Arket «Sjekk ut»: antall (± maks lager), produkt (aktive + «Nytt produkt …»), notat. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun CheckoutSheet82(vm: AppViewModel) {
    val s = Skjold82
    val c = s.sheet ?: return
    val p = PaperPal.current
    val pt = c.part
    val max = maxOut82(pt.qty)
    val active = s.projects.orEmpty().filter { !it.done }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .4f)).clickable { s.sheet = null }, contentAlignment = Alignment.BottomCenter) {
        PCard(Modifier.fillMaxWidth().widthIn(max = 560.dp).imePadding().navigationBarsPadding().padding(12.dp), shadow = true) {
            Column(Modifier.clickable(enabled = false) {}.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PSerif("Sjekk ut", 22.sp)
                Text(pt.name, color = p.sub, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        PLabel("Antall")
                        Text("${c.qty} ${pt.unit}", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                        Text("Maks $max (på lager)", color = p.mut, fontSize = 12.sp)
                    }
                    Step82("−", "Én færre", c.qty > 1) { s.sheet = c.copy(qty = clampOut82(c.qty - 1, pt.qty)); Haptics.select() }
                    Step82("+", "Én mer", c.qty < max) { s.sheet = c.copy(qty = clampOut82(c.qty + 1, pt.qty)); Haptics.select() }
                }
                PLabel("Til produkt")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    active.forEach { pr -> PChip(pr.name, c.projectId == pr.id && c.newName == null) { s.sheet = c.copy(projectId = pr.id, newName = null) } }
                    PChip("Nytt produkt …", c.newName != null) { s.sheet = c.copy(projectId = null, newName = c.newName ?: "") }
                }
                if (c.newName != null) PField("Navn på produktet", c.newName, { s.sheet = c.copy(newName = it.take(MAX_NAME82)) }, placeholder = "Værstasjon")
                PField("Notat (valgfritt)", c.note, { s.sheet = c.copy(note = it.take(500)) }, placeholder = "f.eks. prototype 2")
                val ok = max > 0 && (c.projectId != null || projectName82(c.newName) != null)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PButton(if (s.busy) "Sjekker ut …" else "Sjekk ut", Modifier.weight(1.4f), kind = if (ok) "ink" else "line") { if (!s.busy) vm.confirmCheckout82() }
                    PButton("Avbryt", Modifier.weight(1f), kind = "line") { s.sheet = null; Haptics.dismiss() }
                }
            }
        }
    }
}

@Composable
private fun Step82(t: String, desc: String, enabled: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(48.dp).clip(CircleShape).background(if (enabled) p.ink else p.line).clickable(enabled = enabled, role = Role.Button, onClickLabel = desc, onClick = onClick)
        .semantics { contentDescription = desc }, contentAlignment = Alignment.Center) {
        Text(t, color = if (enabled) p.bg else p.mut, fontSize = 22.sp, fontWeight = FontWeight.Bold)
    }
}

/* ---------------- Produkter ---------------- */

@Composable
internal fun ProjectsScreen82(vm: AppViewModel) {
    val s = Skjold82
    val p = PaperPal.current
    var newName by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 140.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Når du bruker deler i noe du bygger, sjekker du dem ut fra delsiden eller plukklista. Da trekkes de fra lageret, og du ser her hva hvert produkt inneholder.",
            color = p.mut, fontSize = 13.sp)
        s.projErr?.let { Text(it, color = p.lab, fontSize = 13.sp) }
        val l = s.projects
        when {
            l == null -> Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) }
            l.isEmpty() && s.projErr == null -> PCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PSerif("Ingen produkter ennå", 20.sp)
                    Text("Trykk «Sjekk ut til produkt» på en del, eller lag et produkt her.", color = p.sub, fontSize = 14.sp)
                }
            }
            else -> {
                val act = l.filter { !it.done }
                val done = l.filter { it.done }
                if (act.isNotEmpty()) { PHead("Aktive", "${act.size}"); act.forEach { ProjectRow82(vm, it) } }
                if (done.isNotEmpty()) { PHead("Ferdige", "${done.size}"); done.forEach { ProjectRow82(vm, it) } }
            }
        }
        val n = newName
        if (n == null) PButton("+ Nytt produkt", Modifier.fillMaxWidth(), kind = "line") { newName = "" }
        else PCard(shadow = true) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                PField("Navn på produktet", n, { newName = it.take(MAX_NAME82) }, placeholder = "Værstasjon")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PButton("Lag", Modifier.weight(1f)) { if (projectName82(n) != null) { vm.createProject82(n); newName = null } else { vm.flash("Navnet må ha 1–$MAX_NAME82 tegn"); Haptics.error() } }
                    PButton("Avbryt", Modifier.weight(1f), kind = "line") { newName = null }
                }
            }
        }
    }
}

@Composable
private fun ProjectRow82(vm: AppViewModel, pr: SkjProject82) {
    val p = PaperPal.current
    PCard(shadow = !pr.done, onClick = { vm.openProject82(pr.id) }) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(pr.name, color = if (pr.done) p.sub else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(projSub82(pr), color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            StatusTag82(pr.status)
            Text("›", color = p.ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun StatusTag82(status: String) {
    val p = PaperPal.current
    val done = status == "ferdig"
    Text(statusText82(status), color = if (done) p.mut else p.bg, fontSize = 11.5.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(CircleShape).background(if (done) Color.Transparent else p.ink).border(1.dp, if (done) p.line else p.ink, CircleShape).padding(horizontal = 10.dp, vertical = 3.dp))
}

@Composable
internal fun ProjectScreen82(vm: AppViewModel) {
    val s = Skjold82
    val p = PaperPal.current
    val pr = s.current ?: run { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) }; return }
    val lines = s.lines
    val bom = lines?.let { bom82(it) }
    val units = bom?.sumOf { it.net } ?: pr.units
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 140.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif(pr.name, 26.sp, modifier = Modifier.weight(1f))
            StatusTag82(pr.status)
        }
        Text(listOfNotNull("${qtyText76(units)} stk", "${bom?.size ?: pr.parts} ${if ((bom?.size ?: pr.parts) == 1) "del" else "deler"}",
            (bom?.let { b -> b.filter { it.price != null }.takeIf { it.isNotEmpty() }?.sumOf { it.net * (it.price ?: 0.0) } } ?: pr.cost)?.let { costText82(it) }).joinToString(" · "),
            color = p.mut, fontSize = 13.sp)
        pr.notes?.takeIf { it.isNotBlank() }?.let { Text(it, color = p.ink, fontSize = 14.sp) }
        PHead("Stykkliste", bom?.size?.toString())
        when {
            bom == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) }
            bom.isEmpty() -> Text("Ingen deler er sjekket ut til dette produktet.", color = p.mut, fontSize = 14.sp)
            else -> bom.forEach { BomRow82(vm, it) }
        }
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton(if (pr.done) "Gjør aktiv igjen" else "Marker som ferdig", kind = if (pr.done) "line" else "ink") { vm.toggleDone82() }
            PButton("Gi nytt navn", kind = "line") { s.renameAsk = true }
            PButton("Slett", kind = "lab") {
                if (canDelete82(units)) s.deleteAsk = true else { vm.flash("Sjekk inn alle delene før produktet kan slettes."); Haptics.error() }
            }
        }
        if (s.renameAsk) RenameCard82(vm, pr)
        if (s.deleteAsk) PCard {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Slette «${pr.name}»?", color = p.ink, fontSize = 14.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PButton("Slett", Modifier.weight(1f), kind = "lab") { vm.deleteProject82() }
                    PButton("Avbryt", Modifier.weight(1f), kind = "line") { s.deleteAsk = false }
                }
            }
        }
    }
}

@Composable
private fun RenameCard82(vm: AppViewModel, pr: SkjProject82) {
    var name by remember(pr.id) { mutableStateOf(pr.name) }
    PCard(shadow = true) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PField("Nytt navn", name, { name = it.take(MAX_NAME82) }, onDone = { vm.renameProject82(name) })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Lagre", Modifier.weight(1f)) { vm.renameProject82(name) }
                PButton("Avbryt", Modifier.weight(1f), kind = "line") { Skjold82.renameAsk = false }
            }
        }
    }
}

@Composable
private fun BomRow82(vm: AppViewModel, b: SkjBom82) {
    val s = Skjold82
    val p = PaperPal.current
    val ret = s.returning?.takeIf { it.first == b.partId }
    val max = maxOut82(b.net).coerceAtLeast(1)
    PCard(shadow = true, onClick = { Haptics.tap(); vm.openPart76(b.partId) }) {
        Column(Modifier.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Img76(vm, b.thumbUrl, 200, Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(b.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(b.loc.ifBlank { "Uten plass" }, color = p.sub, fontSize = 12.5.sp, fontFamily = PaperFonts.mono, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    b.price?.let { Text(costText82(it * b.net), color = p.mut, fontSize = 12.sp) }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(qtyText76(b.net), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(b.unit, color = p.mut, fontSize = 11.sp)
                }
            }
            if (ret == null) Text("Sjekk inn", color = p.sub, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.heightIn(min = 40.dp).clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { s.returning = b.partId to max; Haptics.tap() }
                    .semantics { contentDescription = "Sjekk inn ${b.name} til lageret" }.wrapContentHeight().padding(horizontal = 4.dp))
            else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Step82("−", "Én færre", ret.second > 1) { s.returning = b.partId to (ret.second - 1).coerceAtLeast(1); Haptics.select() }
                Text("${ret.second}", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.widthIn(min = 28.dp), textAlign = TextAlign.Center)
                Step82("+", "Én mer", ret.second < max) { s.returning = b.partId to (ret.second + 1).coerceAtMost(max); Haptics.select() }
                PButton(if (s.busy) "…" else "Sjekk inn", Modifier.weight(1f)) { if (!s.busy) vm.returnPart82(b, ret.second) }
                Text("✕", color = p.mut, modifier = Modifier.size(40.dp).clip(CircleShape).clickable { s.returning = null }.wrapContentSize().semantics { contentDescription = "Avbryt" })
            }
        }
    }
}

/* ---------------- Plukklista ---------------- */

/** «Til produkt: [velg/ingen]» over «Ta ut av lager». */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PickProject82() {
    val s = Skjold82
    val p = PaperPal.current
    val active = s.projects.orEmpty().filter { !it.done }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Til produkt")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            PChip("Ingen", s.pickProject == null && s.pickNew == null) { s.pickProject = null; s.pickNew = null }
            active.forEach { pr -> PChip(pr.name, s.pickProject == pr.id) { s.pickProject = pr.id; s.pickNew = null } }
            PChip("Nytt produkt …", s.pickNew != null) { s.pickProject = null; s.pickNew = s.pickNew ?: "" }
        }
        s.pickNew?.let { n -> PField("Navn på produktet", n, { s.pickNew = it.take(MAX_NAME82) }, placeholder = "Værstasjon") }
        val to = s.pickProject?.let { id -> active.firstOrNull { it.id == id }?.name } ?: s.pickNew?.let { projectName82(it) }
        Text(if (to != null) "Delene sjekkes ut til «$to» – alt eller ingenting." else "Uten produkt trekkes delene bare fra lageret.", color = p.mut, fontSize = 12.5.sp)
    }
}
