package no.kristo.finanshub.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import org.json.JSONObject

/*
 * Prompt 51 (ANDFEAT51): felles søk over alle moduler – WEBX51 `GET /api/search51` ($S/SERVER51-API.md §1).
 *  - Egen side (Pages51 «sok»): felt øverst, treff gruppert etter type, uthevet treff i tittelen, 0–3 handlinger per treff
 *    (open → riktig skjerm i appen, http → samme API som modulen, copy → utklippstavlen; bekreftelse når `confirm` er satt).
 *    Tomt felt viser hurtighandlinger og nylige søk. Trykk på et treff lagrer søket som nylig (POST /api/search51/recent).
 *  - På Hjem: når du skriver i søkefeltet, vises de tre beste treffene under feltet med «Søk i alt ›» (Search51Hint).
 *  - Åpnes også fra profilmenyen og finanshub://sok.
 */

object S51 {
    var q by mutableStateOf("")
    var res by mutableStateOf<JSONObject?>(null)
    var busy by mutableStateOf(false)
    var err by mutableStateOf<String?>(null)
    /** Hjem: siste spørring og svar for hintet under søkefeltet. */
    var hintQ by mutableStateOf("")
    var hint by mutableStateOf<JSONObject?>(null)
}

private suspend fun AppViewModel.search51(q: String, limit: Int): JSONObject =
    JSONObject(api51 { hlGet("/search51?q=" + enc51(q.take(200)) + "&limit=$limit", timeout = 8000) })

@Composable
internal fun Search51Page(vm: AppViewModel) {
    val p = PaperPal.current
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    LaunchedEffect(S51.q, vm.activeId) {
        delay(if (S51.q.isBlank()) 0 else 220)
        S51.busy = true
        try { S51.res = vm.search51(S51.q, 30); S51.err = null } catch (e: ApiException) {
            S51.err = if (e.status == 404) "Serveren har ikke felles søk ennå. Oppdater Homelab." else e.message
        } catch (e: Exception) { S51.err = e.message ?: "Kunne ikke søke" } finally { S51.busy = false }
    }
    Page51("Søk i alt", "Homelab") {
        Row(
            Modifier.fillMaxWidth().height(52.dp).clip(CircleShape).background(p.card).padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BasicTextField(
                S51.q, { S51.q = it.take(200) }, singleLine = true,
                textStyle = TextStyle(color = p.ink, fontSize = 16.sp, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium),
                cursorBrush = SolidColor(p.lab),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { S51.res?.arr51("results")?.firstOrNull()?.let { run51(vm, it, null) } }),
                modifier = Modifier.weight(1f).focusRequester(focus).semantics { contentDescription = "Søk i alt" },
                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (S51.q.isEmpty()) Text("Gjøremål, kvitteringer, steder, personer …", color = p.mut, fontSize = 16.sp, maxLines = 1); inner() } },
            )
            if (S51.q.isNotEmpty()) Box(
                Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Tøm søket") { S51.q = "" }.semantics { contentDescription = "Tøm søket" },
                contentAlignment = Alignment.Center,
            ) { Text("✕", color = p.mut, fontSize = 16.sp) }
        }
        val r = S51.res
        S51.err?.let { Text(it, color = p.lab, fontSize = 13.5.sp) }
        if (r == null) { if (S51.busy) Loading51("Søker …") }
        else Results51(vm, r)
    }
}

@Composable
private fun Results51(vm: AppViewModel, r: JSONObject) {
    val p = PaperPal.current
    val results = r.arr51("results")
    val recent = r.optJSONArray("recent").strs51()
    if (S51.q.isBlank() && recent.isNotEmpty()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PLabel("Nylige søk", p.mut, modifier = Modifier.weight(1f))
            Text("Tøm", color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.heightIn(min = 48.dp).clickable {
                vm.act51("recent-clear", "DELETE", "", "/api/search51/recent") { S51.res = S51.res?.let { JSONObject(it.toString()).put("recent", org.json.JSONArray()) } }
            }.padding(12.dp))
        }
        FlowRow51 { recent.forEach { q -> Box(Modifier.heightIn(min = 48.dp), contentAlignment = Alignment.Center) { PChip(q, false) { S51.q = q } } } }
    }
    if (results.isEmpty() && S51.q.isNotBlank() && !S51.busy) Text("Ingen treff for «${S51.q}».", color = p.mut, fontSize = 14.sp)
    val label = r.s43("engine")?.let { if (it.contains("vektor")) "Fulltekst + betydning" else "Fulltekst" }
    if (S51.q.isNotBlank() && results.isNotEmpty() && label != null) Text("${results.size} treff · $label · ${r.i43("ms") ?: 0} ms", color = p.mut, fontSize = 12.sp)
    results.groupBy { it.str51("typeLabel", it.str51("type")) }.forEach { (g, list) ->
        PLabel(g, modifier = Modifier.padding(top = 6.dp))
        PCard {
            list.forEachIndexed { i, it -> key(it.str51("id")) { Result51(vm, it, i > 0) } }
        }
    }
}

private fun icon51(i: String): String = when (i) {
    "check" -> "✓"; "cart" -> "🛒"; "list" -> "☰"; "calendar" -> "📅"; "car" -> "🚗"; "receipt" -> "🧾"; "card" -> "💳"; "pin" -> "📍"; "person" -> "👤"
    "box" -> "📦"; "book" -> "📖"; "chat" -> "💬"; "cake" -> "🎂"; "home" -> "🏠"; "gear" -> "⚙"; "bolt" -> "⚡"; else -> "•"
}

/** Tittelen med treffene i fet skrift (match = [[fra, til], …]). */
private fun hl51(title: String, match: org.json.JSONArray?): AnnotatedString = buildAnnotatedString {
    val spans = (0 until (match?.length() ?: 0)).mapNotNull { i -> match!!.optJSONArray(i)?.let { a -> a.optInt(0) to a.optInt(1) } }
        .filter { (a, b) -> a in 0 until b && b <= title.length }.sortedBy { it.first }
    var at = 0
    for ((a, b) in spans) {
        if (a < at) continue
        append(title.substring(at, a))
        withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append(title.substring(a, b)) }
        at = b
    }
    if (at < title.length) append(title.substring(at))
}

@Composable
private fun Result51(vm: AppViewModel, r: JSONObject, top: Boolean) {
    val p = PaperPal.current
    val acts = r.arr51("actions")
    var ask by remember { mutableStateOf<JSONObject?>(null) }
    val ctx = LocalContext.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClickLabel = acts.firstOrNull()?.str51("label") ?: "Åpne") {
                val a = acts.firstOrNull()
                if (a?.s43("confirm") != null) ask = a else run51(vm, r, a, ctx)
            }.padding(14.dp, 10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(p.surf2), contentAlignment = Alignment.Center) {
                Text(icon51(r.str51("icon")), fontSize = 16.sp, color = p.ink)
            }
            Column(Modifier.weight(1f)) {
                Text(hl51(r.str51("title"), r.optJSONArray("match")), color = p.ink, fontSize = 14.5.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val sub = listOfNotNull(r.s43("subtitle"), r.s43("amountText") ?: r.d43("amount")?.let { kr51(it, true) }).joinToString(" · ")
                if (sub.isNotBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (acts.size > 1) Row(Modifier.padding(start = 62.dp, end = 14.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            acts.drop(1).take(2).forEach { a -> Btn51(a.str51("label")) { if (a.s43("confirm") != null) ask = a else run51(vm, r, a, ctx) } }
        }
    }
    ask?.let { a ->
        Confirm51(a.str51("label"), a.str51("confirm"), if (a.optBoolean("destructive")) "Slett" else "OK", { ask = null }) { run51(vm, r, a, ctx) }
    }
}

/** Utfører en handling (eller standard: åpne). */
internal fun run51(vm: AppViewModel, r: JSONObject, a: JSONObject?, ctx: Context? = null) {
    val q = S51.q.trim()
    if (q.isNotBlank()) vm.launch51 { runCatching { vm.api51 { hlPost("/search51/recent", JSONObject().put("q", q)) } } }
    when (a?.str51("kind") ?: "open") {
        "copy" -> {
            val cm = (ctx ?: vm.appCtx51).getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            cm?.setPrimaryClip(ClipData.newPlainText(r.str51("title"), a?.str51("value") ?: r.str51("title")))
            F51.toast = "Kopiert"
        }
        "http" -> {
            val url = a?.s43("url") ?: return
            val m = a.str51("method", "POST")
            val body = a.obj51("body") ?: if (m == "GET" || m == "DELETE") null else JSONObject()
            vm.act51("s51" + a.str51("id"), m, "", url, body, ok = a.str51("label") + " – ferdig") {
                // Søk på nytt, så treffet viser den nye tilstanden.
                vm.launch51 { runCatching { S51.res = vm.search51(S51.q, 30) } }
                if (url.contains("theme51")) vm.syncTheme51()
            }
        }
        else -> open51r(vm, r, a)
    }
}

/** «open»: til riktig skjerm i appen ut fra type (og nøkkelen i link.app for page/action); ukjent → nettleseren med web-lenken. */
private fun open51r(vm: AppViewModel, r: JSONObject, a: JSONObject?) {
    val link = r.obj51("link") ?: JSONObject()
    val type = r.str51("type")
    val ref = link.s43("ref") ?: r.str51("id").substringAfter(':')
    F51.pages.remove("sok")
    if (type == "page" || type == "action") {
        val key = link.s43("app")?.let { runCatching { Uri.parse(it).getQueryParameter("id") }.getOrNull() } ?: ref
        if (openKey51(vm, key)) return
    }
    fun dl(u: String) = vm.deepLink(Uri.parse(u))
    when (type) {
        "task", "shopping", "list" -> vm.openTasks()
        "event", "famtask" -> { F51.ui["fam.focus"] = ref; vm.open51("famcal") }
        "receipt", "line" -> dl("finanshub://review")
        "transaction" -> dl("finanshub://list")
        "place" -> dl("finanshub://familie/steder")
        "person" -> dl("finanshub://familie")
        "package" -> dl("finanshub://tracking")
        "chat" -> dl("finanshub://chat/$ref")
        "birthday" -> dl("finanshub://bursdager")
        "bolig" -> dl("finanshub://boliger")
        "study" -> vm.openStudy44()
        else -> link.s43("web")?.let { w -> openLink(vm.appCtx51, if (w.startsWith("/")) vm.base.trimEnd('/') + w else w) }
    }
}

/** Faste sider og hurtighandlinger (nøklene i SERVER51-API.md §1). */
private fun openKey51(vm: AppViewModel, key: String): Boolean {
    fun dl(u: String) = vm.deepLink(Uri.parse(u))
    when (key) {
        "dash" -> dl("finanshub://homelab")
        "gjoremal" -> vm.openTasks()
        "new-task", "shop" -> vm.openTasks(newTask = key == "new-task")
        "kalender" -> dl("finanshub://kalender")
        "familiekalender" -> vm.open51("famcal")
        "famcal-new" -> { F51.ui["fam.new"] = "1"; vm.open51("famcal") }
        "familie" -> dl("finanshub://familie")
        "sjekk", "checkin", "pickup" -> dl("finanshub://familie/sjekk")
        "media" -> vm.openMedia43()
        "mediakveld" -> vm.open51("kveld")
        "vaer" -> dl("finanshub://vaer")
        "sporing" -> dl("finanshub://tracking")
        "chat" -> vm.openChat()
        "studie" -> vm.openStudy44()
        "bursdager" -> dl("finanshub://bursdager")
        "matplan" -> dl("finanshub://mat")
        "kart" -> dl("finanshub://kart")
        "finans" -> dl("finanshub://finance")
        "kvitteringer" -> dl("finanshub://review")
        "scan" -> dl("finanshub://scan/camera")
        "planlegging" -> vm.open51("plan")
        "innstillinger" -> dl("finanshub://settings")
        "utseende" -> dl("finanshub://settings/look")
        "sikkerhet" -> dl("finanshub://settings/security")
        "theme" -> vm.open51("tema")
        else -> return false
    }
    return true
}

/* ---------------- Hjem: treff under søkefeltet ---------------- */

/** De tre beste treffene i hele Homelab mens du skriver i søkefeltet på Hjem, og «Søk i alt ›». */
@Composable
internal fun Search51Hint(vm: AppViewModel, text: String) {
    val p = PaperPal.current
    val q = text.trim()
    LaunchedEffect(q) {
        if (q.length < 2) { S51.hint = null; S51.hintQ = ""; return@LaunchedEffect }
        delay(300)
        runCatching { vm.search51(q, 3) }.onSuccess { S51.hint = it; S51.hintQ = q }
    }
    if (q.length < 2) return
    val res = S51.hint?.takeIf { S51.hintQ == q }?.arr51("results").orEmpty().filter { it.str51("type") != "action" }.take(3)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        res.forEachIndexed { i, r ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { S51.q = q; run51(vm, r, r.arr51("actions").firstOrNull()?.takeIf { it.s43("confirm") == null }) }.padding(14.dp, 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(icon51(r.str51("icon")), fontSize = 14.sp, color = p.ink)
                Column(Modifier.weight(1f)) {
                    Text(hl51(r.str51("title"), r.optJSONArray("match")), color = p.ink, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(listOfNotNull(r.s43("typeLabel"), r.s43("subtitle")).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        if (res.isNotEmpty()) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Text("Søk i alt etter «$q» ›", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { S51.q = q; vm.open51("sok") }.padding(14.dp, 14.dp))
    }
}
