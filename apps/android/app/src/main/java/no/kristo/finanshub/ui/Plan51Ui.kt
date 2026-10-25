package no.kristo.finanshub.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import org.json.JSONArray
import org.json.JSONObject

/*
 * Prompt 51 (ANDFEAT51): «Planlegging» i FinansHub Android – FIN51 ($S/SERVER51-API.md), fasit public/finans/js/plan51.js.
 *  Faner: Sparemål (mål med bilde, innskudd, «rund opp»), Kalender (faste trekk de neste 30/60/90 dagene med saldoprognose per
 *  konto), Skatt (fradragsposter, påminnelse, eksport CSV/utskrift, egne tall), Priser (prishistorikk fra kvitteringsvarelinjer,
 *  billigste butikk) og Abonnementsjeger (prisøkninger, doble, ubrukte, oppsigelsestekst fra lokal modell – aldri sendt).
 *  Åpnes fra Finans → Mer → Planlegging og finanshub://plan[/fane].
 */

private val TABS51 = listOf("spar" to "Sparemål", "kal" to "Kalender", "skatt" to "Skatt", "pris" to "Priser", "jakt" to "Abonnementsjeger")
private val TABKEY51 = mapOf("spar" to "goals", "kal" to "cal", "skatt" to "tax", "pris" to "prices", "jakt" to "hunter")

@Composable
internal fun Plan51Page(vm: AppViewModel) {
    val tab = F51.opt("plan.tab", "spar")
    Page51("Planlegging", "Finans", onRefresh = { vm.load51(TABKEY51[tab] ?: "goals", force = true) }) {
        Tabs51(TABS51, tab) { F51.ui["plan.tab"] = it }
        when (tab) {
            "kal" -> Keyed51(vm, "cal") { Cal51(vm, it) }
            "skatt" -> Keyed51(vm, "tax") { Tax51(vm, it) }
            "pris" -> Keyed51(vm, "prices") { Prices51(vm, it) }
            "jakt" -> Keyed51(vm, "hunter") { Hunter51(vm, it) }
            else -> Keyed51(vm, "goals") { Goals51(vm, it) }
        }
    }
}

/* ======================= Sparemål ======================= */

private fun statusOf51(s: String): Pair<String, String> = when (s) {
    "done" -> "Nådd" to "ok"; "on_track" -> "I rute" to "ok"; "behind" -> "Bak skjema" to "warn"; "overdue" -> "Fristen er ute" to "warn"; else -> "Uten frist" to "mut"
}

@Composable
private fun Goals51(vm: AppViewModel, d: JSONObject) {
    val goals = d.arr51("items")
    val accounts = d.arr51("accounts")
    Cols51(
        left = {
            if (goals.isEmpty()) Empty51("Ingen sparemål ennå", "Lag et mål med beløp, frist og bilde. Planlegging viser fremdriften og hvor mye du må spare i måneden, og foreslår å runde opp kjøpene dine til målet.")
            goals.forEach { g -> key(g.str51("id")) { Goal51(vm, g, accounts) } }
            NewGoal51(vm, accounts)
        },
        right = {
            d.obj51("totals")?.takeIf { goals.isNotEmpty() }?.let { t ->
                Card51 {
                    PLabel("Totalt spart")
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PSerif(kr51(t.num51("saved")), 28.sp)
                        Text("av ${kr51(t.num51("target"))}", color = PaperPal.current.mut, fontSize = 13.sp, modifier = Modifier.padding(bottom = 4.dp))
                    }
                    Bar51(t.num51("pct"))
                }
            }
            d.obj51("roundUp")?.let { RoundUp51(vm, it, goals) }
        },
    )
}

@Composable
private fun RoundUp51(vm: AppViewModel, ru: JSONObject, goals: List<JSONObject>) {
    val p = PaperPal.current
    val count = ru.i43("count") ?: 0
    val amount = ru.num51("amount")
    val step = ru.i43("step") ?: 10
    val steps = ru.optJSONArray("steps").strs51().ifEmpty { listOf("5", "10", "20", "50", "100") }
    Card51 {
        PLabel("Rund opp")
        PSerif(if (count > 0) "${kr51(amount, true)} klar til sparing" else "Ingenting å runde opp nå", 20.sp)
        Text("${ru.str51("text")}. Kjøp fra ${dl51(ru.s43("from"))} til ${dl51(ru.s43("until"))} rundes opp til nærmeste $step kr.", color = p.mut, fontSize = 13.sp)
        Choice51(steps.map { it to "$it kr" }, step.toString()) { s ->
            vm.act51("ru-step", "PUT", Api.FINANS, "/fin51/roundup", JSONObject().put("step", s.toInt()), reload = listOf("goals"))
        }
        ru.arr51("sample").take(5).forEachIndexed { i, x ->
            Line51(x.str51("name"), "${dl51(x.s43("date"))} · ${kr51(x.num51("amount"), true)}", "+${num51(x.num51("roundUp"), 2)} kr", p.pos, top = i > 0)
        }
        if (goals.isNotEmpty()) {
            val gid = ru.s43("goalId") ?: goals.first().str51("id")
            Text("Til sparemål", color = p.mut, fontSize = 12.sp)
            Choice51(goals.map { it.str51("id") to it.str51("name") }, gid) { g ->
                vm.act51("ru-goal", "PUT", Api.FINANS, "/fin51/roundup", JSONObject().put("goalId", id51(g)), reload = listOf("goals"))
            }
            if (count > 0) Btn51("Sett inn ${kr51(amount, true)}", "ink", busy = F51.acting == "ru-apply", modifier = Modifier.fillMaxWidth()) {
                vm.act51("ru-apply", "POST", Api.FINANS, "/fin51/roundup/apply", JSONObject().put("goalId", id51(gid)), reload = listOf("goals")) { r ->
                    val a = r.obj51("applied")
                    F51.toast = a?.s43("transferHint") ?: "${kr51(a?.num51("amount") ?: amount, true)} satt inn på «${r.obj51("goal")?.str51("name") ?: ""}»"
                }
            }
        } else Text("Lag et sparemål for å bruke rund opp.", color = p.mut, fontSize = 13.sp)
    }
}

@Composable
private fun Goal51(vm: AppViewModel, g: JSONObject, accounts: List<JSONObject>) {
    val p = PaperPal.current
    val id = g.str51("id")
    var mode by remember(id) { mutableStateOf("") } // "", "dep", "edit"
    var askDel by remember(id) { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { vm.goalImage51(id, it) } }
    val color = hex51(g.s43("color")) ?: p.pos
    if (mode == "edit") { GoalForm51(vm, g, accounts) { mode = "" }; return }
    Card51 {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            NetImg51(vm, g.s43("imageUrl"), null, Modifier.size(56.dp).clip(RoundedCornerShape(14.dp))) {
                Box(Modifier.fillMaxSize().background(color), contentAlignment = Alignment.Center) {
                    Text(g.str51("name").take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                }
            }
            Column(Modifier.weight(1f)) {
                PSerif(g.str51("name"), 20.sp, maxLines = 2)
                val sub = listOfNotNull(g.s43("deadlineLabel")?.let { "Frist $it" } ?: "Ingen frist", g.s43("account")?.let { "følger $it" }).joinToString(" · ")
                Text(sub, color = p.mut, fontSize = 12.5.sp)
            }
            val (st, tone) = statusOf51(g.str51("status"))
            Tag51(st, tone)
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(kr51(g.num51("saved")), color = p.ink, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Text("av ${kr51(g.num51("target"))} · ${num51(g.num51("pct"), if (g.num51("pct") % 1.0 > 0.05) 1 else 0)} %", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(bottom = 2.dp))
        }
        Bar51(g.num51("pct"), color)
        val pace = g.num51("pace")
        Text(g.str51("statusText") + if (pace > 0) " · tempo ${kr51(pace)}/mnd" else "", color = p.ink, fontSize = 13.sp)
        if (mode == "dep") Deposit51(vm, id) { mode = "" }
        FlowRow51 {
            if (!g.optBoolean("followsAccount")) Btn51("Sett inn") { mode = if (mode == "dep") "" else "dep" }
            Btn51("Endre") { mode = "edit" }
            Btn51(if (g.s43("imageUrl") != null) "Bytt bilde" else "Bilde", busy = F51.acting == "img$id") { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            if (g.s43("imageUrl") != null) Btn51("Fjern bilde") { vm.act51("img-del", "DELETE", Api.FINANS, "/fin51/goals/$id/image", reload = listOf("goals")) }
            Btn51("Slett") { askDel = true }
        }
    }
    if (askDel) Confirm51("Slette sparemålet?", "«${g.str51("name")}» og historikken slettes. Pengene på kontoen påvirkes ikke.", "Slett", { askDel = false }) {
        vm.act51("goal-del", "DELETE", Api.FINANS, "/fin51/goals/$id", ok = "Sparemålet er slettet", reload = listOf("goals"))
    }
}

/** Knapper som brytes til neste linje på smale skjermer. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FlowRow51(content: @Composable () -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
}

@Composable
private fun Deposit51(vm: AppViewModel, id: String, done: () -> Unit) {
    var amt by remember { mutableStateOf("") }
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PField("Beløp (minus for uttak)", amt, { amt = it }, Modifier.weight(1f), "500", KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Done))
        Btn51("Sett inn", "ink", busy = F51.acting == "dep") {
            val a = parse51(amt)
            if (a == null || a == 0.0) { F51.toast = "Skriv et beløp"; return@Btn51 }
            vm.act51("dep", "POST", Api.FINANS, "/fin51/goals/$id/deposit", JSONObject().put("amount", a),
                ok = if (a > 0) "${kr51(a, true)} satt inn" else "${kr51(-a, true)} tatt ut", reload = listOf("goals")) { done() }
        }
    }
}

@Composable
private fun NewGoal51(vm: AppViewModel, accounts: List<JSONObject>) {
    var open by remember { mutableStateOf(false) }
    if (open) GoalForm51(vm, null, accounts) { open = false }
    else PButton("+ Nytt sparemål", Modifier.fillMaxWidth(), kind = "line", height = 52.dp) { open = true }
}

private val GOALCOLORS51 = listOf("#2f7a4f", "#2b5d8a", "#b23a2a", "#c08a1e", "#6b4fa0", "#1b1a17")

@Composable
private fun GoalForm51(vm: AppViewModel, g: JSONObject?, accounts: List<JSONObject>, close: () -> Unit) {
    val p = PaperPal.current
    var name by remember { mutableStateOf(g?.str51("name").orEmpty()) }
    var target by remember { mutableStateOf(g?.d43("target")?.let { num51(it) }.orEmpty()) }
    var saved by remember { mutableStateOf("") }
    var deadline by remember { mutableStateOf(g?.s43("deadline")?.take(10).orEmpty()) }
    var color by remember { mutableStateOf(g?.s43("color") ?: GOALCOLORS51.first()) }
    var acc by remember { mutableStateOf(g?.s43("accountId").orEmpty()) }
    Card51 {
        PSerif(if (g == null) "Nytt sparemål" else "Endre «${g.str51("name")}»", 20.sp)
        PField("Navn", name, { name = it.take(60) }, placeholder = "F.eks. Japan-tur")
        PField("Målbeløp (kr)", target, { target = it }, placeholder = "30 000", keyboard = KeyboardOptions(keyboardType = KeyboardType.Decimal))
        if (g == null) PField("Allerede spart (kr)", saved, { saved = it }, placeholder = "0", keyboard = KeyboardOptions(keyboardType = KeyboardType.Decimal))
        PField("Frist (ÅÅÅÅ-MM-DD)", deadline, { deadline = it.take(10) }, placeholder = "2026-06-30", keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
        Text("Farge", color = p.mut, fontSize = 12.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GOALCOLORS51.forEach { c ->
                val on = c.equals(color, true)
                Box(
                    Modifier.size(48.dp).clip(CircleShape).clickable { color = c }.semantics { contentDescription = "Farge $c" + if (on) ", valgt" else "" },
                    contentAlignment = Alignment.Center,
                ) { Box(Modifier.size(if (on) 34.dp else 28.dp).clip(CircleShape).background(hex51(c) ?: p.ink)) }
            }
        }
        if (accounts.isNotEmpty()) {
            Text("Følg en sparekonto", color = p.mut, fontSize = 12.sp)
            Choice51(listOf("" to "Nei – jeg registrerer selv") + accounts.map { it.str51("id") to "${it.str51("name")} (${kr51(it.num51("balance"))})" }, acc) { acc = it }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Btn51(if (g == null) "Lag sparemål" else "Lagre", "ink", busy = F51.acting == "goal") {
                val t = parse51(target)
                if (name.isBlank() || t == null || t <= 0) { F51.toast = "Navn og målbeløp må fylles ut"; return@Btn51 }
                if (deadline.isNotBlank() && !Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(deadline)) { F51.toast = "Skriv fristen som ÅÅÅÅ-MM-DD"; return@Btn51 }
                val body = JSONObject().put("name", name.trim()).put("target", t).put("color", color)
                    .put("deadline", deadline.ifBlank { JSONObject.NULL }).put("accountId", if (acc.isBlank()) JSONObject.NULL else id51(acc))
                parse51(saved)?.let { if (g == null) body.put("saved", it) }
                if (g == null) vm.act51("goal", "POST", Api.FINANS, "/fin51/goals", body, ok = "Sparemålet er laget", reload = listOf("goals")) { close() }
                else vm.act51("goal", "PATCH", Api.FINANS, "/fin51/goals/${g.str51("id")}", body, ok = "Lagret", reload = listOf("goals")) { close() }
            }
            Btn51("Avbryt") { close() }
        }
    }
}

/* ======================= Kalender ======================= */

private fun kindLabel51(k: String) = when (k) { "sub" -> "Abonnement"; "recurring" -> "Fast utgift"; "detected" -> "Funnet"; "income" -> "Inntekt"; else -> "" }

@Composable
private fun Cal51(vm: AppViewModel, d: JSONObject) {
    val p = PaperPal.current
    val accs = d.arr51("accounts")
    val selId = F51.opt("cal.acc", "all")
    val sel = accs.firstOrNull { it.str51("id") == selId }
    // «Alle kontoer»: summen av saldoene (kredittkort holdes utenfor, som på web).
    val series: List<Pair<String, Double>> = remember(d, selId) {
        if (sel != null) sel.arr51("series").map { it.str51("date") to it.num51("balance") }
        else {
            val base = accs.firstOrNull()?.arr51("series").orEmpty()
            base.mapIndexed { i, s -> s.str51("date") to accs.filter { it.str51("type") != "credit" }.sumOf { a -> a.arr51("series").getOrNull(i)?.num51("balance") ?: 0.0 } }
        }
    }
    val start = sel?.num51("start") ?: accs.filter { it.str51("type") != "credit" }.sumOf { it.num51("start") }
    val end = series.lastOrNull()?.second ?: start
    val days = d.arr51("days")
    Cols51(
        left = {
            Card51 {
                PLabel("Saldoprognose · ${dl51(d.s43("from"))}–${dl51(d.s43("to"))}")
                PSerif(kr51(end), 28.sp)
                Text("om ${days.size} dager (nå ${kr51(start)})", color = p.mut, fontSize = 13.sp)
                Choice51(listOf("30" to "30 dager", "60" to "60 dager", "90" to "90 dager"), F51.opt("cal.days", "30")) { F51.ui["cal.days"] = it; vm.load51("cal", force = true) }
                if (accs.size > 1) Choice51(listOf("all" to "Alle kontoer") + accs.map { it.str51("id") to it.str51("name") }, if (sel == null) "all" else selId) { F51.ui["cal.acc"] = it }
                val minI = series.indices.minByOrNull { series[it].second }
                Spark51(series.map { it.second }, "Saldo de neste ${series.size} dagene" + (minI?.let { ", lavest ${kr51(series[it].second)} ${dl51(series[it].first)}" } ?: ""))
                val tot = d.obj51("total")
                if (tot != null) Text("Ut ${kr51(tot.num51("out"))} · Inn ${kr51(tot.num51("in"))} · ${tot.i43("count") ?: 0} trekk og innbetalinger", color = p.ink, fontSize = 13.sp)
                d.obj51("lowest")?.let { lo ->
                    Text("Lavest: ${kr51(lo.num51("balance"))} ${dl51(lo.s43("date"))} (${lo.str51("account")})", color = if (lo.num51("balance") < 0) p.lab else p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                d.optJSONArray("warnings").strs51().forEach { w -> Text(w, color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
                d.obj51("unassigned")?.s43("text")?.let { Text(it, color = p.mut, fontSize = 12.5.sp) }
            }
        },
        right = {
            Card51 {
                PSerif("Neste ${days.size} dager", 20.sp)
                val shown = days.filter { x -> x.optBoolean("today") || x.arr51("items").any { sel == null || it.str51("accountId") == selId } }
                if (shown.isEmpty()) Text("Ingen faste trekk i perioden.", color = p.mut, fontSize = 13.sp)
                shown.forEach { x -> key(x.str51("date")) { Day51(x, series, sel == null, selId) } }
                Text("Kilder: abonnementer, faste utgifter, gjentakende trekk funnet i transaksjonene og inntekter som kommer hver måned. Samme tjeneste telles bare én gang.",
                    color = p.mut, fontSize = 12.sp)
            }
        },
    )
}

@Composable
private fun Day51(x: JSONObject, series: List<Pair<String, Double>>, all: Boolean, selId: String) {
    val p = PaperPal.current
    val items = x.arr51("items").filter { all || it.str51("accountId") == selId }
    val bal = series.firstOrNull { it.first == x.str51("date") }?.second
    Column(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(if (x.optBoolean("today")) p.ink else p.line))
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(x.str51("label").replaceFirstChar { it.uppercase() } + if (x.optBoolean("today")) " · i dag" else "", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
            if (bal != null) Text("Saldo ${kr51(bal)}", color = if (bal < 0) p.lab else p.mut, fontSize = 12.5.sp)
        }
        if (items.isEmpty()) Text("Ingen trekk", color = p.mut, fontSize = 12.5.sp)
        items.forEach { it2 ->
            val amt = it2.num51("amount")
            Line51(it2.str51("name"), kindLabel51(it2.str51("kind")) + (it2.s43("account")?.takeIf { all }?.let { " · $it" } ?: ""), krS51(amt), if (amt > 0) p.pos else p.ink, top = false)
        }
    }
}

/* ======================= Skatt ======================= */

private fun srcLabel51(s: String) = when (s) { "transaksjoner" -> "Fra transaksjonene"; "registrert" -> "Registrert av deg"; "anslag" -> "Anslag"; "mangler" -> "Ikke funnet"; else -> s }

@Composable
private fun Tax51(vm: AppViewModel, d: JSONObject) {
    val p = PaperPal.current
    val year = d.i43("year") ?: java.time.LocalDate.now().year - 1
    val y0 = java.time.LocalDate.now().year
    Cols51(
        left = {
            d.obj51("reminder")?.takeIf { it.optBoolean("show") }?.let { r ->
                Card51 {
                    PLabel("Skattemeldingen")
                    Text(r.str51("text"), color = p.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    r.s43("url")?.let { u -> val ctx = LocalContext.current; Btn51("Åpne skatteetaten.no") { runCatching { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(u))) } } }
                }
            }
            Card51 {
                PLabel("Skattehjelp · inntektsåret $year")
                val tot = d.obj51("total")
                PSerif(kr51(tot?.num51("value") ?: 0.0), 28.sp)
                Text("anslått skatteverdi av ${kr51(tot?.num51("deduction") ?: 0.0)} i fradrag", color = p.mut, fontSize = 13.sp)
                Choice51(listOf(y0, y0 - 1, y0 - 2).map { it.toString() to it.toString() }, year.toString()) { F51.ui["tax.year"] = it; vm.load51("tax", force = true) }
                Text("Forbehold: " + d.str51("disclaimer") + (d.s43("ratesNote")?.let { " $it" } ?: ""), color = p.mut, fontSize = 12.sp)
                FlowRow51 {
                    Btn51("Del CSV", busy = F51.acting == "export") { vm.shareExport51("/fin51/tax/export.csv?year=$year", "skattehjelp-$year.csv", "text/csv") }
                    Btn51("Utskrift / PDF", busy = F51.acting == "export") { vm.shareExport51("/fin51/tax/export.html?year=$year", "skattehjelp-$year.html", "text/html") }
                }
            }
            Card51 {
                PSerif("Fradragsposter", 20.sp)
                d.arr51("items").forEachIndexed { i, t -> key(t.str51("key")) { TaxItem51(t, i > 0) } }
            }
        },
        right = { TaxProfile51(vm, d.obj51("profile") ?: JSONObject(), year) },
    )
}

@Composable
private fun TaxItem51(t: JSONObject, top: Boolean) {
    val p = PaperPal.current
    var open by remember { mutableStateOf(false) }
    val skatte = t.str51("kind") == "skattefradrag"
    val sources = t.arr51("sources")
    Column(Modifier.fillMaxWidth()) {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(t.str51("title"), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                t.s43("note")?.let { Text(it, color = p.mut, fontSize = 12.5.sp) }
                val orgs = t.arr51("orgs")
                if (orgs.isNotEmpty()) Text(orgs.joinToString(" · ") { o -> "${o.str51("org")} ${kr51(o.num51("amount"))}" + if (o.optBoolean("counts", true)) "" else " (under 500 kr)" }, color = p.mut, fontSize = 12.5.sp)
                t.s43("missing")?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(kr51(if (skatte) t.num51("basis") else t.num51("deduction")), color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text("${if (skatte) "grunnlag" else "fradrag"} · verdi ${kr51(t.num51("value"))}", color = p.mut, fontSize = 11.5.sp)
                val src = t.str51("source")
                Tag51(srcLabel51(src), when (src) { "mangler" -> "mut"; "anslag" -> "warn"; else -> "ok" })
            }
        }
        if (sources.isNotEmpty()) {
            Text(if (open) "Skjul transaksjonene" else "${sources.size} transaksjoner ›", color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.heightIn(min = 40.dp).clickable { open = !open }.padding(vertical = 8.dp))
            if (open) sources.forEach { s -> Line51(s.str51("name"), s.s43("date"), kr51(s.num51("amount"), true), top = false) }
        }
    }
}

@Composable
private fun TaxProfile51(vm: AppViewModel, pr: JSONObject, year: Int) {
    val p = PaperPal.current
    fun v(k: String) = pr.d43(k)?.takeIf { it != 0.0 }?.let { num51(it, if (it % 1.0 > 0.004) 2 else 0) }.orEmpty()
    var km by remember(pr) { mutableStateOf(v("commuteKm")) }
    var days by remember(pr) { mutableStateOf(pr.i43("workDays")?.toString() ?: "230") }
    var loan by remember(pr) { mutableStateOf(v("loanInterest")) }
    var union by remember(pr) { mutableStateOf(v("union")) }
    var bsu by remember(pr) { mutableStateOf(v("bsu")) }
    var ips by remember(pr) { mutableStateOf(v("ips")) }
    var gifts by remember(pr) { mutableStateOf(pr.arr51("gifts").joinToString("\n") { "${it.str51("org")}: ${num51(it.num51("amount"))}" }) }
    var remind by remember(pr) { mutableStateOf(pr.optBoolean("remind", true)) }
    val dec = KeyboardOptions(keyboardType = KeyboardType.Decimal)
    Card51 {
        PSerif("Det du vet best selv", 20.sp)
        Text("Brukes i anslaget for $year. Lagres bare for deg.", color = p.mut, fontSize = 12.5.sp)
        PField("Avstand til jobben, én vei (km)", km, { km = it }, keyboard = dec)
        PField("Arbeidsdager i året", days, { days = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
        PField("Renter på lån (kr, hvis ikke i transaksjonene)", loan, { loan = it }, keyboard = dec)
        PField("Fagforening (kr, i tillegg)", union, { union = it }, keyboard = dec)
        PField("BSU-innskudd i året (kr)", bsu, { bsu = it }, keyboard = dec)
        PField("IPS-innskudd i året (kr)", ips, { ips = it }, keyboard = dec)
        Text("Andre gaver – én per linje: «Organisasjon: beløp»", color = p.mut, fontSize = 12.sp)
        androidx.compose.foundation.text.BasicTextField(
            gifts, { gifts = it.take(2000) },
            textStyle = androidx.compose.ui.text.TextStyle(color = p.ink, fontSize = 15.sp, fontFamily = PaperFonts.sans),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(p.lab),
            modifier = Modifier.fillMaxWidth().heightIn(min = 72.dp).clip(RoundedCornerShape(12.dp)).background(p.surf2).padding(12.dp)
                .semantics { contentDescription = "Andre gaver" },
        )
        PToggle("Påminnelse om skattemeldingen", "Når den kommer (mars) og før fristen (april)", remind) { remind = it }
        Btn51("Lagre", "ink", busy = F51.acting == "tax-profile") {
            val g = JSONArray()
            gifts.lines().mapNotNull { l -> val i = l.lastIndexOf(':'); if (i <= 0) null else l.substring(0, i).trim() to parse51(l.substring(i + 1).trim()) }
                .filter { it.first.isNotBlank() && (it.second ?: 0.0) > 0 }.forEach { g.put(JSONObject().put("org", it.first).put("amount", it.second)) }
            val body = JSONObject().put("commuteKm", parse51(km) ?: 0.0).put("workDays", parse51(days)?.toInt() ?: 230).put("loanInterest", parse51(loan) ?: 0.0)
                .put("union", parse51(union) ?: 0.0).put("bsu", parse51(bsu) ?: 0.0).put("ips", parse51(ips) ?: 0.0).put("gifts", g).put("remind", remind)
            vm.act51("tax-profile", "PUT", Api.FINANS, "/fin51/tax/profile", body, ok = "Lagret", reload = listOf("tax"))
        }
    }
}

/* ======================= Priser ======================= */

@Composable
private fun Prices51(vm: AppViewModel, d: JSONObject) {
    val p = PaperPal.current
    var q by remember { mutableStateOf(F51.opt("pris.q", "")) }
    val items = d.arr51("items")
    Cols51(
        left = {
            Card51 {
                PField("Søk etter vare eller butikk", q, { q = it }, placeholder = "melk, REMA …", keyboard = KeyboardOptions(imeAction = ImeAction.Search),
                    onDone = { F51.ui["pris.q"] = q.trim(); vm.load51("prices", force = true) })
                Choice51(listOf("change" to "Mest økt", "count" to "Mest kjøpt", "name" to "Navn"), F51.opt("pris.sort", "change")) { F51.ui["pris.sort"] = it; vm.load51("prices", force = true) }
                if (items.isEmpty()) Text(if (F51.opt("pris.q", "").isNotBlank()) "Ingen varer passer søket." else "Ingen varelinjer ennå. Skann kvitteringer med varelinjer, så følger FinansHub prisene for deg.",
                    color = p.mut, fontSize = 13.sp)
                items.forEachIndexed { i, it -> key(it.str51("key")) { PriceRow51(vm, it, i > 0) } }
            }
        },
        right = {
            d.obj51("basket")?.let { b ->
                Card51 {
                    PLabel("Billigste butikk for det du kjøper")
                    PSerif(b.str51("text"), 19.sp)
                    val stores = b.arr51("stores")
                    val first = stores.firstOrNull()?.num51("index") ?: 0.0
                    stores.forEachIndexed { i, s ->
                        Line51(s.str51("store"), "${s.i43("items") ?: 0} varer sammenlignet · billigst på ${s.i43("cheapestFor") ?: 0}",
                            if (i == 0) "billigst" else "+${num51(s.num51("index") - first)} %", if (i == 0) p.pos else p.ink, top = i > 0)
                    }
                    Text("${d.i43("receipts") ?: 0} kvitteringer · ${d.i43("count") ?: 0} varer · ${d.i43("raised") ?: 0} har økt minst 5 %", color = p.mut, fontSize = 12.5.sp)
                }
            }
        },
    )
}

@Composable
private fun PriceRow51(vm: AppViewModel, it: JSONObject, top: Boolean) {
    val p = PaperPal.current
    val k = it.str51("key")
    val open = F51.ui["pris.open"] == k
    val last = it.obj51("last")
    val ch = it.num51("changePct")
    Column(Modifier.fillMaxWidth()) {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Column(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClickLabel = if (open) "Lukk" else "Vis prisene") {
                if (open) F51.ui.remove("pris.open") else { F51.ui["pris.open"] = k; F51.data.remove("priceItem"); vm.load51("priceItem", force = true) }
            }.padding(vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(it.str51("name"), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
            Text("${num51(last?.num51("price") ?: 0.0, 2)} kr/${it.str51("unit", "stk")} · ${last?.str51("store").orEmpty()} · ${it.i43("count") ?: 0} kjøp", color = p.mut, fontSize = 12.5.sp)
            Text(it.str51("changeText"), color = if (ch >= 1) p.lab else if (ch <= -1) p.pos else p.mut, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
            it.obj51("cheapest")?.let { c -> Text("Billigst: ${c.str51("store")} ${num51(c.num51("price"), 2)} kr (−${num51(c.num51("savingPct"))} %)", color = p.mut, fontSize = 12.5.sp) }
        }
        if (open) {
            val det = F51.data["priceItem"]?.takeIf { d -> d.str51("key") == k }
            if (det == null) { if (F51.err["priceItem"] != null) Text(F51.err["priceItem"]!!, color = p.lab, fontSize = 13.sp) else Loading51() }
            else {
                PriceChart51(det.arr51("points"))
                it.arr51("stores").forEach { s ->
                    Line51(s.str51("store"), "sist ${dl51(s.s43("lastDate"))} · laveste ${num51(s.num51("min"), 2)} kr · ${s.i43("count") ?: 0} kjøp", "${num51(s.num51("last"), 2)} kr", top = false)
                }
            }
        }
    }
}

private val STORECOLORS51 = listOf(Color(0xFF2B5D8A), Color(0xFFB23A2A), Color(0xFF2F7A4F), Color(0xFFC08A1E), Color(0xFF6B4FA0))

/** Pris over tid, én linje per butikk. */
@Composable
private fun PriceChart51(points: List<JSONObject>) {
    if (points.isEmpty()) return
    val p = PaperPal.current
    val stores = points.map { it.str51("store") }.distinct()
    val pts = points.mapNotNull { o -> runCatching { java.time.LocalDate.parse(o.str51("date").take(10)).toEpochDay() }.getOrNull()?.let { Triple(it, o.num51("price"), o.str51("store")) } }
    if (pts.isEmpty()) return
    val lo = pts.minOf { it.second } * 0.95; val hi = pts.maxOf { it.second } * 1.05
    val t0 = pts.minOf { it.first }; val t1 = maxOf(t0 + 1, pts.maxOf { it.first })
    Canvas(Modifier.fillMaxWidth().height(120.dp).semantics { contentDescription = "Pris over tid for ${stores.joinToString(", ")}" }) {
        fun x(t: Long) = 10f + (t - t0).toFloat() / (t1 - t0) * (size.width - 20f)
        fun y(v: Double) = size.height - 10f - ((v - lo) / (hi - lo).coerceAtLeast(0.01)).toFloat() * (size.height - 20f)
        stores.forEachIndexed { si, s ->
            val c = STORECOLORS51[si % STORECOLORS51.size]
            val ps = pts.filter { it.third == s }.sortedBy { it.first }
            val path = Path()
            ps.forEachIndexed { i, pt -> if (i == 0) path.moveTo(x(pt.first), y(pt.second)) else path.lineTo(x(pt.first), y(pt.second)) }
            drawPath(path, c, style = Stroke(width = 3f))
            ps.forEach { pt -> drawCircle(c, 5f, Offset(x(pt.first), y(pt.second))) }
        }
    }
    FlowRow51 {
        stores.forEachIndexed { si, s ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(STORECOLORS51[si % STORECOLORS51.size]))
                Text(s, color = p.ink, fontSize = 12.sp)
            }
        }
    }
}

/* ======================= Abonnementsjeger ======================= */

@Composable
private fun Hunter51(vm: AppViewModel, d: JSONObject) {
    val p = PaperPal.current
    val sum = d.obj51("summary") ?: JSONObject()
    val finds = d.arr51("findings")
    Cols51(
        left = {
            if (finds.isEmpty()) Empty51("Ingen funn akkurat nå", "Jegeren ser etter prisøkninger i banktrekkene, doble abonnementer og abonnementer uten bruk.")
            finds.forEach { f -> key(f.str51("key")) { Finding51(vm, f) } }
            Text("Oppsigelsesteksten skrives av en lokal modell på hjemmeserveren og sendes aldri automatisk.", color = p.mut, fontSize = 12.sp)
        },
        right = {
            Card51 {
                PLabel("Abonnementsjeger")
                PSerif(kr51(sum.num51("monthlySaving")), 28.sp)
                Text("per måned å spare (${kr51(sum.num51("yearlySaving"))} i året)", color = p.mut, fontSize = 13.sp)
                Text("Ubrukt etter", color = p.mut, fontSize = 12.sp)
                Choice51(listOf("4", "6", "8", "12").map { it to "$it uker" }, (d.i43("weeks") ?: 6).toString()) { F51.ui["jakt.weeks"] = it; vm.load51("hunter", force = true) }
                Text(sum.str51("text") + ". " + d.obj51("signals")?.str51("note").orEmpty(), color = p.ink, fontSize = 13.sp)
                val dis = sum.i43("dismissed") ?: 0
                if (dis > 0) Btn51("Vis $dis skjulte igjen") { vm.act51("undismiss", "DELETE", Api.FINANS, "/fin51/hunter/dismiss", reload = listOf("hunter")) }
            }
        },
    )
}

@Composable
private fun Finding51(vm: AppViewModel, f: JSONObject) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val kind = f.str51("kind")
    val (lab, tone) = when (kind) { "price_up" -> "Prisøkning" to "warn"; "double" -> "Dobbelt" to "warn"; "unused" -> "Ubrukt" to "mut"; else -> kind to "mut" }
    val sid = f.s43("subId") ?: f.optJSONArray("subIds").strs51().lastOrNull()
    var draft by remember(f.str51("key")) { mutableStateOf<JSONObject?>(null) }
    Card51 {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Tag51(lab, tone)
                PSerif(f.str51("title"), 19.sp)
                Text(f.str51("text"), color = p.ink, fontSize = 13.sp)
            }
            val sv = f.num51("saving")
            if (sv > 0) Column(horizontalAlignment = Alignment.End) {
                Text(kr51(sv), color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text("per mnd", color = p.mut, fontSize = 11.5.sp)
            }
        }
        FlowRow51 {
            if (kind == "unused" && f.s43("subId") != null) Btn51("Jeg bruker den") {
                vm.act51("used", "POST", Api.FINANS, "/fin51/hunter/used", JSONObject().put("subId", id51(f.str51("subId"))), ok = "Merket som brukt", reload = listOf("hunter"))
            }
            if (sid != null) Btn51("Skriv oppsigelse", busy = F51.acting == "draft${f.str51("key")}") {
                vm.act51("draft${f.str51("key")}", "POST", Api.FINANS, "/fin51/hunter/draft", JSONObject().put("subId", id51(sid))) { draft = it }
            }
            Btn51("Skjul") { vm.act51("dismiss", "POST", Api.FINANS, "/fin51/hunter/dismiss", JSONObject().put("key", f.str51("key")), reload = listOf("hunter")) }
        }
        if (F51.acting == "draft${f.str51("key")}") Text("Skriver med den lokale modellen …", color = p.mut, fontSize = 13.sp)
        draft?.let { dr ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.surf2).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(dr.str51("subject"), color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text(dr.str51("text"), color = p.ink, fontSize = 13.5.sp)
                val eng = if (dr.str51("engine") == "lokal") "Skrevet av lokal modell" + (dr.s43("model")?.let { " ($it)" } ?: "") else "Mal"
                Text(eng + (dr.s43("notice")?.let { " · $it" } ?: "") + ". " + dr.str51("note"), color = p.mut, fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Btn51("Kopier", "ink") {
                        val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                        cm?.setPrimaryClip(ClipData.newPlainText("Oppsigelse", dr.str51("subject") + "\n\n" + dr.str51("text")))
                        F51.toast = "Kopiert – lim inn i e-post eller kontaktskjema"
                    }
                    Btn51("Lukk") { draft = null }
                }
            }
        }
    }
}
