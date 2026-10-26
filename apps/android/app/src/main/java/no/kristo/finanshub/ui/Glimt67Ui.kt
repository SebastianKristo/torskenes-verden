package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 67 (ANDSET67): sidene under Innstillinger → Glimt (tilstand og API i G67.kt), i samme Papir-stil som resten av Innstillinger.
 *  - Glimt67Page: Glimt-siden (figur/brief/stemme, «Send til Chat etter», og radene til undersidene).
 *  - G67MemPage: Glimt husker (listen fra prompt 33) + Forslag, Motstrid og Ikke brukt på lenge, med valgene for nattjobben.
 *  - G67EntPage: Entitetsregister. G67RecPage: Glimt lærer. G67SchPage: Faste oppgaver med «Lag fra tekst». G67QPage: Kvalitet.
 * Ingen side har egen LazyColumn (de står som item i Innstillinger-listen i Paper17.kt).
 */

/* ---------------- Byggeklosser ---------------- */

@Composable
private fun G67Lab(text: String, top: Boolean = true) = PLabel(text, modifier = Modifier.padding(start = 4.dp, top = if (top) 10.dp else 4.dp))

@Composable
private fun G67Note(text: String) = Text(text, color = PaperPal.current.mut, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(horizontal = 8.dp))

@Composable
private fun G67Rule() = Box(Modifier.fillMaxWidth().height(1.dp).background(PaperPal.current.line))

@Composable
private fun G67Txt(title: String, sub: String? = null, bad: Boolean = false) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, color = if (bad) p.lab else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
        if (!sub.isNullOrBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
    }
}

/** Liten knapp (pri = blekk, bad = rød tekst). Minst 44 dp høy. */
@Composable
private fun G67Btn(text: String, kind: String = "", enabled: Boolean = true, onClick: () -> Unit) {
    val p = PaperPal.current
    val fill = kind == "pri"
    Box(
        Modifier.heightIn(min = 44.dp).clip(CircleShape).then(if (fill) Modifier.background(p.ink) else Modifier.border(1.dp, p.line, CircleShape))
            .alpha(if (enabled) 1f else .45f).clickable(enabled = enabled, role = Role.Button) { Haptics.select(); onClick() }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (fill) p.bg else if (kind == "bad") p.lab else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun G67Acts(content: @Composable () -> Unit) =
    FlowRow(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }

/** Tekstfelt med etikett over (flere linjer når lines > 1). */
@Composable
private fun G67Input(label: String, value: String, placeholder: String = "", lines: Int = 1, mono: Boolean = false, onChange: (String) -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        PLabel(label, p.mut, 10.sp)
        Box(Modifier.fillMaxWidth().heightIn(min = 46.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 11.dp)) {
            BasicTextField(
                value, onChange, singleLine = lines == 1, minLines = if (lines > 1) lines else 1,
                textStyle = TextStyle(color = p.ink, fontSize = if (mono) 13.sp else 15.sp, fontFamily = if (mono) PaperFonts.mono else PaperFonts.sans),
                cursorBrush = SolidColor(p.lab), modifier = Modifier.fillMaxWidth(),
                decorationBox = { inner -> Box { if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, color = p.mut, fontSize = 15.sp); inner() } },
            )
        }
    }
}

/** Status-pille («Aktiv», «Kandidat» …). */
@Composable
private fun G67Pill(text: String, color: Color) =
    Text(text, color = color, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
        modifier = Modifier.border(1.dp, color, CircleShape).padding(horizontal = 8.dp, vertical = 1.dp))

@Composable
private fun g67Color(st: String): Color {
    val p = PaperPal.current
    return when (st) { "active", "ok", "green" -> p.pos; "candidate", "partial", "aborted", "paused" -> Color(0xFFB7871A); "running" -> Color(0xFF3B82C4); "disabled", "skipped", "env", "ended" -> p.mut; else -> p.lab }
}

@Composable
private fun G67Chips(items: List<Triple<String, String, Int?>>, sel: String, onPick: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 4.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        items.forEach { (k, n, c) -> PChip(n, sel == k, c?.toString()) { onPick(k) } }
    }
}

/** Bryterne «for meg» og (admin) «for alle», som på web. */
@Composable
private fun G67Switches(title: String, sws: List<G67Sw>, admin: Boolean, msg: String, note: String? = null, onUser: (G67Sw) -> Unit, onServer: (G67Sw) -> Unit) {
    if (sws.isEmpty()) return
    G67Lab("$title · for meg")
    PCard {
        sws.forEachIndexed { i, sw ->
            PToggle(sw.label, if (!sw.srv) "Slått av for alle av administrator" else sw.help + if (sw.own != null) " · Ditt eget valg" else "", sw.on, top = i > 0) { if (sw.srv) onUser(sw) }
        }
    }
    if (msg.isNotBlank()) G67Note(msg)
    note?.let { G67Note(it) }
    if (!admin) return
    G67Lab("$title · for alle (admin)")
    PCard { sws.forEachIndexed { i, sw -> PToggle(sw.label, sw.help, sw.srv, top = i > 0) { onServer(sw) } } }
    G67Note("Av her slår funksjonen av for alle brukere. Hver bruker kan i tillegg slå av for seg selv over.")
}

@Composable
private fun G67Loading(missing: Boolean, loaded: Boolean, err: String, what: String): Boolean {
    if (missing) { PCard { G67Txt("Serveren har ikke $what ennå. Oppdater serveren.") }; return true }
    if (!loaded) { PCard { G67Txt("Laster …") }; return true }
    if (err.isNotBlank()) PCard { G67Txt(err, bad = true) }
    return false
}

/* ---------------- Glimt (hovedsiden) ---------------- */

/** Innstillinger → Glimt: figur, brief, stemme og venner, «Send til Chat etter», og undersidene. */
@Composable
internal fun Glimt67Page(vm: AppViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        G67Lab("Glimt", top = false)
        PCard { GlimtSettingsRow35(vm) }
        G67Note("Personlighet, figur, briefer, stemme og opplesning.")
        GlimtSearchSettings32b(vm) // «Send til Chat etter» og søkehistorikk (flyttet fra AI og tolkning)
        G67Lab("Hva Glimt vet")
        PCard {
            SetRow(vm, 0, Icons.Filled.Psychology, "Glimt husker", "Det du har lært Glimt, forslag og motstrid") { vm.settingsPage = "g67mem" }
            SetRow(vm, 1, Icons.Filled.People, "Entitetsregister", "Personer, steder, butikker og abonnementer med aliaser", top = true) { vm.settingsPage = "g67ent" }
            SetRow(vm, 2, Icons.Filled.School, "Glimt lærer", "Oppskrifter fra vellykkede kjøringer og rettelser", top = true) { vm.settingsPage = "g67rec" }
        }
        G67Lab("Oppgaver og kvalitet")
        PCard {
            SetRow(vm, 3, Icons.Filled.Schedule, "Faste oppgaver", "Planlagte oppgaver og varsler du har bedt Glimt om") { vm.settingsPage = "g67sch" }
            SetRow(vm, 4, Icons.Filled.Insights, "Kvalitet", if (vm.userIsAdmin) "Ukerapport og nattlige eval-kjøringer" else "Ukerapporten din", top = true) { vm.settingsPage = "g67q" }
        }
    }
}

/* ---------------- Glimt husker: Forslag, Motstrid, Ikke brukt på lenge ---------------- */

@Composable
internal fun G67MemPage(vm: AppViewModel) {
    val s = vm.g67.mem
    LaunchedEffect(vm.account?.id) { vm.loadMem67() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Memory33Settings(vm) // listen fra prompt 33 (flyttet fra AI og tolkning)
        if (s.missing) return@Column
        val cnt = memCounts67(s.pend.size, s.conf.size, s.stale.size)
        G67Lab("Glimt rydder minnet")
        PCard {
            Row(Modifier.fillMaxWidth().padding(end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { G67Txt(if (cnt.isBlank()) "Glimt rydder minnet" else cnt, if (!s.loaded) s.err.ifBlank { "Laster forslag …" } else "${s.next} · ${s.lastRun}") }
                G67Btn(if (s.busy["run"] == true) "Kjører …" else "Kjør nå", enabled = s.busy["run"] != true && s.on("nightly")) { vm.runMem67() }
            }
        }
        if (s.msg.isNotBlank()) G67Note(s.msg)
        if (!s.loaded) return@Column
        G67Lab("Forslag" + if (s.pend.isNotEmpty()) " · ${s.pend.size}" else "")
        PCard {
            if (s.pend.isEmpty()) G67Txt(if (s.on("nightly")) "Ingen nye forslag" else "Nattlig oppsummering er av",
                if (s.on("nightly")) "Glimt foreslår nye fakta hver natt fra samtalene, rettelser og nye kalenderhendelser – ingenting lagres før du godkjenner." else "Slå den på under valgene nederst.")
            s.pend.forEachIndexed { i, p -> if (i > 0) G67Rule(); G67PendRow(vm, p) }
        }
        if (s.on("conflicts") || s.conf.isNotEmpty()) {
            G67Lab("Motstrid" + if (s.conf.isNotEmpty()) " · ${s.conf.size}" else "")
            PCard {
                if (s.conf.isEmpty()) G67Txt("Ingenting motsier hverandre.")
                s.conf.forEachIndexed { i, c -> if (i > 0) G67Rule(); G67ConfRow(vm, c) }
            }
        }
        if (s.on("stale")) {
            G67Lab("Ikke brukt på lenge" + if (s.stale.isNotEmpty()) " · ${s.stale.size}" else "")
            PCard {
                if (s.stale.isEmpty()) G67Txt("Alt Glimt husker er brukt de siste ${s.staleDays} dagene.")
                s.stale.forEachIndexed { i, it ->
                    if (i > 0) G67Rule()
                    G67Txt(it.title, it.line)
                    val busy = s.busy["s${it.id}"] == true
                    G67Acts {
                        G67Btn("Behold", "pri", !busy) { vm.keepStale67(it) }
                        G67Btn(if (s.arm == it.id) "Trykk igjen for å slette" else "Slett", "bad", !busy) { vm.deleteStale67(it) }
                    }
                }
            }
            G67Note("Merket etter ${days67(s.staleDays)} uten bruk. Slettes aldri automatisk – trykk Behold for å fjerne merket.")
        }
        G67MemSettings(vm)
    }
}

@Composable
private fun G67PendRow(vm: AppViewModel, p: G67Pend) {
    val s = vm.g67.mem
    val pal = PaperPal.current
    val busy = s.busy[p.id] == true
    var why by remember(p.id) { mutableStateOf(false) }
    G67Txt(p.sentence, p.sub)
    if (p.aliases.isNotEmpty()) Text("Aliaser: " + p.aliases.joinToString(", "), color = pal.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 14.dp))
    if (p.conflictId != null) Text("Motsier noe Glimt allerede vet – velg under Motstrid først.", color = pal.lab, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 2.dp))
    if (p.evidence.isNotEmpty()) {
        Text((if (why) "▾ " else "▸ ") + "Hvorfor Glimt tror det", color = pal.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.heightIn(min = 40.dp).clickable { why = !why }.padding(horizontal = 14.dp, vertical = 10.dp))
        if (why) p.evidence.forEach { Text(it, color = pal.mut, fontSize = 12.5.sp, modifier = Modifier.padding(start = 24.dp, end = 14.dp, bottom = 2.dp)) }
    }
    if (s.edit == p.id) { G67PendEdit(vm, p); return }
    G67Acts {
        G67Btn("Godkjenn", "pri", !busy && p.conflictId == null) { vm.approvePend67(p) }
        G67Btn("Rediger", enabled = !busy) { s.edit = p.id; s.emsg = "" }
        G67Btn("Avvis", enabled = !busy) { vm.rejectPend67(p) }
    }
}

@Composable
private fun G67PendEdit(vm: AppViewModel, p: G67Pend) {
    val s = vm.g67.mem
    var subj by remember(p.id) { mutableStateOf(p.subject) }
    var obj by remember(p.id) { mutableStateOf(p.obj) }
    var al by remember(p.id) { mutableStateOf(p.aliases.joinToString(", ")) }
    val busy = s.busy[p.id] == true
    G67Input("Navn", subj) { subj = it }
    G67Input(if (p.alias) "Er (type)" else "Er", obj) { obj = it }
    G67Input("Aliaser", al, "søster, Kari B (skill med komma)") { al = it }
    if (s.emsg.isNotBlank()) G67Note(s.emsg)
    G67Acts {
        G67Btn("Avbryt") { s.edit = null; s.emsg = "" }
        G67Btn("Lagre forslaget", enabled = !busy) { vm.editPend67(p, subj, obj, al, approve = false) }
        G67Btn("Lagre og godkjenn", "pri", !busy && p.conflictId == null) { vm.editPend67(p, subj, obj, al, approve = true) }
    }
}

@Composable
private fun G67ConfRow(vm: AppViewModel, c: G67Conf) {
    val pal = PaperPal.current
    val busy = vm.g67.mem.busy[c.id] == true
    G67Txt(c.question)
    listOf("A" to c.a, "B" to c.b).forEach { (k, x) ->
        if (x != null) Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(24.dp).clip(CircleShape).background(pal.surf2), contentAlignment = Alignment.Center) { Text(k, color = pal.ink, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
            Column(Modifier.weight(1f)) {
                Text(x.label, color = pal.ink, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                x.src?.let { Text(it, color = pal.mut, fontSize = 12.sp) }
            }
        }
    }
    G67Acts { c.choices.forEach { (id, label) -> G67Btn(label, if (id == "both") "" else "pri", !busy) { vm.resolveConf67(c, id) } } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun G67MemSettings(vm: AppViewModel) {
    val s = vm.g67.mem
    G67Switches("Minnet holder seg ryddig", s.sws, s.swAdmin, s.swMsg, "Nattjobben står også i Faste oppgaver som systemoppgave, der du kan sette den på pause.",
        { vm.setMemSw67(it, false) }, { vm.setMemSw67(it, true) })
    if (s.sws.isEmpty()) return
    G67Lab("Ikke brukt på lenge etter")
    PCard {
        G67Txt(days67(s.staleDays), "Når et faktum får merket. Det slettes aldri automatisk.")
        FlowRow(Modifier.fillMaxWidth().padding(14.dp, 0.dp, 14.dp, 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            MEM67_DAYS.forEach { n -> PChip("$n d", n == s.staleDays) { if (s.on("stale")) vm.setStaleDays67(n) } }
        }
    }
}

/* ---------------- Entitetsregister ---------------- */

@Composable
internal fun G67EntPage(vm: AppViewModel) {
    val s = vm.g67.ent
    LaunchedEffect(vm.account?.id) { vm.loadEnt67() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (G67Loading(s.missing, s.loaded, s.err, "entitetsregisteret")) return@Column
        G67Chips(listOf(Triple("", "Alle", s.items.size)) + ENT67_TYPES.map { t -> Triple(t, s.labels[t] ?: t, s.items.count { it.type == t }) }, s.filter) { s.filter = it }
        if (!s.enabled) PCard { G67Txt("Glimt bruker ikke registeret nå", "Slått av i AI → Oppgaver → Forstår samtaler. Lista kan fortsatt redigeres.") }
        if (s.msg.isNotBlank() && s.edit == null && !s.add) G67Note(s.msg)
        val shown = s.items.filter { s.filter.isEmpty() || it.type == s.filter }
        PCard {
            if (shown.isEmpty()) G67Txt(if (s.filter.isNotEmpty()) "Ingen ${(s.labels[s.filter] ?: "").lowercase()} ennå." else "Registeret er tomt",
                if (s.filter.isEmpty()) "Legg til personer og steder, eller skriv «husk at Nina er frisøren min» til Glimt." else null)
            shown.forEachIndexed { i, it -> if (i > 0) G67Rule(); if (s.edit == it.id) G67EntForm(vm, it) else G67EntRow(vm, it) }
        }
        PCard {
            if (s.add) G67EntForm(vm, null) else Row(Modifier.fillMaxWidth().padding(end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { G67Txt("Legg til", "Person, sted, butikk, abonnement eller fast hendelse – med egne ord for det") }
                G67Btn("Legg til", "pri") { s.add = true; s.edit = null; s.msg = "" }
            }
        }
        G67Resolve(vm)
    }
}

@Composable
private fun G67EntRow(vm: AppViewModel, it: G67Ent) {
    val s = vm.g67.ent
    val pal = PaperPal.current
    Row(Modifier.fillMaxWidth().padding(end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            G67Txt(it.name, listOfNotNull(ENT67_ONE[it.type] ?: it.type, it.value, it.sourceLabel).joinToString(" · "))
            val chips = it.aliases + it.builtin.map { b -> "$b (fast ord)" }
            if (chips.isNotEmpty()) Text(chips.joinToString(" · "), color = pal.mut, fontSize = 12.5.sp, modifier = Modifier.padding(start = 14.dp, end = 4.dp, bottom = 10.dp))
        }
        G67Btn("Rediger") { s.edit = it.id; s.add = false; s.arm = null; s.msg = "" }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun G67EntForm(vm: AppViewModel, it: G67Ent?) {
    val s = vm.g67.ent
    var type by remember(it?.id) { mutableStateOf(it?.type ?: s.filter.ifBlank { "person" }) }
    var name by remember(it?.id) { mutableStateOf(it?.name ?: "") }
    var value by remember(it?.id) { mutableStateOf(it?.value ?: "") }
    var al by remember(it?.id) { mutableStateOf(it?.aliases?.joinToString(", ") ?: "") }
    if (it?.derived == true) G67Txt(it.name, "Navn og sted redigeres i ${it.where}. Her legger du til egne ord for det.")
    else {
        PLabel("Type", PaperPal.current.mut, 10.sp, Modifier.padding(start = 14.dp, top = 10.dp))
        FlowRow(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ENT67_TYPES.forEach { t -> PChip(ENT67_ONE[t] ?: t, type == t) { type = t } }
        }
        G67Input("Navn", name, "Nina, Hytta, Rema Lena …") { name = it }
        G67Input("Betyr", value, "frisør · Lena, Østre Toten (valgfritt)") { value = it }
    }
    G67Input("Aliaser", al, "hytta, landstedet (skill med komma)") { al = it }
    if (s.msg.isNotBlank()) G67Note(s.msg)
    G67Acts {
        if (it != null && it.canDelete && (!it.derived || it.aliases.isNotEmpty()))
            G67Btn(if (s.arm == it.id) "Trykk igjen for å bekrefte" else if (it.derived) "Fjern egne aliaser" else "Slett", "bad") { vm.deleteEnt67(it) }
        G67Btn("Avbryt") { s.edit = null; s.add = false; s.arm = null; s.msg = "" }
        G67Btn("Lagre", "pri", !s.busy) { vm.saveEnt67(it, type, name, value, al) }
    }
}

@Composable
private fun G67Resolve(vm: AppViewModel) {
    val s = vm.g67.ent
    var q by remember { mutableStateOf("") }
    G67Lab("Hva betyr …?")
    PCard {
        G67Txt("Hva betyr …?", s.res ?: "Skriv et ord («hytta», «jobben», «Nina») og se hva Glimt tror det betyr.")
        G67Input("Ord", q, "hytta") { q = it }
        G67Acts { G67Btn("Slå opp", "pri", q.isNotBlank()) { vm.resolveEnt67(q) } }
    }
}

/* ---------------- Glimt lærer ---------------- */

@Composable
internal fun G67RecPage(vm: AppViewModel) {
    val s = vm.g67.rec
    LaunchedEffect(vm.account?.id) { vm.loadRec67() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (G67Loading(s.missing, s.loaded, s.err, "«Glimt lærer»")) return@Column
        if (s.stats.isNotEmpty()) G67Stats(s.stats)
        val c = s.counts
        G67Chips(listOf(Triple("", "Alle", c["total"] ?: s.items.size)) + listOf("active", "candidate", "disabled").map { k -> Triple(k, REC67_STATUS[k] ?: k, c[k] ?: s.items.count { it.status == k }) }, s.filter) { s.filter = it }
        PCard { G67Input("Søk i oppskriftene", s.q, "Søk i oppskriftene") { s.q = it.take(80) } }
        if (!s.enabled) PCard { G67Txt("Glimt lærer ikke nå", "Slått av under valgene nederst. Lagrede oppskrifter står.") }
        if (s.msg.isNotBlank() && s.edit == null) G67Note(s.msg)
        val q = s.q.trim().lowercase()
        val shown = s.items.filter { (s.filter.isEmpty() || it.status == s.filter) && (q.isEmpty() || "${it.example} ${it.template}".lowercase().contains(q)) }
        PCard {
            if (shown.isEmpty()) G67Txt(if (s.items.isNotEmpty()) "Ingen oppskrifter passer." else "Glimt har ikke lært noe ennå",
                if (s.items.isEmpty()) "Når Glimt løser noe riktig (og du ikke retter det), lagres oppskriften her." else null)
            shown.forEachIndexed { i, it -> if (i > 0) G67Rule(); G67RecRow(vm, it) }
        }
        G67Switches("Glimt lærer", s.sws, s.swAdmin, s.swMsg, null, { vm.setRecSw67(it, false) }, { vm.setRecSw67(it, true) })
    }
}

@Composable
private fun G67Stats(stats: List<Pair<String, String>>) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        stats.chunked(3).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { (v, l) ->
                    Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(p.card).padding(10.dp, 8.dp)) {
                        Text(v, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 1)
                        Text(l, color = p.mut, fontSize = 11.5.sp, maxLines = 1)
                    }
                }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun G67RecRow(vm: AppViewModel, it: G67Recipe) {
    val s = vm.g67.rec
    val p = PaperPal.current
    val open = s.open == it.id
    Row(Modifier.fillMaxWidth().clickable(onClickLabel = if (open) "Lukk" else "Vis detaljer") { vm.toggleRec67(it.id) }.padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(it.template.ifBlank { it.example }, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                G67Pill(REC67_STATUS[it.status] ?: it.status, g67Color(it.status))
                Text(it.stat, color = p.mut, fontSize = 12.sp, maxLines = 2)
            }
        }
        Text(if (open) "▾" else "▸", color = p.mut)
    }
    if (open) { if (s.edit == it.id) G67RecEdit(vm, it) else G67RecDetail(vm, it) }
}

@Composable
private fun G67Kv(k: String, v: String) {
    if (v.isBlank()) return
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 3.dp)) {
        Text(k, color = p.mut, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
        Text(v, color = p.ink, fontSize = 13.5.sp, lineHeight = 18.sp)
    }
}

@Composable
private fun G67RecDetail(vm: AppViewModel, it: G67Recipe) {
    val s = vm.g67.rec
    val p = PaperPal.current
    val d = s.det[it.id]
    var text by remember(it.id) { mutableStateOf("") }
    G67Kv("Eksempel", "«${it.example}»")
    G67Kv("Mal", it.template)
    G67Kv("Plan", it.steps.mapIndexed { i, x -> "${i + 1}. $x" }.joinToString("\n").ifBlank { "–" })
    G67Kv("Variabler", it.slots.joinToString(" · "))
    G67Kv("Om", it.about)
    G67Kv("Hurtigvei", it.fastLine)
    when {
        d == null -> G67Note("Henter kjøringene …")
        d.err != null -> G67Note(d.err)
        else -> {
            if (d.runs.isNotEmpty()) G67Kv("Siste kjøringer (${d.runs.size})", d.runs.take(8).joinToString("\n") { r -> "${r.at} «${r.text}» · ${r.line}" })
            if (d.negs.isNotEmpty()) G67Kv("Negative eksempler (${d.negs.size})", d.negs.joinToString("\n") { n -> "«${n.query}» · Feil: ${n.wrong}" + if (n.right.isNotBlank()) " · Riktig: ${n.right}" else "" })
        }
    }
    G67Input("Test med tekst", text, it.example) { text = it }
    val t = s.test[it.id]
    G67Acts { G67Btn(if (t?.busy == true) "Tester …" else "Test", enabled = t?.busy != true) { vm.testRec67(it.id, text) } }
    if (t != null && !t.busy) Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp).clip(RoundedCornerShape(12.dp)).background(p.surf2).padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        if (t.err != null) Text(t.err, color = p.lab, fontSize = 13.sp) else {
            Text(t.head, color = if (t.ok) p.pos else p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
            t.lines.forEach { l -> Text(l, color = p.ink, fontSize = 12.5.sp) }
            t.steps.forEach { (l, ok) -> Text("• $l", color = if (ok) p.ink else p.lab, fontSize = 12.5.sp) }
        }
    }
    G67Acts {
        if (it.status == "disabled") G67Btn("Slå på", enabled = !s.busy) { vm.setRecStatus67(it.id, "active") } else G67Btn("Slå av", enabled = !s.busy) { vm.setRecStatus67(it.id, "disabled") }
        G67Btn("Rediger mal") { s.edit = it.id; s.arm = null; s.msg = "" }
        G67Btn(if (s.arm == it.id) "Trykk igjen for å slette" else "Slett", "bad") { vm.deleteRec67(it.id) }
    }
}

@Composable
private fun G67RecEdit(vm: AppViewModel, it: G67Recipe) {
    val s = vm.g67.rec
    var tpl by remember(it.id) { mutableStateOf(it.template) }
    var plan by remember(it.id) { mutableStateOf(it.planJson) }
    var fw by remember(it.id) { mutableStateOf(it.allowFastWrite) }
    G67Input("Mal", tpl) { tpl = it }
    G67Input("Plan (JSON)", plan, lines = 6, mono = true) { plan = it }
    G67Note("Variabler: " + REC67_VARS.joinToString(" ") { "{$it}" })
    if (it.writes) PToggle("Hurtigvei også for endringer", "Planen endrer data. Uten dette spør Glimt alltid først.", fw) { fw = it }
    if (s.msg.isNotBlank()) G67Note(s.msg)
    G67Acts {
        G67Btn("Avbryt") { s.edit = null; s.msg = "" }
        G67Btn("Lagre", "pri", !s.busy) { vm.saveRec67(it, tpl, plan, fw) }
    }
}

/* ---------------- Faste oppgaver ---------------- */

@Composable
internal fun G67SchPage(vm: AppViewModel) {
    val s = vm.g67.sch
    LaunchedEffect(vm.account?.id) { vm.loadSch67() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (G67Loading(s.missing, s.loaded, s.err, "faste oppgaver")) return@Column
        G67SchNew(vm)
        G67Lab("Oppgaver")
        if (!s.enabled) PCard { G67Txt("Planlagte oppgaver er slått av", "Ingenting kjøres nå. Oppgavene står, og du kan slå det på igjen under Valg nederst.") }
        val c = s.counts
        G67Chips(listOf(Triple("", "Alle", c["total"] ?: s.items.size), Triple("active", "Aktive", c["active"]), Triple("paused", "Pauset", c["paused"]), Triple("ended", "Ferdige", c["ended"])), s.filter) { s.filter = it }
        if (s.msg.isNotBlank()) G67Note(s.msg)
        val shown = s.items.filter { s.filter.isEmpty() || it.status == s.filter }
        PCard {
            if (shown.isEmpty()) G67Txt(if (s.items.isNotEmpty()) "Ingen oppgaver her." else "Ingen faste oppgaver ennå",
                if (s.items.isEmpty()) "Trykk «Lag fra tekst» over, eller si det til Glimt i Chat eller søkefeltet, f.eks. «Send meg strømprisene hver morgen kl. 7», «Minn meg på å betale husleia den 1. hver måned» eller «Si fra hvis strømprisen går over 2 kr i morgen»." else null)
            shown.forEachIndexed { i, it -> if (i > 0) G67Rule(); G67SchRow(vm, it) }
        }
        G67Note("Lag, flytt og stopp oppgaver ved å si det til Glimt («Hvilke faste oppgaver har jeg?», «Stopp strømprisvarselet»). Hver kjøring logges her med resultat og levering.")
        if (s.briefs.isNotEmpty()) {
            G67Lab("Briefer")
            PCard { s.briefs.forEachIndexed { i, b -> if (i > 0) G67Rule(); G67BriefRow(vm, b) } }
            G67Note("Briefene er de samme som under Innstillinger → Glimt. «Flytt morgenbriefen til 06:30» til Glimt endrer klokkeslettet her.")
        }
        G67SchSettings(vm)
    }
}

/** «Lag fra tekst»: Hva + Når (+ Bare hvis) → Forhåndsvis (POST /parse) → Lagre (POST /). */
@Composable
private fun G67SchNew(vm: AppViewModel) {
    val s = vm.g67.sch
    val p = PaperPal.current
    PCard {
        if (!s.newOpen) {
            Row(Modifier.fillMaxWidth().padding(end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { G67Txt("Lag fra tekst", "Skriv hva og når – Glimt tolker det og viser de neste kjøringene før du lagrer") }
                G67Btn("Lag fra tekst", "pri", s.enabled) { s.newOpen = true; s.newPrev = null }
            }
            return@PCard
        }
        G67Txt("Ny fast oppgave")
        G67Input("Hva", s.newWhat, "send meg strømprisene for i dag") { s.newWhat = it; s.newPrev = null }
        G67Input("Når", s.newWhen, "hver hverdag kl. 7") { s.newWhen = it; s.newPrev = null }
        G67Input("Bare hvis (valgfritt)", s.newCond, "strømprisen går over 2 kr") { s.newCond = it; s.newPrev = null }
        G67Note("Skriv som du ville sagt det: «hver morgen kl. 7», «den 1. hver måned», «annenhver tirsdag kl 18», «hver fredag kl. 15 i vinter».")
        s.newPrev?.let { pr -> G67PrevBox(pr) }
        G67Acts {
            G67Btn("Avbryt") { s.newOpen = false; s.newPrev = null }
            G67Btn("Forhåndsvis", enabled = s.newPrev?.busy != true) { vm.previewNew67() }
            G67Btn(if (s.newBusy) "Lagrer …" else "Lagre", "pri", !s.newBusy && s.newPrev?.let { !it.busy && it.err == null && it.summary.isNotBlank() } == true) { vm.createNew67() }
        }
        if (s.newPrev == null) Text("Forhåndsvis først, så ser du hva som lagres.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(start = 14.dp, bottom = 10.dp))
    }
}

@Composable
private fun G67PrevBox(pr: G67Prev) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp).clip(RoundedCornerShape(12.dp)).background(p.surf2).padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        when {
            pr.busy -> Text("Tolker …", color = p.mut, fontSize = 13.sp)
            pr.err != null -> Text(pr.err, color = p.lab, fontSize = 13.sp)
            else -> { Text(pr.summary, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp); pr.lines.forEach { Text(it, color = p.ink, fontSize = 12.5.sp) } }
        }
    }
}

@Composable
private fun G67SchRow(vm: AppViewModel, it: G67Sched) {
    val s = vm.g67.sch
    val p = PaperPal.current
    val open = s.open == it.id
    val next = when { it.status == "active" && it.nextRunAt != null -> "Neste ${when67(it.nextRunAt)}"; it.status == "paused" -> "På pause"; else -> "Ingen flere kjøringer" }
    Row(Modifier.fillMaxWidth().clickable(onClickLabel = if (open) "Lukk" else "Vis detaljer") { vm.toggleSch67(it.id) }.padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(it.title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                G67Pill(SCH67_STATUS[it.status] ?: it.status, g67Color(it.status))
                if (it.system) G67Pill("System", p.mut)
                Text(listOf(it.whenLabel, next).filter { x -> x.isNotBlank() }.joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 2)
            }
            Text(it.lastRun, color = p.mut, fontSize = 12.sp, maxLines = 1)
        }
        Text(if (open) "▾" else "▸", color = p.mut)
    }
    if (open) G67SchDetail(vm, it)
}

@Composable
private fun G67SchDetail(vm: AppViewModel, it: G67Sched) {
    val s = vm.g67.sch
    val busy = s.busy[it.id]
    val off = !s.enabled
    G67Kv("Hva", it.what)
    G67Kv("Type", SCH67_KIND[it.kind] ?: it.kind)
    G67Kv("Når", it.whenLabel)
    it.cond?.let { c -> G67Kv("Bare hvis", c + (it.condExpr?.let { e -> "\nSjekkes i koden: $e" } ?: "")) }
    if (it.power && it.zone != null) G67Kv("Prisområde", it.zone + (SCH67_ZONES.firstOrNull { z -> z.first == it.zone }?.let { z -> " (${z.second})" } ?: ""))
    if (it.next.isNotEmpty()) G67Kv("Neste", it.next.joinToString(" · "))
    G67Kv("Levering", if (it.channel != "push") it.channel else "Push i appen")
    if (it.private) G67Kv("Personvern", "Push-varselet er generelt – detaljene står bare i appen")
    if (!it.explicitTime) G67Kv("Stille timer", "Flyttes til 07:00 hvis den havner mellom 23 og 07")
    if (s.edit == it.id) G67SchEdit(vm, it) else G67Acts {
        G67Btn(if (busy == "run") "Kjører …" else "Kjør nå", "pri", busy == null && !off) { vm.runNowSch67(it.id) }
        if (it.status == "active") G67Btn("Pause", enabled = busy == null && !off) { vm.pauseSch67(it, true) }
        else if (it.status == "paused") G67Btn("Fortsett", enabled = busy == null && !off) { vm.pauseSch67(it, false) }
        if (!it.system) G67Btn("Endre tidspunkt", enabled = !off) { s.edit = it.id; s.prev = null }
        if (!it.system) G67Btn(if (s.arm == it.id) "Trykk igjen for å slette" else "Slett", "bad", busy == null) { vm.deleteSch67(it.id) }
    }
    if (it.system) G67Note(when (it.kind) {
        "quality" -> "Systemoppgave: nattlig eval av Glimt (se Kvalitet). Kan settes på pause, ikke slettes."
        "weekly" -> "Systemoppgave: ukerapporten (se Kvalitet). Kan settes på pause, ikke slettes."
        else -> "Systemoppgave: Glimt går gjennom dagens samtaler og foreslår nye fakta til «Glimt husker». Ingenting lagres før du godkjenner. Kan settes på pause, ikke slettes."
    })
    s.rmsg[it.id]?.let { (m, bad) -> Text(m, color = if (bad) PaperPal.current.lab else PaperPal.current.pos, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)) }
    PLabel("Siste kjøringer", PaperPal.current.mut, 10.sp, Modifier.padding(start = 14.dp, top = 8.dp))
    val runs = s.runs[it.id]
    when {
        s.runsErr[it.id] != null -> G67Note(s.runsErr[it.id] ?: "")
        runs == null -> G67Note("Laster kjøringer …")
        runs.isEmpty() -> G67Note("Ingen kjøringer ennå.")
        else -> runs.take(10).forEach { r -> G67RunRow(r) }
    }
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun G67RunRow(r: G67SRun) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp)) {
        Text(r.head + if (r.meta.isNotBlank()) " · ${r.meta}" else "", color = if (r.bad) p.lab else p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
        r.result?.let { Text(it, color = p.ink, fontSize = 12.5.sp, maxLines = 4) }
        r.reason?.let { Text(it, color = p.mut, fontSize = 12.sp) }
        r.error?.let { Text(it, color = p.lab, fontSize = 12.sp) }
    }
}

@Composable
private fun G67SchEdit(vm: AppViewModel, it: G67Sched) {
    val s = vm.g67.sch
    var w by remember(it.id) { mutableStateOf(it.whenText) }
    G67Input("Når", w, "hver hverdag kl. 7") { w = it; s.prev = null }
    G67Note("Skriv som du ville sagt det: «hver morgen kl. 7», «den 1. hver måned», «annenhver tirsdag kl 18», «hver fredag kl. 15 i vinter».")
    s.prev?.let { G67PrevBox(it) }
    G67Acts {
        G67Btn("Forhåndsvis") { vm.previewWhen67(it, w) }
        G67Btn("Avbryt") { s.edit = null; s.prev = null }
        G67Btn("Lagre", "pri", s.busy[it.id] == null) { vm.saveWhen67(it, w) }
    }
}

@Composable
private fun G67BriefRow(vm: AppViewModel, b: G67Brief) {
    val s = vm.g67.sch
    var at by remember(b.id, b.at) { mutableStateOf(b.at) }
    val busy = s.busy[b.id] != null
    if (b.canOn) PToggle(b.title, b.line, b.on) { if (!busy) vm.saveBrief67(b, null, it) } else G67Txt(b.title, b.line)
    if (b.canAt) Row(Modifier.fillMaxWidth().padding(end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) { G67Input("Klokkeslett", at, "06:45") { at = it.take(5) } }
        G67Btn("Lagre", enabled = !busy && at != b.at) { vm.saveBrief67(b, at, null) }
    }
    s.rmsg[b.id]?.let { (m, bad) -> Text(m, color = if (bad) PaperPal.current.lab else PaperPal.current.pos, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun G67SchSettings(vm: AppViewModel) {
    val s = vm.g67.sch
    G67Switches("Faste oppgaver", s.sws, s.swAdmin, s.swMsg, null, { vm.setSchSw67(it, false) }, { vm.setSchSw67(it, true) })
    if (s.sws.isEmpty()) return
    G67Lab("Prisområde for strøm")
    PCard {
        G67Txt(s.zone + (SCH67_ZONES.firstOrNull { it.first == s.zone }?.let { " (${it.second})" } ?: ""), "Standard for strømpriser og strømvarsler")
        FlowRow(Modifier.fillMaxWidth().padding(14.dp, 0.dp, 14.dp, 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SCH67_ZONES.forEach { (z, n) -> PChip("$z $n", z == s.zone) { vm.setSchZone67(z) } }
        }
    }
}

/* ---------------- Kvalitet ---------------- */

@Composable
internal fun G67QPage(vm: AppViewModel) {
    val s = vm.g67.q
    LaunchedEffect(vm.account?.id) { vm.loadQ67() }
    // Mens evalen kjører: hent kjøringene på nytt hvert 5. sekund (bare admin, bare mens siden vises).
    LaunchedEffect(s.running?.id, s.admin) {
        while (s.admin && s.running != null) { delay(5_000); vm.loadQRuns67() }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (G67Loading(s.missing, s.loaded, s.err, "kvalitetsrapporter")) return@Column
        G67WeekCard(vm)
        val admin = s.admin && vm.userIsAdmin
        if (admin) G67Eval(vm)
        if (admin) G67QCfg68(vm) // prompt 68: bryteren for nattlig eval (for alle) ligger nå bare her
        G67Lab("Valg")
        PCard {
            s.weekly?.let { w -> PToggle(w.label, if (!w.srv) "Slått av for alle av administrator" else w.help, w.on) { if (w.srv) vm.setQSw67(w, false) } }
        }
        if (s.swMsg.isNotBlank()) G67Note(s.swMsg)
    }
}

/* ---------------- Prompt 68: Innstillinger for nattlig eval (admin) ---------------- */

private class QField68(val key: String, val title: String, val sub: String, val unit: String)

private val QFIELDS68 = listOf(
    QField68("runs", "Kjøringer per case", "Hver test kjøres så mange ganger – suksessraten rapporteres · 1–5", "×"),
    QField68("maxMinutes", "Tidsgrense", "Evalen stopper etter så mange minutter · 15–360", "min"),
    QField68("interactiveWaitSec", "Gi plass etter", "Evalen viker hvis en vanlig forespørsel har ventet så mange sekunder · 5–120", "s"),
    QField68("keepDays", "Lagre rapporter", "Eldre rapporter slettes fra serveren etter så mange dager · 7–180", "d"),
)

private fun qBool68(m: Map<String, Any>, k: String): Boolean = m[k] as? Boolean ?: true
private fun qInt68(m: Map<String, Any>, k: String): Int? = m[k] as? Int

@Composable
private fun G67QCfg68(vm: AppViewModel) {
    val s = vm.g67.q
    val d = s.draft
    val changed = qChanged68(s.cfg, d)
    G67Lab("Innstillinger for nattlig eval")
    PCard {
        PToggle("Nattlig eval", s.nightly?.help ?: "Kl. 02 hver natt kjøres eval-testene mot den lokale modellen.", qBool68(d, "nightly")) { vm.setQDraft68("nightly", it) }
        PToggle("Ukerapport for alle", "Av her slår ukerapporten av for alle brukere", qBool68(d, "weekly"), top = true) { vm.setQDraft68("weekly", it) }
        QFIELDS68.forEach { f -> G67Rule(); QStepper68(vm, f, qInt68(d, f.key)) }
        G67Rule()
        Row(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val what = if (changed.isEmpty()) "Ingen endringer" else "${changed.size} ${if (changed.size == 1) "endring" else "endringer"}"
            Text(what, color = PaperPal.current.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
            if (changed.isNotEmpty()) G67Btn("Angre", enabled = !s.cfgBusy) { s.draft = s.cfg; s.cfgMsg = "" }
            G67Btn(if (s.cfgBusy) "Lagrer …" else "Lagre", "pri", changed.isNotEmpty() && !s.cfgBusy) { vm.saveQCfg68() }
        }
    }
    if (s.cfgMsg.isNotBlank()) Text(s.cfgMsg, color = if (s.cfgErr) PaperPal.current.lab else PaperPal.current.mut, fontSize = 12.5.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 8.dp))
    G67Note("«Nattlig eval» står også i Faste oppgaver som systemoppgave, der den kan settes på pause. Bare for administrator.")
}

/** − verdi + og et tallfelt. Verdien klemmes til grensene (QCFG68_LIM). */
@Composable
private fun QStepper68(vm: AppViewModel, f: QField68, cur: Int?) {
    val p = PaperPal.current
    val lim = QCFG68_LIM.getValue(f.key)
    val step = QCFG68_STEP[f.key] ?: 1
    var txt by remember(f.key) { mutableStateOf(cur?.toString() ?: "") }
    // Stepper, Angre eller ny verdi fra serveren: vis den (men ikke mens man skriver et tall som klemmes til samme verdi).
    LaunchedEffect(cur) { if (txt.toIntOrNull()?.let { qClamp68(f.key, it) } != cur) txt = cur?.toString() ?: "" }
    Column(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(f.title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
        Text(f.sub, color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val v = cur ?: lim.first
            G67Btn("−", enabled = cur != null && v > lim.first) { vm.setQDraft68(f.key, v - step) }
            Box(Modifier.width(76.dp).heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(horizontal = 10.dp),
                contentAlignment = Alignment.Center) {
                BasicTextField(
                    txt, { t ->
                        val digits = t.filter { it.isDigit() }.take(3)
                        txt = digits
                        digits.toIntOrNull()?.let { n -> vm.setQDraft68(f.key, n) } // klemmes i setQDraft68
                    },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                    textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center),
                    cursorBrush = SolidColor(p.lab),
                    modifier = Modifier.fillMaxWidth().onFocusChanged { fs ->
                        // Utenfor grensene: klem når feltet mister fokus.
                        if (!fs.isFocused) txt.toIntOrNull()?.let { n -> if (n !in lim) { val c = qClamp68(f.key, n); txt = c.toString(); vm.setQDraft68(f.key, c) } }
                    },
                )
            }
            Text(f.unit, color = p.mut, fontSize = 13.sp)
            G67Btn("+", enabled = cur != null && v < lim.last) { vm.setQDraft68(f.key, v + step) }
        }
        val n = txt.toIntOrNull()
        if (n != null && n !in lim) Text("Må være mellom ${lim.first} og ${lim.last} – settes til ${qClamp68(f.key, n)}", color = p.lab, fontSize = 12.sp)
    }
}

@Composable
private fun G67WeekCard(vm: AppViewModel) {
    val s = vm.g67.q
    val p = PaperPal.current
    G67Lab("Ukerapport")
    val w = s.wk ?: run { PCard { G67Txt(s.wkErr.ifBlank { "Laster …" }) }; return }
    val i = w.weeks.indexOfFirst { it.first == w.week }
    val older = if (i >= 0) w.weeks.getOrNull(i + 1) else null
    val newer = if (i > 0) w.weeks.getOrNull(i - 1) else null
    PCard {
        Row(Modifier.fillMaxWidth().padding(end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { G67Txt(w.label + if (w.partial) " · så langt" else "", w.sent) }
            G67Btn("‹", enabled = older != null) { older?.let { vm.loadWeek67(it.first) } }
            Spacer(Modifier.width(6.dp))
            G67Btn("›", enabled = newer != null) { newer?.let { vm.loadWeek67(it.first) } }
        }
        w.text?.let { Text(it, color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)) }
        Column(Modifier.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            w.tiles.chunked(2).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    row.forEach { (l, v, sub) ->
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(p.surf2).padding(10.dp, 8.dp)) {
                            Text(l, color = p.mut, fontSize = 12.sp, maxLines = 1)
                            Text(v, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 19.sp, maxLines = 1)
                            if (sub.isNotBlank()) Text(sub, color = p.mut, fontSize = 11.5.sp, maxLines = 1)
                        }
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
        if (w.system != null && vm.userIsAdmin) { G67Rule(); G67Txt("Alle brukere (admin)", listOfNotNull(w.system, w.eval).joinToString("\n")) }
    }
    G67Note("Bare dine egne tall. «Løst på første forsøk» betyr at Glimt ikke feilet, ikke måtte spørre, ikke ble rettet og ikke fikk tommel ned.")
}

@Composable
private fun G67Eval(vm: AppViewModel) {
    val s = vm.g67.q
    val p = PaperPal.current
    G67Lab("Nattlig eval")
    PCard {
        Row(Modifier.fillMaxWidth().padding(end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { G67Txt(if (s.evalOn) "Kjører hver natt kl. 02" else "Slått av", "${s.next} · rapportene lagres i ${s.keepDays} dager · push bare når noe grønt blir rødt") }
            G67Btn(if (s.running != null) "Kjører …" else "Kjør nå", "pri", !s.busy && s.running == null) { vm.runQ67() }
        }
        if (s.msg.isNotBlank()) G67Note(s.msg)
        s.running?.let { r ->
            G67Rule()
            G67Txt("Eval kjører · ${r.line}", "${r.sub} · avbrytes av seg selv hvis noen venter på Glimt")
            Box(Modifier.fillMaxWidth().padding(horizontal = 14.dp).height(6.dp).clip(CircleShape).background(p.line)) {
                Box(Modifier.fillMaxWidth(r.progress ?: 0f).fillMaxHeight().background(Color(0xFF3B82C4)))
            }
            G67Acts { G67Btn("Avbryt", "bad", !s.busy) { vm.abortQ67() } }
        }
        when {
            !s.runsLoaded -> { G67Rule(); G67Txt("Laster …") }
            s.runsErr.isNotBlank() -> { G67Rule(); G67Txt(s.runsErr) }
            s.runs.isEmpty() -> { G67Rule(); G67Txt("Ingen kjøringer ennå", "Den første kjøres i natt kl. 02, eller trykk «Kjør nå».") }
            else -> s.runs.forEach { r -> G67Rule(); G67QRunRow(vm, r) }
        }
    }
    G67Note("Eval-testene kjøres mot den lokale modellen med egen testdatabase – aldri dine data. Miljøfeil (modellen svarte ikke, andre modeller lastet) regnes ikke som røde. Bare for administrator.")
}

@Composable
private fun G67QRunRow(vm: AppViewModel, r: G67QRun) {
    val s = vm.g67.q
    val p = PaperPal.current
    val open = s.open == r.id
    Row(Modifier.fillMaxWidth().clickable(onClickLabel = if (open) "Lukk" else "Vis casene") { vm.toggleQRun67(r.id) }.padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                G67Pill(q67Status(r.status), g67Color(if (r.status == "regression") "failed" else r.status))
                Text(r.line, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 2)
            }
            if (r.sub.isNotBlank()) Text(r.sub, color = p.mut, fontSize = 12.sp)
            if (r.extra.isNotBlank()) Text(r.extra, color = p.mut, fontSize = 12.sp)
            r.reason?.let { Text(it, color = p.mut, fontSize = 12.sp) }
        }
        Text(if (open) "▾" else "▸", color = p.mut)
    }
    r.regs.forEach { Text("• $it", color = p.lab, fontSize = 12.5.sp, modifier = Modifier.padding(start = 14.dp, end = 14.dp, bottom = 2.dp)) }
    if (open) G67QDetail(vm, r)
}

@Composable
private fun G67QDetail(vm: AppViewModel, r: G67QRun) {
    val s = vm.g67.q
    val p = PaperPal.current
    val d = s.det[r.id]
    when {
        d == null -> G67Note("Henter casene …")
        d.err != null -> G67Note(d.err)
        else -> {
            val all = s.allCases == r.id
            val shown = if (all) d.cases else d.cases.filter { it.status != "green" || it.reg }
            if (shown.isEmpty()) G67Note("Alle caser er grønne.")
            shown.forEach { c ->
                Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp).clip(RoundedCornerShape(10.dp)).background(if (c.reg) p.lab.copy(alpha = .08f) else p.surf2).padding(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        G67Pill(q67Case(c.status), g67Color(c.status))
                        Text(c.id, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        if (c.reg) G67Pill("ble rød", p.lab)
                    }
                    Text(c.line, color = p.mut, fontSize = 12.sp)
                    c.title?.let { Text(it, color = p.ink, fontSize = 12.5.sp) }
                    c.reason?.let { Text(it, color = p.mut, fontSize = 12.sp) }
                }
            }
            val hidden = d.cases.size - shown.size
            G67Acts {
                if (hidden > 0) G67Btn("Vis alle ${d.cases.size} caser ($hidden grønne til)") { s.allCases = r.id }
                else if (all) G67Btn("Skjul grønne") { s.allCases = null }
                if (r.md) G67Btn(if (s.md.containsKey(r.id)) "Skjul rapporten" else "Åpne rapporten", "pri") { vm.loadQMd67(r.id) }
            }
            if (d.meta.isNotBlank()) G67Note(d.meta)
            s.md[r.id]?.let { md ->
                Text(md, color = p.ink, fontSize = 11.5.sp, fontFamily = PaperFonts.mono, lineHeight = 15.sp,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp).clip(RoundedCornerShape(10.dp)).background(p.surf2).padding(10.dp))
            }
        }
    }
    Spacer(Modifier.height(6.dp))
}
