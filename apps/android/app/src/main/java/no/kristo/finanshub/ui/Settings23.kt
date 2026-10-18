package no.kristo.finanshub.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 23: Innstillinger → AI og tolkning → TIDSGRENSER, og Innstillinger → App → Integrasjoner (Home Assistant).
 * Fasit: Mobil Papir App.dc.html → innst (ai, integ).
 */

private val ON_TIMEOUT = listOf("next" to "Prøv neste motor", "ocr" to "Bruk lokal OCR", "queue" to "Legg i kø og prøv senere")

private fun nextStep(v: Int): Int = AI_TO_STEPS.getOrNull(AI_TO_STEPS.indexOf(v) + 1) ?: AI_TO_STEPS.firstOrNull { it > v } ?: AI_TO_STEPS.first()

/** «TIDSGRENSER»: trykk på en motor blar gjennom 5 · 10 · 15 · 20 · 30 · 45 · 60 · 90 · 120 s. */
@Composable
internal fun AiTimeouts23(vm: AppViewModel) {
    LaunchedEffect(Unit) { vm.loadAiTimeouts23() }
    val t = vm.m23.aiTo ?: AiTimeouts23()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Tidsgrenser", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            var i = 0
            listOf(Triple("gemini", "Gemini", "Les kvitteringer"), Triple("groq", "Groq", "AI-søk og kategorier"), Triple("roboflow", "Roboflow", "Strekkoder"),
                Triple("ollama", "Ollama (lokal)", "Reserve på hjemmeserveren")).forEach { (k, n, sd) ->
                val v = when (k) { "gemini" -> t.gemini; "groq" -> t.groq; "roboflow" -> t.roboflow; else -> t.ollama }
                SetRow(vm, i, Icons.Filled.AutoAwesome, n, "$sd · trykk for å endre", "$v s", top = i > 0) {
                    val nv = nextStep(v)
                    vm.saveAiTimeouts23(when (k) { "gemini" -> t.copy(gemini = nv); "groq" -> t.copy(groq = nv); "roboflow" -> t.copy(roboflow = nv); else -> t.copy(ollama = nv) })
                }
                i++
            }
            SetRow(vm, i++, Icons.Filled.Replay, "Nye forsøk", "Før den gir opp en motor",
                when (t.retries) { 0 -> "Ingen"; 1 -> "1 gang"; else -> "${t.retries} ganger" }, top = true) { vm.saveAiTimeouts23(t.copy(retries = (t.retries + 1) % 4)) }
            SetRow(vm, i, Icons.Filled.NotificationsActive, "Ved tidsavbrudd", "Hva som skjer når grensen er nådd",
                (ON_TIMEOUT.firstOrNull { it.first == t.onTimeout } ?: ON_TIMEOUT[0]).second, top = true) {
                val j = ON_TIMEOUT.indexOfFirst { it.first == t.onTimeout }
                vm.saveAiTimeouts23(t.copy(onTimeout = ON_TIMEOUT[(j + 1) % ON_TIMEOUT.size].first))
            }
        }
        Text("Nye forsøk venter 1 s, 2 s og 4 s. Køen viser hvilken motor som svarte for sent, f.eks. «✦ Gemini svarte ikke innen ${t.gemini} s · prøver Groq …».",
            color = PaperPal.current.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

/** Innstillinger → App → Integrasjoner: Home Assistant (tilkobling) og «SYNK MED HOME ASSISTANT» (samme lagring som Huskeliste). */
@Composable
internal fun IntegrationsPage23(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(Unit) {
        vm.loadTasksHa()
        if (vm.tasks == null) vm.loadTasks()
    }
    val ha = vm.tasksHa
    val lists = vm.tasks?.lists?.ifEmpty { null } ?: TASK_LISTS_DEFAULT
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Home Assistant", modifier = Modifier.padding(start = 4.dp, top = 4.dp))
        PCard {
            val conn = ha?.connText() ?: if (vm.userIsAdmin) "Henter …" else "Bare admin"
            SetRow(vm, 0, Icons.Filled.Home, "Tilkobling", ha?.error?.takeIf { ha.entities.isEmpty() } ?: "Adresse og token fra Homelab-serveren · ${ha?.entities?.size ?: 0} To-do-lister", conn) { vm.loadTasksHa() }
        }
        if (!vm.userIsAdmin) Text("Bare administratorer kan sette opp synk med Home Assistant.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
        if (vm.userIsAdmin && ha != null) TasksHaSection(vm, lists, pad = 0.dp)
    }
}
