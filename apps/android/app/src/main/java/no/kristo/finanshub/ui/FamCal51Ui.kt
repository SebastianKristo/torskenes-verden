package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Prompt 51 (ANDFEAT51): felles familiekalender med «hvem kjører?» – MEDFAM51 /api/famcal51 ($S/SERVER51-API.md), fasit
 * public/js/medfam51.js (#/familiekalender). Hendelser de neste fire ukene med bringing/henting som oppgaver: «Jeg kjører»,
 * «Si fra meg», velg sjåfør, Ruter-forslag, Gjort og Slett; ny hendelse med valgfri bringing/henting; «Vis i Kalender».
 * Åpnes fra Familie (kortet «Familiekalender») og varslene «Du kjører …»/«Hvem kjører?» (finanshub://famcal/<taskId>).
 */

private val FAMRELOAD51 = listOf("famEvents", "famDrives")
private val nbFam51 = Locale("nb", "NO")

private fun dayTitle51(d: String): String = runCatching {
    LocalDate.parse(d.take(10)).format(DateTimeFormatter.ofPattern("EEEE d. MMMM", nbFam51)).replaceFirstChar { it.uppercase() }
}.getOrDefault(d)

private fun who51(p: JSONObject?): String = p?.let { if (it.optBoolean("self")) "deg" else it.str51("name") }.orEmpty()

@Composable
internal fun FamCal51Page(vm: AppViewModel) {
    LaunchedEffect(vm.activeId) { vm.load51("famDrives"); vm.load51("famSettings") }
    Page51("Familiekalender", "Familie", onRefresh = { FAMRELOAD51.forEach { vm.load51(it, force = true) } }) {
        Keyed51(vm, "famEvents") { ev ->
            val members = ev.arr51("members")
            val drives = F51.data["famDrives"]
            Text(drives?.str51("text").orEmpty() + if (ev.obj51("home") == null) " · Legg inn et sted med type hjem i Familie › Steder for Ruter-forslag" else "",
                color = PaperPal.current.mut, fontSize = 13.5.sp)
            Cols51(
                left = { Events51(vm, ev, members) },
                right = {
                    drives?.let { Drives51(vm, it) }
                    NewEvent51(vm, members)
                    InCal51(vm)
                },
            )
        }
    }
}

@Composable
private fun Events51(vm: AppViewModel, ev: JSONObject, members: List<JSONObject>) {
    val p = PaperPal.current
    val events = ev.arr51("events")
    Card51 {
        PSerif("Kommende", 20.sp)
        if (events.isEmpty()) Text("Ingen hendelser de neste fire ukene.", color = p.mut, fontSize = 13.5.sp)
        events.groupBy { it.str51("date") }.forEach { (d, list) ->
            PLabel(dayTitle51(d), p.mut, modifier = Modifier.padding(top = 8.dp))
            list.forEach { e -> key(e.str51("id")) { Event51(vm, e, members) } }
        }
    }
}

@Composable
private fun Event51(vm: AppViewModel, e: JSONObject, members: List<JSONObject>) {
    val p = PaperPal.current
    val id = e.str51("id")
    var askDel by remember(id) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
            hex51(e.s43("color"))?.let { Box(Modifier.size(10.dp).clip(RoundedCornerShape(5.dp)).background(it)) }
            Text(e.str51("title"), color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
        }
        val place = e.obj51("place")?.s43("name") ?: e.s43("place")
        val sub = listOfNotNull(if (e.optBoolean("allDay")) "Hele dagen" else e.s43("time"), place, e.obj51("createdBy")?.let { "lagt inn av ${who51(it)}" }).joinToString(" · ")
        if (sub.isNotBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp)
        e.s43("note")?.let { Text(it, color = p.mut, fontSize = 12.5.sp) }
        e.arr51("tasks").forEach { t -> key(t.str51("id")) { Task51(vm, t, members) } }
        FlowRow51 {
            Btn51("+ Bringing") { vm.act51("addtask", "POST", Api.HOMELAB, "/famcal51/events/$id/tasks", JSONObject().put("kind", "bringing"), ok = "Bringing lagt til", reload = FAMRELOAD51) }
            Btn51("+ Henting") { vm.act51("addtask", "POST", Api.HOMELAB, "/famcal51/events/$id/tasks", JSONObject().put("kind", "henting"), ok = "Henting lagt til", reload = FAMRELOAD51) }
            if (e.optBoolean("canEdit")) Btn51("Slett hendelsen") { askDel = true }
        }
    }
    if (askDel) Confirm51("Slette hendelsen?", "«${e.str51("title")}» og kjøreoppgavene slettes for hele familien.", "Slett", { askDel = false }) {
        vm.act51("delevent", "DELETE", Api.HOMELAB, "/famcal51/events/$id", ok = "Hendelsen er slettet", reload = FAMRELOAD51)
    }
}

@Composable
private fun Task51(vm: AppViewModel, t: JSONObject, members: List<JSONObject>) {
    val p = PaperPal.current
    val id = t.str51("id")
    val status = t.str51("status")
    val mine = t.optBoolean("mine")
    val focus = F51.ui["fam.focus"] == id
    var pick by remember(id) { mutableStateOf(false) }
    var askDel by remember(id) { mutableStateOf(false) }
    var ruter by remember(id) { mutableStateOf<JSONObject?>(null) }
    Column(
        Modifier.fillMaxWidth().padding(top = 4.dp).clip(RoundedCornerShape(14.dp)).background(p.surf2)
            .then(if (focus) Modifier.border(2.dp, p.lab, RoundedCornerShape(14.dp)) else Modifier).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("${t.str51("kindLabel")} ${t.str51("atText")}" + (t.obj51("for")?.let { " · ${who51(it)}" } ?: ""), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Tag51(t.str51("statusText"), if (status == "open") "warn" else "ok")
            t.s43("note")?.let { Text(it, color = p.mut, fontSize = 12.5.sp) }
            if (t.optBoolean("overdue")) Text("Passert", color = p.lab, fontSize = 12.sp)
        }
        FlowRow51 {
            if (status != "done" && !mine) Btn51("Jeg kjører", "ink") { vm.act51("claim", "POST", Api.HOMELAB, "/famcal51/tasks/$id/claim", ok = "Du kjører", reload = FAMRELOAD51) }
            if (status != "done" && mine) Btn51("Si fra meg") { vm.act51("release", "POST", Api.HOMELAB, "/famcal51/tasks/$id/release", ok = "Oppgaven trenger en ny sjåfør", reload = FAMRELOAD51) }
            Btn51("Sjåfør") { pick = !pick }
            Btn51("Ruter-forslag", busy = F51.acting == "ruter$id") {
                vm.act51("ruter$id", "GET", Api.HOMELAB, "/famcal51/tasks/$id/ruter") { ruter = it }
            }
            if (status != "done") Btn51("Gjort") { vm.act51("done", "POST", Api.HOMELAB, "/famcal51/tasks/$id/done", ok = "Markert som gjort", reload = FAMRELOAD51) }
            Btn51("Slett") { askDel = true }
        }
        if (pick) {
            val cur = t.obj51("assignee")?.s43("userId").orEmpty()
            Choice51(listOf("" to "Ingen") + members.map { it.str51("userId") to if (it.optBoolean("self")) "${it.str51("name")} (deg)" else it.str51("name") }, cur) { u ->
                pick = false
                vm.act51("assign", "PATCH", Api.HOMELAB, "/famcal51/tasks/$id", JSONObject().put("assignee", if (u.isBlank()) JSONObject.NULL else u), reload = FAMRELOAD51) { r ->
                    F51.toast = r.obj51("task")?.s43("statusText") ?: "Lagret"
                }
            }
        }
        ruter?.let { r ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(p.card).padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(r.str51("text"), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
                r.arr51("options").take(3).forEach { o ->
                    Text(listOf(o.str51("depLabel"), o.str51("arrLabel"), o.str51("strip")).filter { it.isNotBlank() }.joinToString(" · "), color = p.mut, fontSize = 12.5.sp)
                }
                r.s43("error")?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
                Text("Kilde: ${r.str51("source")}", color = p.mut, fontSize = 11.5.sp)
            }
        }
    }
    if (askDel) Confirm51("Slette kjøreoppgaven?", t.str51("title"), "Slett", { askDel = false }) {
        vm.act51("deltask", "DELETE", Api.HOMELAB, "/famcal51/tasks/$id", ok = "Oppgaven er slettet", reload = FAMRELOAD51)
    }
}

@Composable
private fun Drives51(vm: AppViewModel, d: JSONObject) {
    val p = PaperPal.current
    val tasks = d.arr51("tasks")
    Card51 {
        PSerif("Hvem kjører?", 20.sp)
        if (tasks.isEmpty()) Text(d.str51("text", "Ingen kjøring de neste dagene"), color = p.mut, fontSize = 13.5.sp)
        tasks.forEachIndexed { i, t ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                val a = t.obj51("assignee")
                Ini51(a?.str51("name") ?: "?", hex51(a?.s43("color")))
                Column(Modifier.weight(1f)) {
                    Text(t.str51("title"), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 2)
                    Text("${t.str51("atText")} · ${t.str51("statusText")}", color = if (t.str51("status") == "open") p.lab else p.mut, fontSize = 12.5.sp)
                }
                if (t.str51("status") == "open" && !t.optBoolean("mine")) Btn51("Jeg kjører", "ink") {
                    vm.act51("claim", "POST", Api.HOMELAB, "/famcal51/tasks/${t.str51("id")}/claim", ok = "Du kjører", reload = FAMRELOAD51)
                }
            }
        }
    }
}

@Composable
private fun NewEvent51(vm: AppViewModel, members: List<JSONObject>) {
    val p = PaperPal.current
    var open by remember { mutableStateOf(F51.ui.remove("fam.new") != null) } // «Ny hendelse i familiekalenderen» fra søket
    if (!open) { PButton("+ Ny hendelse", Modifier.fillMaxWidth(), kind = "line", height = 52.dp) { open = true }; return }
    var title by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var start by remember { mutableStateOf("17:00") }
    var end by remember { mutableStateOf("18:00") }
    var place by remember { mutableStateOf("") }
    var forU by remember { mutableStateOf("") }
    var bring by remember { mutableStateOf(false) }
    var fetch by remember { mutableStateOf(false) }
    Card51 {
        PSerif("Ny hendelse", 20.sp)
        PField("Tittel", title, { title = it.take(120) }, placeholder = "Fotballtrening")
        PField("Dato (ÅÅÅÅ-MM-DD)", date, { date = it.take(10) }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PField("Start", start, { start = it.take(5) }, Modifier.weight(1f), keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
            PField("Slutt", end, { end = it.take(5) }, Modifier.weight(1f), keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
        }
        PField("Sted", place, { place = it.take(120) }, placeholder = "Hallen")
        if (members.isNotEmpty()) {
            Text("Gjelder", color = p.mut, fontSize = 12.sp)
            Choice51(listOf("" to "Ingen bestemt") + members.map { it.str51("userId") to if (it.optBoolean("self")) "${it.str51("name")} (deg)" else it.str51("name") }, forU) { forU = it }
        }
        PToggle("Trenger bringing", null, bring) { bring = it }
        PToggle("Trenger henting", null, fetch, top = true) { fetch = it }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Btn51("Legg til", "ink", busy = F51.acting == "newevent") {
                val okDate = Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(date)
                val tm = Regex("^\\d{1,2}:\\d{2}$")
                if (title.isBlank() || !okDate) { F51.toast = "Skriv tittel og dato (ÅÅÅÅ-MM-DD)"; return@Btn51 }
                val s = if (tm.matches(start)) start.padStart(5, '0') else "00:00"
                val e = if (tm.matches(end)) end.padStart(5, '0') else s
                val tasks = JSONArray()
                listOfNotNull("bringing".takeIf { bring }, "henting".takeIf { fetch }).forEach { k ->
                    tasks.put(JSONObject().put("kind", k).apply { if (forU.isNotBlank()) put("for", forU) })
                }
                val body = JSONObject().put("title", title.trim()).put("start", "${date}T$s").put("end", "${date}T$e").put("tasks", tasks)
                if (place.isNotBlank()) body.put("place", JSONObject().put("name", place.trim()))
                vm.act51("newevent", "POST", Api.HOMELAB, "/famcal51/events", body, ok = "Hendelsen er lagt til", reload = FAMRELOAD51) { open = false }
            }
            Btn51("Avbryt") { open = false }
        }
    }
}

@Composable
private fun InCal51(vm: AppViewModel) {
    val s = F51.data["famSettings"] ?: return
    PCard {
        PToggle("Vis familiekalenderen i Kalender", "Hendelsene vises også i Kalender-appen", s.optBoolean("inCalendar")) { on ->
            vm.act51("incal", "PUT", Api.HOMELAB, "/famcal51/settings", JSONObject().put("inCalendar", on), reload = listOf("famSettings"))
        }
    }
}

/** Kortet i Familie → Folk: «Familiekalender · 1 uten sjåfør ›». */
@Composable
internal fun FamCalEntry51(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.activeId) { vm.load51("famDrives") }
    val d = F51.data["famDrives"]
    val open = d?.i43("open") ?: 0
    Box(Modifier.padding(14.dp, 12.dp, 14.dp, 0.dp)) {
        PCard(onClick = { vm.open51("famcal"); vm.load51("famEvents", true); vm.load51("famDrives", true) }) {
            Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("Familiekalender", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text(d?.s43("text") ?: "Hvem kjører? Henting og bringing", color = if (open > 0) p.lab else p.mut, fontSize = 13.sp)
                }
                Text("›", color = p.mut, fontSize = 20.sp)
            }
        }
    }
}
