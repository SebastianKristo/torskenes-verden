package no.kristo.finanshub.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate

/*
 * Prompt 45 – Gjøremål:
 *  - claude-code-gjoremal-uten-bakgrunn.md: toppen uten bakgrunnsbilde (Papir-flate, mørk tekst, «‹ Hjem», S-knapp med lys kant).
 *  - claude-code-gjoremal-fold-nytt-design.md: på brett filterpiller (I dag · I morgen · Neste uke · Uten dato) + personvelger,
 *    og detaljpanelet glir inn fra høyre over lista (✕ eller trykk utenfor lukker). Sidelinja ligger i Tasks37.kt.
 */

/** Toppen på Gjøremål (telefon og smal brettvisning): Papir-bakgrunn, «‹ Hjem», kicker og «Gjøremål», S-knapp. */
@Composable
internal fun TaskHero45(vm: AppViewModel) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().background(p.bg).statusBarsPadding().padding(18.dp, 10.dp, 18.dp, 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.height(36.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
                    .clickable(role = Role.Button, onClickLabel = "Til Hjem") { Haptics.select(); vm.closeTasksHome40() }.padding(start = 12.dp, end = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text("‹ Hjem", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1) }
            Spacer(Modifier.weight(1f))
            Box(
                Modifier.size(40.dp).shadow(6.dp, CircleShape).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
                    .clickable(onClickLabel = "Innstillinger") { vm.closeTasks(); vm.openPaperPage("set") }.semantics { contentDescription = "Innstillinger" },
                contentAlignment = Alignment.Center,
            ) { AvatarImage(vm, 40, p.card, p.ink) }
        }
        Column {
            PSerif("To-do for hele familien", 15.sp, p.mut, italic = true, weight = FontWeight.Normal, maxLines = 1)
            PSerif("Gjøremål", 34.sp, p.ink, maxLines = 1)
        }
    }
}

private val WHEN45 = listOf("idag" to "I dag", "imorgen" to "I morgen", "uke" to "Neste uke", "udato" to "Uten dato")

/** Filtrerer oppgavene etter pillene (trykk på valgt pille igjen = alle) og personvelgeren. */
internal fun taskFilter45(vm: AppViewModel, items: List<TaskItem>, today: String): List<TaskItem> {
    val s = vm.p45
    val d = runCatching { LocalDate.parse(today) }.getOrNull() ?: return items
    val tom = d.plusDays(1).toString()
    val week = d.plusDays(7).toString()
    return items.filter { t ->
        val okWhen = when (s.taskWhen) {
            "idag" -> t.done || (t.due != null && t.due <= today)
            "imorgen" -> t.due == tom
            "uke" -> t.due != null && t.due > today && t.due <= week
            "udato" -> t.due == null
            else -> true
        }
        val okWho = s.taskWho == null || t.assignee == s.taskWho || (t.assignee == null && t.createdBy == s.taskWho)
        okWhen && okWho
    }
}

/** Pillene og personvelgeren (avatarer med ring på valgt). */
@Composable
internal fun TaskFilters45(vm: AppViewModel, users: List<TaskMember>) {
    val p = PaperPal.current
    val s = vm.p45
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        WHEN45.forEach { (k, n) ->
            val on = s.taskWhen == k
            Box(
                Modifier.height(36.dp).clip(CircleShape).background(if (on) p.ink else p.card).border(1.dp, if (on) p.ink else p.line, CircleShape)
                    .clickable(role = Role.Tab, onClickLabel = n) { Haptics.select(); s.taskWhen = if (on) "alle" else k }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text(n, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
        }
        if (users.size > 1) {
            Spacer(Modifier.width(8.dp))
            users.take(6).forEach { u ->
                val on = s.taskWho == u.id
                val c = u.color?.let { Color(it) } ?: p.mut
                Box(
                    Modifier.size(34.dp).clip(CircleShape).border(if (on) 2.dp else 0.dp, if (on) p.ink else Color.Transparent, CircleShape).padding(3.dp)
                        .clip(CircleShape).background(c)
                        .clickable(role = Role.Button, onClickLabel = u.name) { Haptics.select(); s.taskWho = if (on) null else u.id }
                        .semantics { contentDescription = u.name },
                    contentAlignment = Alignment.Center,
                ) { Text(u.name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
            }
        }
    }
}

/** Detaljpanelet på brett: glir inn fra høyre (420 dp, skygge), mørk flate bak; trykk utenfor eller tilbake lukker. */
@Composable
internal fun TaskPanel45(vm: AppViewModel) {
    val open = vm.p44.taskPage != null
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(open, enter = fadeIn(tween(200)), exit = fadeOut(tween(200))) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .28f))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { vm.p44.taskPage = null })
        }
        AnimatedVisibility(
            open, modifier = Modifier.align(Alignment.CenterEnd),
            enter = slideInHorizontally(tween(280, easing = EASE30)) { it } + fadeIn(tween(200)),
            exit = slideOutHorizontally(tween(220)) { it } + fadeOut(tween(200)),
        ) {
            Box(Modifier.fillMaxHeight().widthIn(max = 420.dp).fillMaxWidth(.55f).shadow(24.dp)) { TaskPage44(vm) }
        }
    }
}
