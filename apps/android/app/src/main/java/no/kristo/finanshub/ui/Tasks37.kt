package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import no.kristo.finanshub.*
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime

/*
 * Prompt 37 (ANDROID37): Gjøremål (tidligere Huskeliste; intern nøkkel «huske»), fasit Huskeliste.dc.html + Mobil Papir App.dc.html.
 *  - Uten fanelinje: «‹ Mer» oppe til venstre, «Ny oppgave …» og den runde ✦-knappen (Glimt) nederst, over tastaturet.
 *    Tomt felt + ✦ åpner Glimt-arket; tekst + ✦ sender teksten til Glimt. Enter legger til en vanlig oppgave.
 *  - Liste-chips med avatarer for delte lister og «+ Ny liste»; trykk på aktiv chip åpner listearket; infokort for valgt liste.
 *  - Detaljarket (alt lagres med en gang): tittel + notater, Dato/Tid/Viktig, Gjenta, Tidlig påminnelse, Påminn på sted,
 *    Liste, Ansvarlig (bare medlemmer), Prioritet, Flagg, Tagger, Deloppgaver (✦ Del opp med Glimt), ✦ Glimt foreslår, Slett.
 *  - Glimt-kort i listen: like oppgaver (Slå sammen) og forfalte (Flytt til i morgen / Arkiver).
 *  - Arkene er ModalBottomSheet fra appens egen view; dokken og ✦ skjules mens et ark er åpent.
 */

private val RED37 = Color(0xFFB23A2A)
private val ORANGE37 = Color(0xFFD9822B)

private fun TaskList.isShared37(): Boolean = shared ?: (members.size > 1)

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TasksScreen37(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p37
    BackHandler {
        when {
            s.detail != null -> s.detail = null
            s.listSheet != null -> s.listSheet = null
            s.glimtOpen -> s.glimtOpen = false
            else -> vm.closeTasksHome40()
        }
    }
    val t = vm.tasks
    val lists = t?.lists?.ifEmpty { null } ?: TASK_LISTS_DEFAULT
    val users = s.users.ifEmpty { t?.members ?: emptyList() }
    val today = LocalDate.now(OSLO37).toString()
    val archIds = vm.p32b.archived?.map { it.id }?.toSet() ?: emptySet()
    val arch = vm.p32b.taskArch
    LaunchedEffect(vm.account?.id) { vm.loadArchived32b(); vm.loadUsers37(); vm.loadTasksHa() }
    LaunchedEffect(vm.taskFilter, t?.items?.size, t?.items?.count { it.done }) { vm.loadCards37(vm.taskFilter) }
    val all = (t?.items ?: emptyList()).filter { it.id !in archIds && (vm.taskFilter == "alle" || it.list == vm.taskFilter) }
    val now = all.filter { !it.done && it.due != null && it.due <= today }.sortedWith(compareByDescending<TaskItem> { it.prio }.thenBy { it.due }.thenBy { it.time ?: "99" })
    val later = all.filter { !it.done && (it.due == null || it.due > today) }.sortedWith(compareBy<TaskItem> { it.due ?: "9999" }.thenByDescending { it.prio })
    val done = all.filter { it.done }
    var title by remember { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    LaunchedEffect(vm.taskFocus) { if (vm.taskFocus) { delay(300); runCatching { focus.requestFocus() }; vm.taskFocus = false } }
    val cur = lists.firstOrNull { it.id == vm.taskFilter }
    // Nye oppgaver fra «Alle» legges i første synlige liste (standard «Mine», den private).
    val target = cur?.id ?: lists.firstOrNull { it.priv == true }?.id ?: lists.first().id
    val add = {
        if (title.isNotBlank()) { vm.addTask(title, target, null, null); title = "" }
    }
    val sheet = s.detail != null || s.listSheet != null || s.glimtOpen
    Box(Modifier.fillMaxSize().background(p.bg)) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(0.dp, 0.dp, 0.dp, 60.dp + 18.dp + 16.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Prompt 40: tilbake går alltid til Hjem (åpnet fra Hjem-widgeten eller Mer → Gjøremål).
            item { ModuleHero("To-do for hele familien", "Gjøremål", "‹ Hjem") { vm.closeTasksHome40() } }
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    val open = (t?.items ?: emptyList()).filter { !it.done && it.id !in archIds }
                    TaskListChip("Alle", null, !arch && vm.taskFilter == "alle", open.size) { vm.p32b.taskArch = false; vm.taskFilter = "alle" }
                    lists.forEach { l ->
                        val on = !arch && vm.taskFilter == l.id
                        ListChip37(l, on, open.count { it.list == l.id }, users) {
                            if (on) { Haptics.select(); s.listSheet = l.id } else { vm.p32b.taskArch = false; vm.taskFilter = l.id }
                        }
                    }
                    TaskListChip("Arkivert", null, arch, vm.p32b.archived?.size ?: 0) { Haptics.select(); vm.p32b.taskArch = true; vm.p32b.archClearArm = false; vm.loadArchived32b() }
                    NewListChip37 { Haptics.select(); s.listSheet = "new" }
                }
            }
            if (arch) {
                item { ArchivedList32b(vm, lists) }
                return@LazyColumn
            }
            cur?.let { l -> item { ListInfo37(vm, l, users) } }
            vm.tasksError?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 18.dp)) } }
            if (t == null && vm.tasksError == null) item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            // Glimt-kortene fra serveren (like, forfalte, butikk, pakkeliste fra kalenderen); eldre server: like og forfalte lokalt.
            s.cards?.let { cs ->
                cs.forEach { c ->
                    item(key = "gc-" + c.key) {
                        val sub = when (c.kind) { "merge" -> "Slå sammen beholder én og samler tagger og deloppgaver."; "overdue" -> "Flytt dem til i morgen, eller arkiver dem."
                            "store" -> "Varsel når du er ved en matbutikk."; "packlist" -> "Glimt lager pakkelisten fra kalenderen."; else -> "" }
                        GlimtCard37(c.text, sub, c.actions.filter { it.first != "dismiss" }.map { a -> a.second to { vm.cardAct37(c, a.first, a.third) } }, onClose = { vm.cardAct37(c, "dismiss", null) })
                    }
                }
            }
            if (s.cards == null) dupes37(all).firstOrNull()?.takeIf { "dup:" + it.first().id !in s.cardsOff }?.let { g ->
                item {
                    val ln = lists.firstOrNull { it.id == g.first().list }?.name
                    GlimtCard37("${g.size}× «${g.first().title}»" + (ln?.let { " i $it" } ?: ""), "Slå sammen beholder én og samler tagger og deloppgaver.",
                        listOf("Slå sammen" to { vm.mergeDupes37(g) }), onClose = { s.cardsOff = s.cardsOff + ("dup:" + g.first().id) })
                }
            }
            val overdue = now.filter { it.due!! < today }
            if (s.cards == null && overdue.size >= 2 && "over:$today" !in s.cardsOff) item {
                GlimtCard37("${overdue.size} gjøremål er forfalt", "Flytt dem til i morgen, eller arkiver dem.",
                    listOf("Flytt til i morgen" to { vm.moveOverdue37(overdue.map { it.id }) }, "Arkiver" to { vm.archiveDone32b(overdue.map { it.id }) }),
                    onClose = { s.cardsOff = s.cardsOff + "over:$today" })
            }
            group37(vm, "I dag og forfalt", now, lists, users, today)
            group37(vm, "Senere", later, lists, users, today)
            group37(vm, "Ferdig", done.take(30), lists, users, today, archive = { ids -> vm.archiveDone32b(ids) })
            if (t != null && all.isEmpty()) item { Text("Ingen gjøremål her ennå. Skriv et nytt nederst, eller trykk ✦ og spør Glimt.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 18.dp)) }
            if (vm.userIsAdmin && vm.tasksHa != null) item { TasksHaSection(vm, lists) }
        }
        // Dokken (felt + ✦) skjules i Arkivert og mens et ark er åpent.
        if (!arch && !sheet) Dock37(title, { title = it }, focus, Modifier.align(Alignment.BottomCenter), onEnter = { add() }) {
            if (title.isBlank()) { s.glimt = null; s.glimtOpen = true } else { val q = title; title = ""; vm.glimt37(q) }
        }
    }
    s.detail?.let { id -> (t?.items ?: emptyList()).firstOrNull { it.id == id }?.let { DetailSheet37(vm, it, lists, users, today) } ?: run { s.detail = null } }
    s.listSheet?.let { id -> ListSheet37(vm, if (id == "new") null else lists.firstOrNull { it.id == id }, users) }
    if (s.glimtOpen) GlimtSheet37(vm, lists)
}

/** Liste-chip: fargeprikk, navn, opptil 3 avatarer for delte lister, antall åpne. */
@Composable
private fun ListChip37(l: TaskList, on: Boolean, count: Int, users: List<TaskMember>, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(
        Modifier.height(38.dp).clip(CircleShape).background(if (on) p.ink else p.card).clickable(onClickLabel = if (on) "Administrer ${l.name}" else l.name) { Haptics.select(); onClick() }
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(Color(l.color)))
        Text(l.name, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        if (l.isShared37()) Avatars37(l.members.map { m -> (m.name.ifBlank { users.firstOrNull { it.id == m.id }?.name ?: "?" }) to (m.color ?: users.firstOrNull { it.id == m.id }?.color) }, ring = if (on) p.ink else p.card)
        Text("$count", color = (if (on) p.bg else p.ink).copy(alpha = .6f), fontWeight = FontWeight.Bold, fontSize = 13.sp)
    }
}

@Composable
private fun NewListChip37(onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.height(38.dp).clip(CircleShape).drawBehind {
        drawRoundRect(p.mut, cornerRadius = CornerRadius(size.height / 2), style = Stroke(1.2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx()))))
    }.clickable(role = Role.Button) { onClick() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
        Text("+ Ny liste", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
    }
}

private fun names37(l: List<String>): String = when (l.size) { 0 -> ""; 1 -> l[0]; else -> l.dropLast(1).joinToString(", ") + " og " + l.last() }

/** «Delt med Ingrid og Pål · …» + Administrer, eller «Bare du ser denne listen · …» + Del. */
@Composable
private fun ListInfo37(vm: AppViewModel, l: TaskList, users: List<TaskMember>) {
    val p = PaperPal.current
    val me = vm.p37.myId
    val others = l.members.filter { it.id != me && it.id != (if (l.mine) l.owner else null) }.map { m -> firstName37(m.name.ifBlank { users.firstOrNull { it.id == m.id }?.name ?: "" }) }.filter { it.isNotBlank() }
    val shared = l.isShared37()
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(16.dp)).background(p.card).padding(start = 14.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            Text(if (shared) "Delt med ${names37(others).ifBlank { "husstanden" }}" else "Bare du ser denne listen", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 2)
            Text(if (shared) "Alle i listen kan legge til, endre og krysse av." else "Privat. Del den for å gjøre den felles.", color = if (shared) p.pos else p.mut, fontSize = 12.sp, maxLines = 2)
        }
        Box(Modifier.height(36.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button) { Haptics.select(); vm.p37.listSheet = l.id }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text(if (shared) "Administrer" else "Del", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

/** Glimt-kort i listen (✦, tittel, tekst, knapper og ✕). */
@Composable
private fun GlimtCard37(title: String, sub: String, actions: List<Pair<String, () -> Unit>>, onClose: () -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(14.dp, 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("✦", color = RED37, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
            Text(title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Box(Modifier.size(28.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Ikke nå") { Haptics.select(); onClose() }, contentAlignment = Alignment.Center) { Text("✕", color = p.mut, fontSize = 13.sp) }
        }
        Text(sub, color = p.mut, fontSize = 12.5.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            actions.forEachIndexed { i, (l, go) ->
                Box(Modifier.height(34.dp).clip(CircleShape).background(if (i == 0) p.ink else Color.Transparent).border(1.dp, if (i == 0) p.ink else p.line, CircleShape)
                    .clickable(role = Role.Button) { go() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                    Text(l, color = if (i == 0) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
        }
    }
}

private fun LazyListScope.group37(vm: AppViewModel, title: String, items: List<TaskItem>, lists: List<TaskList>, users: List<TaskMember>, today: String,
    archive: ((List<String>) -> Unit)? = null) {
    if (items.isEmpty()) return
    item {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            PLabel("$title · ${items.size}", modifier = Modifier.weight(1f))
            if (archive != null) ArchiveAll32b { archive(items.map { it.id }) }
        }
    }
    item {
        PCard(Modifier.padding(horizontal = 16.dp)) {
            items.forEachIndexed { i, it -> Row37(vm, it, lists, users, today, top = i > 0) }
        }
    }
}

/** Raden: ring, ⚑ og ! / !! / !!! foran tittelen; metalinjen med dato + tid, ↻, ⏰, deloppgaver, ansvarlig, liste og #tagger. */
@Composable
private fun Row37(vm: AppViewModel, t: TaskItem, lists: List<TaskList>, users: List<TaskMember>, today: String, top: Boolean) {
    val p = PaperPal.current
    val l = lists.firstOrNull { it.id == t.list }
    val who = users.firstOrNull { it.id == t.assignee }?.name?.let { firstName37(it) }
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = 52.dp).height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 8.dp, top = 11.dp, bottom = 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val ring = l?.let { Color(it.color) } ?: p.mut
            Box(
                Modifier.size(24.dp).clip(CircleShape).background(if (t.done) p.pos else Color.Transparent).border(2.dp, if (t.done) p.pos else if (t.urgent) RED37 else ring, CircleShape)
                    .clickable(role = Role.Checkbox, onClickLabel = if (t.done) "Ikke ferdig" else "Ferdig") { vm.toggleTask37(t.id) },
                contentAlignment = Alignment.Center,
            ) { if (t.done) Text("✓", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
            Column(Modifier.weight(1f).clickable(onClickLabel = "Detaljer") { Haptics.select(); vm.p37.detail = t.id }) {
                Text(buildAnnotatedString {
                    if (t.flag) withStyle(SpanStyle(color = ORANGE37)) { append("⚑ ") }
                    if (t.prio > 0) withStyle(SpanStyle(color = RED37, fontWeight = FontWeight.ExtraBold)) { append("!".repeat(t.prio) + " ") }
                    append(t.title)
                }, color = if (t.done) p.mut else p.ink, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    textDecoration = if (t.done) TextDecoration.LineThrough else null)
                val meta = listOfNotNull(
                    t.due?.let { dueLabel37(it) + (t.time?.let { tm -> " $tm" } ?: "") },
                    if (t.rep != null) "↻" else null, if (t.urgent) "⏰" else null,
                    t.subs.takeIf { it.isNotEmpty() }?.let { s -> "${s.count { it.done }}/${s.size}" },
                    who, l?.name?.takeIf { vm.taskFilter == "alle" },
                    // Prompt 40: sted (ikke butikkvarselet) og «etter «Lever pakken»» til det forrige punktet er huket av.
                    t.place?.takeIf { it.isNotBlank() && it != "store" && it != "home" },
                    afterLabel40(vm, t),
                ) + t.tags.map { "#$it" }
                if (meta.isNotEmpty()) Text(meta.joinToString(" · "), color = if (!t.done && t.due != null && t.due < today) p.lab else p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (t.done) {
                ArchiveBtn32b { vm.archiveTask32b(t.id) }
                Box(Modifier.size(32.dp).clip(CircleShape).clickable(onClickLabel = "Slett") { vm.deleteTask37(t.id) }, contentAlignment = Alignment.Center) { Text("×", color = p.mut, fontSize = 20.sp) }
            }
        }
    }
}

/** Prompt 40: avstanden fra bunnen til dokken: tastaturet + 8 dp, eller max(18 dp, navigasjonslinja + 8 dp). */
@Composable
private fun dockBottom40(): androidx.compose.ui.unit.Dp {
    val d = androidx.compose.ui.platform.LocalDensity.current
    val ime = with(d) { WindowInsets.ime.getBottom(d).toDp() }
    val nav = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    return if (ime > nav + 1.dp) ime + 8.dp else maxOf(18.dp, nav + 8.dp)
}

/** «Ny oppgave …» (60 dp, radius 22) og den runde ✦-knappen (Glimt · skriv eller spør), over tastaturet. */
@Composable
private fun Dock37(title: String, setTitle: (String) -> Unit, focus: FocusRequester, modifier: Modifier, onEnter: () -> Unit, onGlimt: () -> Unit) {
    val p = PaperPal.current
    Row(
        // Prompt 40 (claude-code-gjoremal-tastatur-tilbake.md): baren og ✦ ligger 8 dp over tastaturet når det er åpent (følger
        // WindowInsets.ime, som glir sammen med tastaturet), ellers max(18 dp, navigasjonslinja + 8 dp). Lista bak står stille.
        modifier.fillMaxWidth().padding(bottom = dockBottom40()).padding(start = 16.dp, end = 16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(
            Modifier.weight(1f).height(60.dp).shadow(14.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black.copy(alpha = .4f), spotColor = Color.Black.copy(alpha = .4f))
                .clip(RoundedCornerShape(22.dp)).background(p.card).padding(horizontal = 20.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            BasicTextField(
                title, setTitle, singleLine = true,
                textStyle = TextStyle(color = p.ink, fontSize = 16.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
                cursorBrush = SolidColor(p.lab),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onEnter() }),
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (title.isEmpty()) Text("Ny oppgave …", color = p.mut, fontSize = 16.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans); inner() } },
            )
        }
        Box(
            Modifier.size(60.dp).shadow(14.dp, CircleShape).clip(CircleShape).background(p.lab).clickable(role = Role.Button, onClickLabel = "Glimt · skriv eller spør") { Haptics.tap(); onGlimt() }
                .semantics { contentDescription = "Glimt · skriv eller spør" },
            contentAlignment = Alignment.Center,
        ) { WxIcon(STAR37, p.onLab, 26.dp, fill = true) }
    }
}

/** Glimt-stjernen (fylt ✦). */
internal const val STAR37 = "M12 1.5c.6 4.9 4.6 8.9 9.5 9.5v2c-4.9.6-8.9 4.6-9.5 9.5h-0c-.6-4.9-4.6-8.9-9.5-9.5v-2C7.4 10.4 11.4 6.4 12 1.5z"

/* ======================= Glimt-arket ======================= */

private val SUGG37 = listOf("Hva har jeg igjen i dag?", "Kjøp melk, egg og kaffe", "Legg ukas matplan i handlelisten", "Hva er forfalt?",
    "Påminn meg å kansellere Overleaf 21.09 kl 9, viktig, hver måned", "Når kjøpte vi sist kaffe?")

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun GlimtSheet37(vm: AppViewModel, lists: List<TaskList>) {
    val p = PaperPal.current
    val s = vm.p37
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var q by remember { mutableStateOf("") }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            val data = withContext(Dispatchers.IO) { runCatching { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull() }
            val jpg = data?.let { withContext(Dispatchers.Default) { jpeg28(it, 1600, 82) } }
            if (jpg == null) vm.flash("Kunne ikke lese bildet") else { s.glimtImage = jpg; vm.glimt37(q.ifBlank { "Les varene på bildet og legg dem i Handel #handlelapp" }); q = "" }
        }
    }
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = { s.glimtOpen = false }, sheetState = state, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                WxIcon(STAR37, RED37, 18.dp, fill = true)
                PSerif("Glimt", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Ferdig", onClick = { s.glimtOpen = false })
            }
            Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(start = 14.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (s.glimtBusy) {
                    val rot = rememberInfiniteTransition(label = "g37").animateFloat(0f, 360f, infiniteRepeatable(tween(1200, easing = LinearEasing)), label = "r")
                    Box(Modifier.rotate(rot.value)) { WxIcon(STAR37, RED37, 16.dp, fill = true) }
                }
                BasicTextField(q, { q = it }, textStyle = TextStyle(color = p.ink, fontSize = 15.5.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab), maxLines = 6,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { if (q.isNotBlank()) { vm.glimt37(q); q = "" } }),
                    modifier = Modifier.weight(1f).padding(vertical = 14.dp),
                    decorationBox = { inner -> Box { if (q.isEmpty()) Text("Spør Glimt eller skriv en oppgave …", color = p.mut, fontSize = 15.5.sp); inner() } })
                Box(Modifier.size(40.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Bilde av handlelapp eller oppskrift") {
                    pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }, contentAlignment = Alignment.Center) { Text("📷", fontSize = 18.sp) }
                Box(Modifier.size(40.dp).clip(CircleShape).background(if (q.isNotBlank()) p.ink else p.line).clickable(enabled = q.isNotBlank() && !s.glimtBusy, role = Role.Button, onClickLabel = "Send") {
                    vm.glimt37(q); q = ""
                }, contentAlignment = Alignment.Center) { WxIcon("M5 12h14M13 6l6 6-6 6", p.bg, 16.dp, stroke = 2.6f) }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SUGG37.forEach { sg -> PChip(sg, false) { vm.glimt37(sg) } }
            }
            // Prompt 40: «Forstår hva du mener …» med Glimt-animasjonen mens Glimt deler opp setningen.
            if (s.glimtBusy) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlimtFig35("glimt", 30.dp, "talk"); Text("Forstår hva du mener …", color = p.mut, fontSize = 13.5.sp)
            }
            s.glimt?.let { g ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(buildAnnotatedString {
                        boldParts31(g.text).forEach { (tx, b) -> if (b) withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append(tx) } else append(tx) }
                    }, color = p.ink, fontSize = 15.sp, lineHeight = 21.sp)
                    g.items.forEach { it0 ->
                        val ln = lists.firstOrNull { it.id == it0.list }
                        // Prompt 40 (claude-code-huskeliste-glimt-forstar.md): to linjer per punkt – tittel, og under: steg
                        // (1 · først / 2 · etter «…»), liste, dato/tid, sted og @person.
                        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.padding(top = 6.dp).size(8.dp).clip(CircleShape).background(ln?.let { Color(it.color) } ?: p.mut))
                            Column(Modifier.weight(1f)) {
                                Text(it0.title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                val multi = g.items.size > 1 && g.items.any { x -> x.step > 0 || x.after != null }
                                val stepTxt = if (!multi) null else if (it0.after == null) "${it0.step.coerceAtLeast(1)} · først" else "${it0.step.coerceAtLeast(2)} · etter «${it0.after}»"
                                val m2 = listOfNotNull(stepTxt, ln?.name, it0.due?.let { d -> dueLabel37(d) + (it0.time?.let { tm -> " kl. $tm" } ?: "") } ?: it0.time,
                                    it0.place, it0.who?.let { w -> "@$w" }) + it0.tags.map { "#$it" }
                                if (m2.isNotEmpty()) Text(m2.joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("✦ " + if (g.local) "Glimt · tolket på telefonen" else "Glimt", color = p.mut, fontSize = 11.5.sp, modifier = Modifier.weight(1f))
                        if (g.undo != null || g.localIds.isNotEmpty()) Box(Modifier.height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { vm.undoGlimt37() }.padding(horizontal = 14.dp),
                            contentAlignment = Alignment.Center) { Text("Angre", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
                        if (g.kind == "question") Box(Modifier.padding(start = 6.dp).height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape)
                            .clickable(role = Role.Button) { s.glimtOpen = false; vm.closeTasks(); vm.openChat(g.text) }.padding(horizontal = 14.dp),
                            contentAlignment = Alignment.Center) { Text("Chat ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
                    }
                }
            }
        }
    }
}

/* ======================= Detaljarket ======================= */

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun DetailSheet37(vm: AppViewModel, t: TaskItem, lists: List<TaskList>, users: List<TaskMember>, today: String) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    var d by remember(t.id) { mutableStateOf(t) }
    var sure by remember(t.id) { mutableStateOf(false) }
    var newSub by remember(t.id) { mutableStateOf("") }
    var newTag by remember(t.id) { mutableStateOf("") }
    var hideGuess by remember(t.id) { mutableStateOf(false) }
    // Alt lagres med en gang (tekst etter en kort pause).
    LaunchedEffect(d) { delay(450); vm.patchTask37(t.id) { cur -> d.copy(done = cur.done, doneAt = cur.doneAt) } }
    val close = { vm.patchTask37(t.id) { cur -> d.copy(done = cur.done, doneAt = cur.doneAt) }; vm.p37.detail = null }
    val list = lists.firstOrNull { it.id == d.list }
    // Ansvarlig: bare medlemmer av oppgavens liste (eldre server uten medlemmer: husstanden).
    val who = list?.members?.takeIf { it.isNotEmpty() }?.map { m -> m.copy(name = m.name.ifBlank { users.firstOrNull { it.id == m.id }?.name ?: "" }) } ?: users
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = close, sheetState = state, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.align(Alignment.CenterHorizontally).widthIn(max = 560.dp).fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(start = 16.dp, end = 16.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(36.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(role = Role.Button, onClickLabel = "Lukk") { close() },
                    contentAlignment = Alignment.Center) { Text("✕", color = p.ink, fontSize = 14.sp) }
                PSerif("Detaljer", 22.sp, modifier = Modifier.weight(1f), maxLines = 1)
                Box(Modifier.height(36.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button) { Haptics.success(); close() }.padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
                    Text("Ferdig", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                }
            }
            // Kort 1: tittel og notater (lenker blir klikkbare under).
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                BasicTextField(d.title, { d = d.copy(title = it) }, textStyle = TextStyle(color = p.ink, fontSize = 22.sp, fontFamily = PaperFonts.serif), cursorBrush = SolidColor(p.lab),
                    modifier = Modifier.fillMaxWidth())
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                BasicTextField(d.notes ?: "", { d = d.copy(notes = it) }, textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
                    decorationBox = { inner -> Box { if ((d.notes ?: "").isEmpty()) Text("Notater og lenke", color = p.mut, fontSize = 14.5.sp); inner() } })
                Regex("https?://\\S+").findAll(d.notes ?: "").map { it.value }.toList().take(3).forEach { u ->
                    Text(u, color = Color(0xFF2B5D8A), fontSize = 13.sp, textDecoration = TextDecoration.Underline, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clickable(role = Role.Button) { openLink(ctx, u) })
                }
            }
            // ✦ Glimt foreslår: liste, ansvarlig, #tagg og sted.
            val g = remember(d.title, d.list, d.assignee, d.place, d.tags) { guess37(d, lists, who) }
            if (g != null && !hideGuess) {
                val parts = listOfNotNull(g.s37("list")?.let { id -> lists.firstOrNull { it.id == id }?.name }, g.s37("assignee")?.let { id -> who.firstOrNull { it.id == id }?.name?.let { firstName37(it) } },
                    g.s37("tag")?.let { "#$it" }, g.s37("place")?.let { "påminn ved butikk" })
                if (parts.isNotEmpty()) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(16.dp)).padding(12.dp, 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("✦ Glimt foreslår: " + parts.joinToString(" · "), color = p.ink, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    Box(Modifier.height(32.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button) {
                        Haptics.success()
                        d = d.copy(list = g.s37("list") ?: d.list, assignee = g.s37("assignee") ?: d.assignee, place = g.s37("place") ?: d.place,
                            tags = (d.tags + listOfNotNull(g.s37("tag"))).distinct())
                        hideGuess = true
                    }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) { Text("Bruk", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
                }
            }
            PLabel("DATO OG TID", p.mut, modifier = Modifier.padding(start = 4.dp, top = 4.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                val dd = d.due?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
                DRow37("M4 5h16v15H4zM4 10h16M9 3v4M15 3v4", RED37, "Dato", dd?.let { dueLabel37(it.toString()) + " · ${it.dayOfMonth}.${it.monthValue}.${it.year}" }, d.due != null,
                    onValue = { val base = dd ?: LocalDate.parse(today); android.app.DatePickerDialog(ctx, { _, y, m, day -> d = d.copy(due = LocalDate.of(y, m + 1, day).toString()) }, base.year, base.monthValue - 1, base.dayOfMonth).show() }) { on ->
                    d = if (on) d.copy(due = d.due ?: today) else d.copy(due = null, time = null)
                }
                DRow37("M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", Color(0xFF2B5D8A), "Tid", d.time, d.time != null, top = true,
                    onValue = { val tm = d.time?.let { runCatching { LocalTime.parse(it) }.getOrNull() } ?: LocalTime.of(9, 0); android.app.TimePickerDialog(ctx, { _, h, m -> d = d.copy(time = "%02d:%02d".format(h, m), due = d.due ?: today) }, tm.hour, tm.minute, true).show() }) { on ->
                    // Tid slår på dato automatisk.
                    d = if (on) d.copy(time = d.time ?: "09:00", due = d.due ?: today) else d.copy(time = null)
                }
                DRow37("M12 3a6 6 0 0 1 6 6v4l2 3H4l2-3V9a6 6 0 0 1 6-6zM10 19a2 2 0 0 0 4 0", Color(0xFFC2477A), "Viktig", null, d.urgent, top = true) { on -> d = d.copy(urgent = on) }
                Text("Viktige oppgaver ringer som en alarm, også i Ikke forstyrr og stille-modus.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(start = 56.dp, end = 14.dp, bottom = 12.dp))
            }
            ChipSec37("GJENTA", REP37.map { it.first to it.second }, d.rep) { d = d.copy(rep = it) }
            ChipSec37("TIDLIG PÅMINNELSE", EARLY37.map { it.first to it.second }, d.early) { d = d.copy(early = it) }
            ChipSec37("PÅMINN PÅ STED", PLACE37.map { it.first to it.second }, d.place) { d = d.copy(place = it) }
            PLabel("ORGANISERING", p.mut, modifier = Modifier.padding(start = 4.dp, top = 4.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Liste", color = p.mut, fontSize = 12.5.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    lists.forEach { l ->
                        val on = d.list == l.id
                        Row(Modifier.height(32.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).border(1.dp, if (on) p.ink else p.line, CircleShape)
                            .clickable { Haptics.select(); d = d.copy(list = l.id) }.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(Modifier.size(8.dp).clip(CircleShape).background(Color(l.color)))
                            Text(l.name, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
                        }
                    }
                }
                Text("Ansvarlig", color = p.mut, fontSize = 12.5.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    who.forEach { m -> PChip(firstName37(m.name).ifBlank { "Uten navn" }, d.assignee == m.id) { d = d.copy(assignee = m.id) } }
                    PChip("Ingen", d.assignee == null) { d = d.copy(assignee = null) }
                }
                Text("Prioritet", color = p.mut, fontSize = 12.5.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PRIO37.forEach { (k, n) -> PChip(if (k == 0) n else "${"!".repeat(k)} $n", d.prio == k) { d = d.copy(prio = k) } }
                }
                Row(Modifier.fillMaxWidth().clickable(role = Role.Switch) { Haptics.select(); d = d.copy(flag = !d.flag) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(ORANGE37), contentAlignment = Alignment.Center) { Text("⚑", color = Color.White, fontSize = 14.sp) }
                    Text("Flagg", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
                    Toggle37(d.flag)
                }
                Text("Tagger", color = p.mut, fontSize = 12.5.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    d.tags.forEach { tg -> PChip("#$tg ×", true) { d = d.copy(tags = d.tags - tg) } }
                    BasicTextField(newTag, { v -> newTag = v.replace(" ", "") }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 13.5.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = {
                            val tg = newTag.trim().removePrefix("#")
                            if (tg.isNotEmpty()) d = d.copy(tags = (d.tags + tg).distinct())
                            newTag = ""
                        }),
                        modifier = Modifier.widthIn(min = 90.dp).height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).padding(horizontal = 12.dp, vertical = 7.dp),
                        decorationBox = { inner -> Box { if (newTag.isEmpty()) Text("#tagg", color = p.mut, fontSize = 13.5.sp); inner() } })
                }
            }
            // Deloppgaver.
            Row(Modifier.padding(start = 4.dp, end = 4.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                PLabel("DELOPPGAVER", p.mut, modifier = Modifier.weight(1f))
                if (d.subs.isNotEmpty()) Text("${d.subs.count { it.done }} / ${d.subs.size}", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                d.subs.forEachIndexed { i, sb ->
                    if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 48.dp).height(1.dp).background(p.line))
                    Row(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(22.dp).clip(CircleShape).background(if (sb.done) p.pos else Color.Transparent).border(2.dp, if (sb.done) p.pos else p.mut, CircleShape)
                            .clickable(role = Role.Checkbox) { Haptics.select(); d = d.copy(subs = d.subs.mapIndexed { j, x -> if (j == i) x.copy(done = !x.done) else x }) }, contentAlignment = Alignment.Center) {
                            if (sb.done) Text("✓", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        Text(sb.n, color = if (sb.done) p.mut else p.ink, fontSize = 14.5.sp, textDecoration = if (sb.done) TextDecoration.LineThrough else null, modifier = Modifier.weight(1f))
                        Box(Modifier.size(28.dp).clip(CircleShape).clickable(onClickLabel = "Fjern") { d = d.copy(subs = d.subs.filterIndexed { j, _ -> j != i }) }, contentAlignment = Alignment.Center) {
                            Text("×", color = p.mut, fontSize = 18.sp)
                        }
                    }
                }
                if (d.subs.isNotEmpty()) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                BasicTextField(newSub, { newSub = it }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = {
                        if (newSub.isNotBlank()) d = d.copy(subs = d.subs + TaskSub37(newSub.trim(), false))
                        newSub = ""
                    }),
                    modifier = Modifier.fillMaxWidth().padding(16.dp, 14.dp),
                    decorationBox = { inner -> Box { if (newSub.isEmpty()) Text("+ Ny deloppgave", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp); inner() } })
            }
            val busy = vm.p37.splitBusy == t.id
            Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, p.line, RoundedCornerShape(22.dp)).clickable(enabled = !busy, role = Role.Button) {
                vm.patchTask37(t.id) { cur -> d.copy(done = cur.done, doneAt = cur.doneAt) }; vm.split37(t.id)
            }, contentAlignment = Alignment.Center) { Text(if (busy) "✦ Glimt deler opp …" else "✦ Del opp med Glimt", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
            // Deloppgavene fra Glimt kommer inn i oppgaven: oppdater utkastet.
            val fresh = vm.tasks?.items?.firstOrNull { it.id == t.id }
            LaunchedEffect(fresh?.subs, busy) { if (fresh != null && fresh.subs.size > d.subs.size && !busy) d = d.copy(subs = fresh.subs) }
            Box(Modifier.fillMaxWidth().height(48.dp).clickable(role = Role.Button) { if (sure) vm.deleteTask37(t.id) else { sure = true; Haptics.select() } }, contentAlignment = Alignment.Center) {
                Text(if (sure) "Trykk igjen for å slette" else "Slett oppgave", color = RED37, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
        }
    }
}

/** Rad i DATO OG TID: ikonbrikke (30 dp, radius 9), navn, verdi (trykk for å endre) og bryter. */
@Composable
private fun DRow37(icon: String, c: Color, title: String, value: String?, on: Boolean, top: Boolean = false, onValue: (() -> Unit)? = null, onToggle: (Boolean) -> Unit) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = 56.dp).height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().heightIn(min = 54.dp).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(c), contentAlignment = Alignment.Center) { WxIcon(icon, Color.White, 16.dp, stroke = 2.2f) }
            Column(Modifier.weight(1f).clickable(enabled = on && onValue != null, role = Role.Button) { onValue?.invoke() }) {
                Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                if (on && value != null) Text(value, color = Color(0xFF2B5D8A), fontSize = 12.5.sp)
            }
            Box(Modifier.clickable(role = Role.Switch, onClickLabel = title) { Haptics.select(); onToggle(!on) }) { Toggle37(on) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipSec37(label: String, opts: List<Pair<String?, String>>, cur: String?, onPick: (String?) -> Unit) {
    val p = PaperPal.current
    PLabel(label, p.mut, modifier = Modifier.padding(start = 4.dp, top = 4.dp))
    FlowRow(Modifier.padding(horizontal = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        opts.forEach { (k, n) -> PChip(n, cur == k) { onPick(k) } }
    }
}

/* ======================= Listearket ======================= */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ListSheet37(vm: AppViewModel, l: TaskList?, users: List<TaskMember>) {
    val p = PaperPal.current
    val s = vm.p37
    val me = s.myId
    val owner = l == null || l.mine || (me != null && l.owner == me)
    var name by remember(l?.id) { mutableStateOf(l?.name ?: "") }
    var color by remember(l?.id) { mutableStateOf(l?.color ?: LIST_COLORS37.first()) }
    var picked by remember(l?.id) { mutableStateOf(l?.members?.map { it.id }?.toSet() ?: emptySet()) }
    var sure by remember(l?.id) { mutableStateOf(false) }
    val close = { s.listSheet = null }
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = close, sheetState = state, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.align(Alignment.CenterHorizontally).widthIn(max = 560.dp).fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(start = 16.dp, end = 16.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(36.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(role = Role.Button, onClickLabel = "Lukk") { close() },
                    contentAlignment = Alignment.Center) { Text("✕", color = p.ink, fontSize = 14.sp) }
                PSerif(if (l == null) "Ny liste" else "Liste", 22.sp, modifier = Modifier.weight(1f), maxLines = 1)
                if (owner) Box(Modifier.height(36.dp).clip(CircleShape).background(if (name.isNotBlank()) p.ink else p.line).clickable(enabled = name.isNotBlank() && !s.listBusy, role = Role.Button) {
                    vm.saveList37(l?.id, name, color, (picked + listOfNotNull(me)).toList())
                }.padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
                    Text(if (s.listBusy) "Lagrer …" else if (l == null) "Opprett" else "Lagre", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                BasicTextField(name, { if (owner) name = it.take(40) }, singleLine = true, readOnly = !owner, textStyle = TextStyle(color = p.ink, fontSize = 22.sp, fontFamily = PaperFonts.serif),
                    cursorBrush = SolidColor(p.lab), modifier = Modifier.fillMaxWidth(),
                    decorationBox = { inner -> Box { if (name.isEmpty()) Text("Navn på listen", color = p.mut, fontSize = 22.sp, fontFamily = PaperFonts.serif); inner() } })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LIST_COLORS37.forEach { c ->
                        Box(Modifier.size(30.dp).clip(CircleShape).background(Color(c)).border(if (c == color) 3.dp else 0.dp, p.ink, CircleShape)
                            .clickable(enabled = owner, role = Role.RadioButton) { Haptics.select(); color = c })
                    }
                }
            }
            PLabel("DEL MED", p.mut, modifier = Modifier.padding(start = 4.dp, top = 4.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                if (users.isEmpty()) Text("Henter husstanden …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
                users.forEachIndexed { i, u ->
                    val self = u.id == me
                    val on = self || u.id in picked
                    if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 56.dp).height(1.dp).background(p.line))
                    Row(Modifier.fillMaxWidth().heightIn(min = 54.dp).clickable(enabled = owner && !self, role = Role.Switch) { Haptics.select(); picked = if (on) picked - u.id else picked + u.id }
                        .padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Avatars37(listOf(u.name to u.color), size = 30.dp)
                        Text(u.name.ifBlank { "Uten navn" } + if (self) " (deg)" else "", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
                        Box(Modifier.alpha(if (owner && !self) 1f else .55f)) { Toggle37(on) }
                    }
                }
            }
            val others = picked.count { it != me }
            Text(if (others == 0) "Privat: bare du ser listen." else "Delt: alle i listen kan legge til, endre og krysse av. Bare eieren kan endre navn, farge og medlemmer.",
                color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp))
            if (l != null) Box(Modifier.fillMaxWidth().height(48.dp).clickable(role = Role.Button) {
                if (!owner) vm.leaveList37(l.id) else if (sure) vm.deleteList37(l.id) else { sure = true; Haptics.select() }
            }, contentAlignment = Alignment.Center) {
                Text(if (!owner) "Forlat listen" else if (sure) "Trykk igjen: sletter listen og oppgavene" else "Slett listen", color = RED37, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
        }
    }
}

/* ======================= Now Brief: Gjøremål-kortet ======================= */

/** «Gjøremål · 3 gjøremål i dag» med de tre første (forfalt + i dag), avkrysning rett i briefen og «Åpne Gjøremål ›». */
@Composable
internal fun BriefTodos37(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(Unit) { if (vm.tasks == null) vm.refreshTasks37() }
    val today = LocalDate.now(OSLO37).toString()
    val due = (vm.tasks?.items ?: emptyList()).filter { !it.done && it.due != null && it.due <= today }.sortedWith(compareBy<TaskItem> { it.due }.thenByDescending { it.prio })
    if (due.isEmpty()) return
    val over = due.count { it.due!! < today }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("GJØREMÅL", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.5.sp, modifier = Modifier.weight(1f))
            Text("${due.size} i dag" + if (over > 0) " · $over forfalt" else "", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
        }
        PSerif(if (due.size == 1) "1 gjøremål i dag" else "${due.size} gjøremål i dag", 20.sp, maxLines = 1)
        due.take(3).forEach { t ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(22.dp).clip(CircleShape).border(2.dp, if (t.due!! < today) RED37 else p.mut, CircleShape).clickable(role = Role.Checkbox, onClickLabel = "Ferdig") { vm.toggleTask37(t.id) })
                Text(t.title, color = p.ink, fontSize = 14.5.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(if (t.due < today) "Forfalt" else t.time ?: "I dag", color = if (t.due < today) RED37 else p.mut, fontSize = 12.sp)
            }
        }
        Text("Åpne Gjøremål ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable(role = Role.Button) { vm.closeBrief34(); vm.openTasks() }.padding(vertical = 4.dp))
    }
}
