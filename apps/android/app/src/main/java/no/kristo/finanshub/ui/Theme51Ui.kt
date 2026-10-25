package no.kristo.finanshub.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 51 (ANDFEAT51): «Tema» – Papir · lys / mørk / følg systemet / automatisk (etter solnedgang eller faste klokkeslett),
 * synket mellom enhetene via /api/me/theme51 (Theme51.kt). Åpnes fra Innstillinger → Utseende → «Tema på alle enheter» og
 * hurtighandlingen «Bytt tema» i søket. Theme51Effects holder auto-temaet oppdatert (hvert minutt) og henter temaet fra
 * serveren ved oppstart, kontobytte og hvert 15. minutt mens appen er åpen.
 */

@Composable
internal fun Theme51Effects(vm: AppViewModel) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { Theme51.init(ctx) }
    LaunchedEffect(Theme51.auto) { while (Theme51.auto) { Theme51.tick(); delay(60_000) } }
    LaunchedEffect(vm.activeId, vm.loggedIn) {
        if (!vm.loggedIn) return@LaunchedEffect
        while (true) { vm.syncTheme51(); delay(15 * 60_000L) }
    }
}

@Composable
internal fun Theme51Page(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(Unit) { vm.syncTheme51() }
    val auto = Theme51.auto
    val cur = when {
        auto && Theme51.by == "time" -> "time"
        auto -> "sun"
        else -> vm.paperMode
    }
    var lightAt by remember { mutableStateOf(Theme51.lightAt) }
    var darkAt by remember { mutableStateOf(Theme51.darkAt) }
    Page51("Tema", "Utseende") {
        Text("Valget følger kontoen din og brukes på alle enhetene dine (web, iPhone og Android). Liquid Glass velges per enhet i Innstillinger → Utseende.",
            color = p.mut, fontSize = 13.5.sp)
        PCard {
            val sel = "✓"
            PRow("Papir · lys", "Lyst papir hele tiden", if (cur == "lys") sel else "", p.pos, serif = false) { vm.setPaperMode("lys") }
            PRow("Papir · mørk", "Kveldspapir hele tiden", if (cur == "mork") sel else "", p.pos, serif = false, top = true) { vm.setPaperMode("mork") }
            PRow("Følg systemet", "Lys eller mørk som telefonen", if (cur == "auto") sel else "", p.pos, serif = false, top = true) { vm.setPaperMode("auto") }
            PRow("Automatisk – etter solen", "Mørk fra solnedgang til soloppgang (${Theme51.place})", if (cur == "sun") sel else "", p.pos, serif = false, top = true) { vm.setAutoTheme51("sun") }
            PRow("Automatisk – faste klokkeslett", "Lys fra ${Theme51.lightAt}, mørk fra ${Theme51.darkAt}", if (cur == "time") sel else "", p.pos, serif = false, top = true) {
                vm.setAutoTheme51("time", lightAt, darkAt)
            }
        }
        if (cur == "time") Card51 {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PField("Lys fra (TT:MM)", lightAt, { lightAt = it.take(5) }, Modifier.weight(1f), keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
                PField("Mørk fra (TT:MM)", darkAt, { darkAt = it.take(5) }, Modifier.weight(1f), keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
            }
            Btn51("Lagre klokkeslett", "ink") {
                val ok = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")
                if (!ok.matches(lightAt) || !ok.matches(darkAt)) { F51.toast = "Skriv klokkeslett som TT:MM"; return@Btn51 }
                vm.setAutoTheme51("time", lightAt, darkAt); F51.toast = "Lagret"
            }
        }
        if (auto) Card51 {
            PLabel("Nå")
            Text(if (Theme51.dark) "Mørkt tema" else "Lyst tema", color = p.ink, fontSize = 15.sp)
            val srv = Theme51.server
            srv?.optJSONObject("next")?.let { n -> Text("Neste bytte: ${time51(n.optString("at"))} (${if (n.optString("mode") == "dark") "mørk" else "lys"})", color = p.mut, fontSize = 13.sp) }
            srv?.optJSONObject("sun")?.let { s ->
                val polar = s.optString("polar").takeIf { it.isNotBlank() && it != "null" }
                Text(polar?.replaceFirstChar { it.uppercase() } ?: "Sol opp ${time51(s.optString("sunrise"))} · ned ${time51(s.optString("sunset"))}", color = p.mut, fontSize = 13.sp)
            }
        }
    }
}
