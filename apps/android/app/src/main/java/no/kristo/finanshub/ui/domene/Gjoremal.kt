@file:JvmName("DomeneGjoremal")

package no.kristo.finanshub.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Gjøremål: kode som lå i blandingsfilene (Ui32b.kt, Ui41.kt, Ui41b.kt, Ui46.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Huskeliste: Arkivert ======================= */

/** Arkivikonet (boks) ved siden av × på en fullført oppgave. */
@Composable
internal fun ArchiveBtn32b(onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(32.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Arkiver", onClick = onClick), contentAlignment = Alignment.Center) {
        WxIcon("M3 4h18v4H3zM5 8v12h14V8M10 12h4", p.mut, 17.dp, stroke = 2f)
    }
}

/** «Arkiver alle» til høyre for FERDIG. */
@Composable
internal fun ArchiveAll32b(onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.height(30.dp).clip(CircleShape).background(p.card).clickable(role = Role.Button, onClick = onClick).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
        Text("Arkiver alle", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
    }
}

/** Listen «ARKIVERT · N» med ↺ Gjenopprett og × per rad, og Tøm arkivet øverst. */
@Composable
internal fun ArchivedList32b(vm: AppViewModel, lists: List<TaskList>) {
    val p = PaperPal.current
    val s = vm.p32b
    LaunchedEffect(Unit) { vm.loadArchived32b() }
    val l = s.archived
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PLabel("Arkivert · ${l?.size ?: 0}", modifier = Modifier.weight(1f).padding(start = 4.dp))
            if (!l.isNullOrEmpty()) Box(
                Modifier.height(30.dp).clip(CircleShape).background(if (s.archClearArm) p.lab else p.card).clickable(role = Role.Button) { vm.emptyArchive32b() }.padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text(if (s.archClearArm) "Trykk igjen for å tømme" else "Tøm arkivet", color = if (s.archClearArm) p.onLab else p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
        }
        when {
            l == null -> Text("Henter arkivet …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp))
            l.isEmpty() -> Text("Ingenting i arkivet. Fullførte oppgaver arkiveres automatisk etter 7 dager.", color = p.mut, fontSize = 13.5.sp, lineHeight = 19.sp, modifier = Modifier.padding(4.dp))
            else -> PCard {
                l.forEachIndexed { i, t ->
                    if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 16.dp).height(1.dp).background(p.line))
                    val ln = lists.firstOrNull { it.id == t.list }
                    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 6.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(t.title, color = p.mut, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis, textDecoration = TextDecoration.LineThrough)
                            if (ln != null) Text(ln.name, color = p.mut, fontSize = 12.sp, maxLines = 1)
                        }
                        Box(
                            Modifier.height(32.dp).clip(CircleShape).background(p.bg).clickable(role = Role.Button, onClickLabel = "Gjenopprett") { vm.restoreTask32b(t.id) }.padding(horizontal = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text("↺ Gjenopprett", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
                        Box(Modifier.size(32.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Slett for godt") { vm.deleteArchived32b(t.id) }, contentAlignment = Alignment.Center) {
                            Text("×", modifier = Modifier.semantics { contentDescription = "Slett for godt" }, color = p.mut, fontSize = 20.sp)
                        }
                    }
                }
            }
        }
    }
}

/* ======================= Gjøremål: Glimt i bakgrunnen ======================= */

/** Stiplet rad øverst i lista: «Glimt deler opp beskjeden …», og «✓ Glimt lagde 3 punkter …» i 10 s. */
@Composable
internal fun GlimtJobs41(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p41
    s.glimtJobs.forEach { j ->
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).border(1.dp, p.line, RoundedCornerShape(16.dp)).padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("✦ Glimt deler opp beskjeden …", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
            Text("«${j.text}»", color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic)
        }
    }
    s.glimtDone?.let { d ->
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(d, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
            // Prompt 42: «Angre» slår delingen sammen igjen, «Endre» åpner «Laget med Glimt».
            if (s.glimtUndo42 != null || s.glimtUndoIds42.isNotEmpty()) Text("Angre", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable(role = Role.Button) { vm.undoGlimt42() }.padding(6.dp))
            Text(if (s.glimtUndo42 != null || s.glimtUndoIds42.isNotEmpty()) "Endre" else "Se", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable(role = Role.Button, onClickLabel = "Se kildene") { vm.loadSources41(); s.srcOpen = true }.padding(6.dp))
            Text("✕", color = p.mut, modifier = Modifier.semantics { contentDescription = "Lukk" }.clickable(role = Role.Button) { s.glimtDone = null }.padding(6.dp))
        }
    }
}

/* ======================= Gjøremål: «Laget med Glimt» ======================= */

/** Fanen/raden i lista: «✦ Laget med Glimt · N» (bare når det finnes minst én beskjed). */
@Composable
internal fun SourcesEntry41(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.account?.id, vm.tasks) { if (vm.p41.sources == null || vm.p41.glimtJobs.isEmpty()) vm.loadSources41() }
    val n = vm.p41.sources?.size ?: 0
    if (n == 0) return
    Row(
        Modifier.clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { Haptics.select(); vm.p41.srcOpen = true }.padding(14.dp, 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(p.lab))
        Text("✦ Laget med Glimt", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Text("$n", color = p.mut, fontSize = 12.5.sp)
    }
}

/** Ett kort per beskjed: ORIGINAL BESKJED + tid, beskjeden ordrett i kursiv, meta, punktene i rekkefølge, «✦ Del opp på nytt» og «Glem beskjeden». */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SourcesSheet41(vm: AppViewModel) {
    val p = PaperPal.current
    val list = vm.p41.sources ?: emptyList()
    ModalBottomSheet(onDismissRequest = { vm.p41.srcOpen = false }, containerColor = p.bg, contentColor = p.ink,
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().heightIn(max = 640.dp).verticalScroll(rememberScrollState()).navigationBarsPadding().padding(18.dp, 0.dp, 18.dp, 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("Laget med Glimt", 26.sp)
            if (list.isEmpty()) Text("Ingen beskjeder ennå.", color = p.mut, fontSize = 13.sp)
            list.forEach { src ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row {
                        PLabel("Original beskjed", modifier = Modifier.weight(1f))
                        Text(src.createdAt?.let { c -> epoch41(c)?.let { ms -> java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault()).let { "%02d.%02d %02d:%02d".format(it.dayOfMonth, it.monthValue, it.hour, it.minute) } } } ?: "",
                            color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.sp)
                    }
                    Text("«${src.text}»", color = p.ink, fontFamily = PaperFonts.serif, fontStyle = FontStyle.Italic, fontSize = 16.sp, lineHeight = 22.sp)
                    Text(listOfNotNull("${src.count} punkter", src.engine?.let { "✦ $it" }, src.deleted.takeIf { it > 0 }?.let { "$it slettet" }, src.by?.let { "av ${firstName37(it)}" }).joinToString(" · "),
                        color = p.mut, fontSize = 12.sp)
                    src.items.forEachIndexed { i, (t, done) ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("${i + 1}", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.width(18.dp))
                            Text(t, color = if (done) p.mut else p.ink, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            if (done) Text("✓", color = p.pos, fontWeight = FontWeight.Bold)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PButton("✦ Del opp på nytt", Modifier.weight(1f), kind = "line", height = 40.dp) { vm.redoSource41(src.id, src.text) }
                        PButton("Glem beskjeden", Modifier.weight(1f), kind = "line", height = 40.dp) { vm.forgetSource41(src.id) }
                    }
                }
            }
        }
    }
}

/* ======================= Gjøremål: deloppgaver-spørsmål og «Fullført · Angre» ======================= */

@Composable
internal fun TaskDone46(vm: AppViewModel) {
    val p = PaperPal.current
    vm.p46.askSubs?.let { id ->
        val t = vm.tasks?.items?.firstOrNull { it.id == id }
        if (t == null) { vm.p46.askSubs = null } else {
            val n = t.subs.count { !it.done }
            AlertDialog(onDismissRequest = { vm.p46.askSubs = null }, containerColor = p.bg,
                title = { PSerif(if (n == 1) "1 deloppgave er ikke ferdig." else "$n deloppgaver er ikke ferdige.", 20.sp) },
                text = { Text("Fullfør alle?", color = p.mut, fontSize = 14.sp) },
                confirmButton = { TextButton({ vm.finishFromPage46(id, confirmed = true) }) { Text("Fullfør alle", color = p.lab, fontWeight = FontWeight.Bold) } },
                dismissButton = { TextButton({ vm.p46.askSubs = null }) { Text("Avbryt", color = p.ink) } })
        }
    }
    val toast = vm.p46.taskToast
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(toast != null, Modifier.navigationBarsPadding().padding(bottom = 96.dp), enter = fadeIn(tween(250)) + slideInVertically(tween(250)) { it / 2 }, exit = fadeOut(tween(200))) {
            val t = toast ?: vm.p46.taskToast
            Row(
                Modifier.widthIn(max = 520.dp).fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp)).background(Color(0xFF1B1A17))
                    .padding(start = 16.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(t?.text ?: "", color = Color(0xFFF3EFE6), fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(Color(0xFFF3EFE6)).clickable(role = Role.Button) { vm.undoTaskToast46() }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center) { Text("Angre", color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            }
        }
    }
}
