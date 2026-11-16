package no.kristo.finanshub.ui

import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import java.time.LocalDate
import no.kristo.finanshub.ui.designsystem.HomelabType
import no.kristo.finanshub.ui.designsystem.HomelabTheme
import no.kristo.finanshub.ui.designsystem.DsPalette
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon

/*
 * Prompt 44 – Gjøremål (fasit Huskeliste.dc.html):
 *  - claude-code-gjoremal-deloppgaver.md: ↳+ på hver oppgave åpner «Ny deloppgave …» rett under; deloppgavene står innrykket (38)
 *    med egen avkrysning i listens farge og ✕. Alle avkrysset → «Fullfør «X» også?». Fullføres hovedoppgaven, krysses resten av.
 *  - claude-code-gjoremal-infoside.md (Papir-utseendet): «‹ Tilbake» (rød) + runde knapper ☆ og ⚙-meny, liste-pille, avkrysning + tittel
 *    som redigeres direkte, FRIST og NÅR side om side (DatePickerDialog / TimePickerDialog), DETALJER, DELOPPGAVER med fremdrift,
 *    STED med forslag og kart (OSM-flis), fast «Fullfør oppgaven» nederst. Skrivefeltet og Glimt-knappen skjules mens siden er åpen.
 *  - claude-code-gjoremal-synk-i-innstillinger.md: raden «⇄ Synk med Home Assistant · Synket 20:41 ›» åpner Innstillinger → Gjøremål.
 */

private val RED44 = DsPalette.PapirLys.accent
private val STAR44 = Color(0xFFE2A42B)
private val NB44 = java.util.Locale("nb", "NO")

private fun longDate44(iso: String): String = runCatching {
    val d = LocalDate.parse(iso.take(10))
    d.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, NB44).replaceFirstChar { it.uppercase() } + " ${d.dayOfMonth}. " + d.month.getDisplayName(java.time.format.TextStyle.FULL, NB44)
}.getOrDefault(iso)

/* ---------------- Deloppgaver i lista ---------------- */

/** ↳+-knappen ved oppgaven. */
@Composable
internal fun SubAddBtn44(vm: AppViewModel, t: TaskItem) {
    val p = HomelabTheme.colors
    val on = vm.p44.subOpen == t.id
    Box(Modifier.size(36.dp).clip(CircleShape).background(if (on) p.textPrimary.copy(alpha = .08f) else Color.Transparent)
        .clickable(role = Role.Button, onClickLabel = "Legg til deloppgave") { Haptics.select(); vm.p44.subOpen = if (on) null else t.id }, contentAlignment = Alignment.Center) {
        Text("↳+", color = p.textTertiary, fontWeight = FontWeight.Bold, fontSize = HomelabType.subheadline.fontSize)
    }
}

/** Innrykkede deloppgaver under oppgaven og feltet «Ny deloppgave …». */
@Composable
internal fun SubRows44(vm: AppViewModel, t: TaskItem, color: Color) {
    val p = HomelabTheme.colors
    val open = vm.p44.subOpen == t.id
    if (t.subs.isEmpty() && !open) return
    Column(Modifier.fillMaxWidth().padding(start = 50.dp, end = 8.dp, bottom = 6.dp)) {
        t.subs.forEachIndexed { i, sb ->
            Row(Modifier.fillMaxWidth().heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(20.dp).clip(RoundedCornerShape(6.dp)).background(if (sb.done) color else Color.Transparent).border(2.dp, color, RoundedCornerShape(6.dp))
                    .clickable(role = Role.Checkbox, onClickLabel = if (sb.done) "Ikke ferdig" else "Ferdig") { vm.toggleSub44(t.id, i) }, contentAlignment = Alignment.Center) {
                    if (sb.done) Text("✓", color = Color.White, fontSize = HomelabType.caption.fontSize, fontWeight = FontWeight.Bold)
                }
                Text(sb.n, color = if (sb.done) p.textTertiary else p.textPrimary, fontSize = HomelabType.callout.fontSize, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis,
                    textDecoration = if (sb.done) TextDecoration.LineThrough else null)
                Box(Modifier.size(32.dp).clip(CircleShape).clickable(onClickLabel = "Slett deloppgave") { vm.delSub44(t.id, i) }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Close, contentDescription = "Slett deloppgave", tint = p.textTertiary, modifier = Modifier.size(14.dp))
                }
            }
        }
        if (open) SubField44(focusNow = true) { vm.addSub44(t.id, it) }
    }
}

@Composable
private fun SubField44(focusNow: Boolean, hint: String = "Ny deloppgave …", onAdd: (String) -> Unit) {
    val p = HomelabTheme.colors
    var v by rememberSaveable { mutableStateOf("") }
    val fr = remember { FocusRequester() }
    LaunchedEffect(focusNow) { if (focusNow) { delay(150); runCatching { fr.requestFocus() } } }
    val go = { if (v.isNotBlank()) { onAdd(v); v = "" } }
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(start = 12.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) {
            if (v.isEmpty()) Text(hint, color = p.textTertiary, fontSize = HomelabType.callout.fontSize)
            BasicTextField(v, { v = it }, singleLine = true, textStyle = TextStyle(color = p.textPrimary, fontSize = HomelabType.callout.fontSize), cursorBrush = SolidColor(p.accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { go() }), modifier = Modifier.fillMaxWidth().focusRequester(fr))
        }
        Text("Legg til", color = p.accent, fontWeight = FontWeight.Bold, fontSize = HomelabType.subheadline.fontSize, modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape).clickable { go() }.padding(horizontal = 12.dp).wrapContentHeight())
    }
}

/** «Fullfør «X» også?» når alle deloppgavene er krysset av. */
@Composable
internal fun AskDone44(vm: AppViewModel) {
    val id = vm.p44.askDone ?: return
    val t = vm.tasks?.items?.firstOrNull { it.id == id } ?: run { vm.p44.askDone = null; return }
    val p = HomelabTheme.colors
    AlertDialog(onDismissRequest = { vm.p44.askDone = null }, containerColor = p.surface,
        title = { PSerif("Fullfør «${t.title}» også?", 20.sp) },
        text = { Text("Alle deloppgavene er krysset av.", color = p.textTertiary, fontSize = HomelabType.callout.fontSize) },
        confirmButton = { TextButton({ vm.p44.askDone = null; vm.completeTask44(id) }) { Text("Fullfør", color = p.accent, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton({ vm.p44.askDone = null }) { Text("Ikke nå", color = p.textPrimary) } })
}

/** Innstillinger → Gjøremål: kortet SYNK MED HOME ASSISTANT (samme lagring som før). */
@Composable
internal fun TasksSyncPage44(vm: AppViewModel) {
    val p = HomelabTheme.colors
    LaunchedEffect(Unit) { vm.loadTasksHa(); if (vm.tasks == null) vm.refreshTasks37() }
    val lists = vm.tasks?.lists?.ifEmpty { null } ?: TASK_LISTS_DEFAULT
    Column(Modifier.padding(top = 28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!vm.userIsAdmin) Text("Bare admin kan endre synken med Home Assistant.", color = p.textTertiary, fontSize = HomelabType.subheadline.fontSize, modifier = Modifier.padding(horizontal = 4.dp))
        else if (vm.tasksHa == null) Text("Synk med Home Assistant finnes ikke på serveren, eller Home Assistant er ikke koblet til under Tilkoblinger.", color = p.textTertiary, fontSize = HomelabType.subheadline.fontSize, modifier = Modifier.padding(horizontal = 4.dp))
        TasksHaSection(vm, lists, pad = 0.dp)
    }
}

/* ---------------- Infosiden ---------------- */

@Composable
internal fun TaskPage44(vm: AppViewModel) {
    val p = HomelabTheme.colors
    val id = vm.p44.taskPage ?: return
    val t = vm.tasks?.items?.firstOrNull { it.id == id } ?: run { vm.p44.taskPage = null; return }
    val lists = vm.tasks?.lists?.ifEmpty { null } ?: TASK_LISTS_DEFAULT
    val l = lists.firstOrNull { it.id == t.list }
    val c = l?.let { Color(it.color) } ?: p.textPrimary
    val ctx = LocalContext.current
    val today = LocalDate.now(OSLO37)
    BackHandler { vm.p44.taskPage = null }
    LaunchedEffect(t.id) { vm.ensureGeo44(t) }
    var title by remember(t.id) { mutableStateOf(t.title) }
    var notes by remember(t.id) { mutableStateOf(t.notes.orEmpty()) }
    // Tittel og notater lagres fortløpende (litt forsinket, så det ikke sendes ved hvert tastetrykk).
    LaunchedEffect(title) { delay(600); if (title.isNotBlank() && title != t.title) vm.patchTask37(t.id) { it.copy(title = title.trim()) } }
    LaunchedEffect(notes) { delay(800); if (notes != t.notes.orEmpty()) vm.patchTask37(t.id) { it.copy(notes = notes) } }
    var menu by remember { mutableStateOf(false) }
    var listMenu by remember { mutableStateOf(false) }
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Box(Modifier.fillMaxSize().background(p.surface)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().widthIn(max = 640.dp).align(Alignment.TopCenter)) {
            // Felles toppstripe: safe area + 12, høyde 42 (samme som Media og andre undersider).
            Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 16.dp, top = 12.dp).height(42.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("‹ Tilbake", color = RED44, fontWeight = FontWeight.Bold, fontSize = HomelabType.body.fontSize, maxLines = 1,
                    modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape).clickable(role = Role.Button) { vm.p44.taskPage = null }.padding(horizontal = 10.dp).wrapContentHeight())
                Spacer(Modifier.weight(1f))
                RoundBtn44(if (t.flag) "★" else "☆", if (t.flag) STAR44 else RED44, if (t.flag) "Fjern flagg" else "Flagg") { Haptics.select(); vm.patchTask37(t.id) { it.copy(flag = !it.flag) } }
                Spacer(Modifier.width(8.dp))
                Box {
                    RoundBtn44("⚙", p.textPrimary, "Flere valg") { menu = true }
                    DropdownMenu(menu, { menu = false }, containerColor = p.surfaceRaised) {
                        DropdownMenuItem({ Text("Gjentakelse, påminnelse og mer …", color = p.textPrimary) }, { menu = false; vm.p37.detail = t.id })
                        DropdownMenuItem({ Text("Dupliser", color = p.textPrimary) }, { menu = false; vm.duplicateTask44(t) })
                        DropdownMenuItem({ Text("Slett oppgaven", color = RED44) }, { menu = false; vm.p44.taskPage = null; vm.deleteTask37(t.id) })
                    }
                }
            }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 90.dp + navB),
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // Liste-pille.
                Box {
                    Row(Modifier.heightIn(min = 36.dp).clip(CircleShape).background(p.surfaceRaised).border(1.dp, p.line, CircleShape).clickable { listMenu = true }.padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(9.dp).clip(CircleShape).background(c))
                        Text(l?.name ?: "Liste", color = p.textPrimary, fontWeight = FontWeight.Bold, fontSize = HomelabType.subheadline.fontSize)
                        Text("▼", color = p.textTertiary, fontSize = HomelabType.caption.fontSize)
                    }
                    DropdownMenu(listMenu, { listMenu = false }, containerColor = p.surfaceRaised) {
                        lists.forEach { x ->
                            DropdownMenuItem({ Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(9.dp).clip(CircleShape).background(Color(x.color))); Text("  " + x.name + if (x.id == t.list) "  ✓" else "", color = p.textPrimary)
                            } }, { listMenu = false; Haptics.select(); vm.patchTask37(t.id) { it.copy(list = x.id) } })
                        }
                    }
                }
                // Avkrysning + tittel.
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.padding(top = 4.dp).size(30.dp).clip(CircleShape).background(if (t.done) c else Color.Transparent).border(2.5.dp, c, CircleShape)
                        .clickable(role = Role.Checkbox) { if (t.done) vm.toggleTask37(t.id) else vm.completeTask44(t.id) }, contentAlignment = Alignment.Center) {
                        if (t.done) Text("✓", color = Color.White, fontWeight = FontWeight.Bold, fontSize = HomelabType.callout.fontSize)
                    }
                    BasicTextField(title, { title = it }, textStyle = TextStyle(color = if (t.done) p.textTertiary else p.textPrimary, fontFamily = PaperFonts.serif, fontSize = HomelabType.title2.fontSize, lineHeight = 34.sp,
                        textDecoration = if (t.done) TextDecoration.LineThrough else null), cursorBrush = SolidColor(p.accent), modifier = Modifier.weight(1f))
                }
                // FRIST og NÅR.
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    val over = t.dl != null && t.dl < today.toString() && !t.done
                    DateCard44("Frist", t.dl?.let { "Frist: " + longDate44(it) }, if (over) "forfalt" else null, over, Modifier.weight(1f).fillMaxHeight(),
                        onPick = { pickDate44(ctx, t.dl ?: today.toString()) { d -> vm.patchTask37(t.id) { it.copy(dl = d) } } }, onClear = { vm.patchTask37(t.id) { it.copy(dl = null) } })
                    DateCard44("Når", t.due?.let { dueLabel37(it) }, null, false, Modifier.weight(1f).fillMaxHeight(),
                        onPick = { pickDate44(ctx, t.due ?: today.toString()) { d -> vm.patchTask37(t.id) { it.copy(due = d) } } }, onClear = { vm.patchTask37(t.id) { it.copy(due = null, time = null) } }) {
                        if (t.due != null) Text(t.time ?: "Legg til tid", color = if (t.time != null) p.textPrimary else p.textTertiary, fontWeight = FontWeight.Bold, fontSize = HomelabType.footnote.fontSize,
                            modifier = Modifier.padding(top = 6.dp).clip(CircleShape).background(p.surface).clickable {
                                val (h, m) = (t.time ?: "09:00").split(":").let { (it[0].toIntOrNull() ?: 9) to (it.getOrNull(1)?.toIntOrNull() ?: 0) }
                                android.app.TimePickerDialog(ctx, { _, hh, mm -> vm.patchTask37(t.id) { it.copy(time = "%02d:%02d".format(hh, mm)) } }, h, m, true).show()
                            }.padding(horizontal = 10.dp, vertical = 5.dp))
                    }
                }
                // DETALJER.
                Card44("Detaljer") {
                    Box(Modifier.fillMaxWidth().heightIn(min = 60.dp)) {
                        if (notes.isEmpty()) Text("Legg til detaljer", color = p.textTertiary, fontFamily = PaperFonts.serif, fontSize = HomelabType.body.fontSize)
                        BasicTextField(notes, { notes = it }, textStyle = TextStyle(color = p.textPrimary, fontFamily = PaperFonts.serif, fontSize = HomelabType.body.fontSize, lineHeight = 22.sp), cursorBrush = SolidColor(p.accent),
                            modifier = Modifier.fillMaxWidth())
                    }
                }
                // DELOPPGAVER.
                Card44("Deloppgaver", if (t.subs.isNotEmpty()) "${t.subs.count { it.done }} av ${t.subs.size}" else null) {
                    if (t.subs.isNotEmpty()) Box(Modifier.fillMaxWidth().height(3.dp).clip(CircleShape).background(p.line)) {
                        Box(Modifier.fillMaxWidth(t.subs.count { it.done } / t.subs.size.toFloat()).fillMaxHeight().background(c))
                    }
                    t.subs.forEachIndexed { i, sb ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.size(22.dp).clip(CircleShape).background(if (sb.done) c else Color.Transparent).border(2.dp, c, CircleShape).clickable(role = Role.Checkbox) { vm.toggleSub44(t.id, i) },
                                contentAlignment = Alignment.Center) { if (sb.done) Text("✓", color = Color.White, fontSize = HomelabType.caption.fontSize, fontWeight = FontWeight.Bold) }
                            Text(sb.n, color = if (sb.done) p.textTertiary else p.textPrimary, fontSize = HomelabType.callout.fontSize, modifier = Modifier.weight(1f), textDecoration = if (sb.done) TextDecoration.LineThrough else null)
                            Box(Modifier.size(36.dp).clip(CircleShape).clickable(onClickLabel = "Slett") { vm.delSub44(t.id, i) }, contentAlignment = Alignment.Center) { Icon(Icons.Filled.Close, contentDescription = "Slett", tint = p.textTertiary, modifier = Modifier.size(14.dp)) }
                        }
                    }
                    SubField44(focusNow = false, hint = "Legg til deloppgave") { vm.addSub44(t.id, it) }
                }
                // STED med forslag og kart.
                Place44(vm, t)
            }
        }
        // Fast knapp nederst.
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().widthIn(max = 640.dp).padding(start = 18.dp, end = 18.dp, bottom = 14.dp + navB)
            .heightIn(min = 54.dp).shadow(10.dp, RoundedCornerShape(27.dp)).clip(RoundedCornerShape(27.dp)).background(if (t.done) p.surfaceRaised else c)
            // Prompt 46 (claude-code-gjoremal-fullfor-lukker.md): haken animeres, suksess-haptikk og infosiden lukkes etter 450 ms (P46.kt).
            // «Angre fullført» lukker ikke siden.
            .clickable(role = Role.Button) { if (t.done) vm.toggleTask37(t.id) else if (vm.p46.doneAnim == null) vm.finishFromPage46(t.id) }, contentAlignment = Alignment.Center) {
            val anim = vm.p46.doneAnim == t.id
            Text(if (anim) "✓ Fullført" else if (t.done) "Angre fullført" else "Fullfør oppgaven", color = if (t.done && !anim) p.textPrimary else Color.White, fontWeight = FontWeight.Bold, fontSize = HomelabType.body.fontSize)
        }
    }
}

private fun pickDate44(ctx: android.content.Context, cur: String, onPick: (String) -> Unit) {
    val d = runCatching { LocalDate.parse(cur.take(10)) }.getOrDefault(LocalDate.now())
    android.app.DatePickerDialog(ctx, { _, y, m, day -> onPick(LocalDate.of(y, m + 1, day).toString()) }, d.year, d.monthValue - 1, d.dayOfMonth).show()
}

@Composable
private fun RoundBtn44(icon: String, color: Color, label: String, onClick: () -> Unit) {
    val p = HomelabTheme.colors
    Box(Modifier.size(42.dp).shadow(3.dp, CircleShape).clip(CircleShape).background(p.surfaceRaised).border(1.dp, p.line, CircleShape)
        .clickable(role = Role.Button, onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        Text(icon, color = color, fontSize = HomelabType.headline.fontSize, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun Card44(label: String, right: String? = null, content: @Composable ColumnScope.() -> Unit) {
    val p = HomelabTheme.colors
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.surfaceRaised).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row { PLabel(label, color = p.textTertiary, modifier = Modifier.weight(1f)); right?.let { Text(it, color = p.textTertiary, fontFamily = PaperFonts.mono, fontSize = HomelabType.caption.fontSize) } }
        content()
    }
}

@Composable
private fun DateCard44(label: String, value: String?, badge: String?, red: Boolean, modifier: Modifier, onPick: () -> Unit, onClear: () -> Unit, extra: @Composable ColumnScope.() -> Unit = {}) {
    val p = HomelabTheme.colors
    Column(modifier.clip(RoundedCornerShape(18.dp)).background(p.surfaceRaised).border(if (red) 1.5.dp else 1.dp, if (red) RED44 else p.line, RoundedCornerShape(18.dp))
        .clickable(role = Role.Button, onClickLabel = label) { onPick() }.padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PLabel(label, color = if (red) RED44 else p.textTertiary, modifier = Modifier.weight(1f))
            if (value != null) Box(Modifier.size(28.dp).clip(CircleShape).clickable(onClickLabel = "Fjern") { onClear() }, contentAlignment = Alignment.Center) { Icon(Icons.Filled.Close, contentDescription = "Fjern", tint = p.textTertiary, modifier = Modifier.size(14.dp)) }
        }
        Text(value ?: "Legg til", color = if (value == null) p.textTertiary else if (red) RED44 else p.textPrimary, fontFamily = PaperFonts.serif, fontSize = HomelabType.body.fontSize, lineHeight = 21.sp)
        badge?.let { Text(it, color = RED44, fontWeight = FontWeight.Bold, fontSize = HomelabType.caption.fontSize) }
        extra()
    }
}

@Composable
private fun Place44(vm: AppViewModel, t: TaskItem) {
    val p = HomelabTheme.colors
    val ctx = LocalContext.current
    val shown = t.place?.takeIf { it.isNotBlank() && it !in listOf("store", "home", "leave", "work", "cabin") }
    var q by rememberSaveable(t.id) { mutableStateOf("") }
    var edit by remember(t.id) { mutableStateOf(false) }
    var hits by remember { mutableStateOf<List<Geo44>>(emptyList()) }
    LaunchedEffect(q) { delay(350); hits = if (q.length >= 3) vm.geoSearch44(q) else emptyList() }
    Card44("Sted") {
        if (shown != null && !edit) Row(verticalAlignment = Alignment.CenterVertically) {
            Text("📍", fontSize = HomelabType.body.fontSize)
            Text(shown, color = p.textPrimary, fontSize = HomelabType.callout.fontSize, modifier = Modifier.weight(1f).padding(start = 8.dp).clickable { edit = true; q = shown })
            Box(Modifier.size(32.dp).clip(CircleShape).clickable(onClickLabel = "Fjern sted") { vm.patchTask37(t.id) { it.copy(place = null, geo = null) } }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Close, contentDescription = "Fjern sted", tint = p.textTertiary, modifier = Modifier.size(14.dp))
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("📍", fontSize = HomelabType.body.fontSize)
                Box(Modifier.weight(1f).padding(start = 8.dp)) {
                    if (q.isEmpty()) Text("Legg til sted eller adresse", color = p.textTertiary, fontSize = HomelabType.callout.fontSize)
                    BasicTextField(q, { q = it }, singleLine = true, textStyle = TextStyle(color = p.textPrimary, fontSize = HomelabType.callout.fontSize), cursorBrush = SolidColor(p.accent),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = {
                            if (q.isNotBlank()) { val v = q.trim(); vm.patchTask37(t.id) { it.copy(place = v, geo = null) }; edit = false; q = "" }
                        }), modifier = Modifier.fillMaxWidth())
                }
            }
            hits.take(5).forEach { g ->
                Text(g.label, color = p.textPrimary, fontSize = HomelabType.callout.fontSize, maxLines = 2, modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable {
                    vm.patchTask37(t.id) { it.copy(place = g.label, geo = g.lat to g.lon) }; edit = false; q = ""; hits = emptyList()
                }.wrapContentHeight())
            }
        }
        if (shown != null && t.geo == null && !edit) Text("Finner stedet på kartet …", color = p.textTertiary, fontSize = HomelabType.footnote.fontSize)
        t.geo?.let { (la, lo) ->
            MapTile44(vm, la, lo)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn43("Åpne i Kart") { openLink(ctx, "geo:$la,$lo?q=$la,$lo(" + java.net.URLEncoder.encode(shown ?: "Sted", "UTF-8") + ")") }
                Btn43("Google Maps") { openLink(ctx, "https://www.google.com/maps/search/?api=1&query=$la,$lo") }
            }
        }
    }
}

/** Én OSM-flis (zoom 15) med nål på stedet. Ingen kartbibliotek (ingen nye avhengigheter). */
@Composable
private fun MapTile44(vm: AppViewModel, lat: Double, lon: Double) {
    val p = HomelabTheme.colors
    val z = 15
    val n = Math.pow(2.0, z.toDouble())
    val xf = (lon + 180.0) / 360.0 * n
    val latR = Math.toRadians(lat)
    val yf = (1.0 - Math.log(Math.tan(latR) + 1.0 / Math.cos(latR)) / Math.PI) / 2.0 * n
    val url = "https://tile.openstreetmap.org/$z/${xf.toInt()}/${yf.toInt()}.png"
    var bmp by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url) { bmp = vm.bgImage41(url) }
    BoxWithConstraints(Modifier.fillMaxWidth().height(210.dp).clip(RoundedCornerShape(14.dp)).background(p.line)) {
        val w = maxWidth
        val top = (w - 210.dp) / 2
        bmp?.let { b -> Image(b.asImageBitmap(), "Kart", contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
        val px = w * (xf - xf.toInt()).toFloat()
        val py = (w * (yf - yf.toInt()).toFloat() - top).coerceIn(12.dp, 198.dp)
        Text("📍", fontSize = HomelabType.title3.fontSize, modifier = Modifier.offset(x = px - 12.dp, y = py - 26.dp))
        Text("© OpenStreetMap", color = Color.Black.copy(alpha = .6f), fontSize = HomelabType.caption.fontSize, modifier = Modifier.align(Alignment.BottomEnd).padding(4.dp))
    }
}
