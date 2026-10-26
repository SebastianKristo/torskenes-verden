package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Prompt 67 (ANDSET67): sidene under Innstillinger → Glimt som på web (prompt 49 del 1, 2, 3, 5 og 7).
 *  - Glimt lærer (SERVER61, recipes61.js): /api/glimt/recipes – liste, statistikk, valg, pause/aktiver, slett, test, rediger mal/plan.
 *  - Faste oppgaver (SERVER62, sched62.js): /api/glimt/schedules – liste, «Lag fra tekst» (/parse og så POST), pause/fortsett, slett,
 *    kjøringer, «Kjør nå», briefene og valgene. Systemoppgaver (system: true) kan bare settes på pause.
 *  - Entitetsregister (SERVER60 §6, entities60.js): /api/glimt/entities – liste per type, legg til, rediger, slett, «Hva betyr …?».
 *  - Glimt husker (SERVER63, memory63.js): /api/glimt/memory/pending|conflicts|stale|hygiene – Forslag, Motstrid og Ikke brukt på lenge.
 *  - Kvalitet (SERVER64, quality64.js): /api/glimt/quality – ukerapport for alle, nattlig eval (kjøringer, rapport, Kjør nå) bare for admin.
 * Alt går til Homelab-serveren med appens vanlige token (Api.hlGet/hlPost/…); ingenting logges. Grensesnittet: ui/Glimt67Ui.kt.
 * Tommel opp/ned på svar (/recipes/feedback) er ANDCHAT67 sitt (Stream67.kt).
 */

/* ---------------- Felles ---------------- */

/** Bryter med server- og brukerverdi (effektiv = server OG eget valg; eget valg null = følg serveren). */
data class G67Sw(val key: String, val label: String, val help: String, val srv: Boolean, val own: Boolean?) {
    val on: Boolean get() = srv && (own ?: srv)
}

private val OSLO67: ZoneId = ZoneId.of("Europe/Oslo")
private val NB67: Locale = Locale("nb", "NO")

private fun JSONObject.s67(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() }
private fun JSONObject.i67(k: String): Int? = if (!has(k) || isNull(k)) null else optDouble(k).takeIf { !it.isNaN() }?.toInt()
private fun JSONObject.d67(k: String): Double? = if (!has(k) || isNull(k)) null else optDouble(k).takeIf { !it.isNaN() }
private fun JSONObject.b67(k: String): Boolean? = if (!has(k) || isNull(k)) null else optBoolean(k)
private fun JSONArray?.objs67(): List<JSONObject> = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
private fun JSONArray?.strs67(): List<String> = if (this == null) emptyList() else (0 until length()).mapNotNull { opt(it)?.toString()?.takeIf { s -> s.isNotBlank() && s != "null" } }
private fun enc67(s: String): String = URLEncoder.encode(s, "UTF-8")

private fun sws67(o: JSONObject?, keys: List<String>, lab: Map<String, String>, help: Map<String, String>): List<G67Sw> {
    val srv = o?.optJSONObject("server"); val user = o?.optJSONObject("user")
    val labels = o?.optJSONObject("labels"); val helps = o?.optJSONObject("help")
    return keys.map { k ->
        G67Sw(k, labels?.s67(k) ?: lab[k] ?: k, helps?.s67(k)?.takeIf { it != "…" } ?: help[k] ?: "", srv?.optBoolean(k, true) != false, user?.b67(k))
    }
}

/** «i dag 07:00», «i morgen 07:00», «i går 07:00», ellers «tir 3. nov 14:00» (Europe/Oslo), som when62 på web. */
fun when67(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val t = runCatching { Instant.parse(iso).atZone(OSLO67) }.getOrNull() ?: return ""
    val hm = t.format(DateTimeFormatter.ofPattern("HH:mm"))
    val today = LocalDate.now(OSLO67)
    val d = t.toLocalDate()
    return when (d) {
        today -> "i dag $hm"
        today.plusDays(1) -> "i morgen $hm"
        today.minusDays(1) -> "i går $hm"
        else -> {
            val wd = t.format(DateTimeFormatter.ofPattern("EEE", NB67)).trimEnd('.')
            val mo = t.format(DateTimeFormatter.ofPattern("MMM", NB67)).trimEnd('.')
            "$wd ${d.dayOfMonth}. $mo" + (if (d.year != today.year) " ${d.year}" else "") + " $hm"
        }
    }
}

/** «18. jun» (samme år) / «18. jun 2025». */
fun date67(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val d = runCatching { Instant.parse(iso).atZone(OSLO67).toLocalDate() }.getOrNull() ?: return ""
    val mo = d.format(DateTimeFormatter.ofPattern("MMM", NB67)).trimEnd('.')
    return "${d.dayOfMonth}. $mo" + if (d.year != LocalDate.now(OSLO67).year) " ${d.year}" else ""
}

/** «28. feb 2027» for en lokal dato (YYYY-MM-DD). */
private fun day67(ymd: String?): String {
    val d = runCatching { LocalDate.parse(ymd ?: "") }.getOrNull() ?: return ""
    return "${d.dayOfMonth}. ${d.format(DateTimeFormatter.ofPattern("MMM", NB67)).trimEnd('.')} ${d.year}"
}

fun pct67(x: Double?): String = if (x == null) "–" else "${Math.round(x * 100)} %"
private fun sec67(ms: Int?): String = if (ms == null) "" else String.format(NB67, "%.1f s", ms / 1000.0)

/** Svartid: «812 ms», «4,1 s», «3 min 12 s», «2 t 14 min». */
fun ms67(ms: Double?): String {
    if (ms == null || ms < 0) return "–"
    if (ms < 1000) return "${Math.round(ms)} ms"
    if (ms < 60_000) return String.format(NB67, "%.1f s", Math.round(ms / 100) / 10.0)
    val s = Math.round(ms / 1000); val h = s / 3600; val m = (s % 3600) / 60; val r = s % 60
    return if (h > 0) "$h t" + (if (m > 0) " $m min" else "") else "$m min" + if (r > 0) " $r s" else ""
}

/** «hytta, Hytta , jobben» → ["hytta", "jobben"] (unike, uten tomme, maks 20). */
fun aliases67(v: String): List<String> {
    val seen = HashSet<String>()
    return v.split(Regex("[,;\\n]")).map { it.trim().replace(Regex("\\s+"), " ") }.filter { it.isNotEmpty() && seen.add(it.lowercase()) }.take(20)
}

private fun msg67(e: Throwable, what: String): String = when {
    e is ApiException && e.status == 403 && e.message?.startsWith(Api.TOKEN_REFUSED) == true -> "Serveren godtar ikke app-tokenet her. Logg inn på nytt."
    e is ApiException && e.status == 403 -> e.message ?: "Bare administrator kan endre dette for alle"
    else -> "$what: ${e.message ?: "ukjent feil"}"
}

private fun missing67(e: Throwable) = e is ApiException && (e.status == 404 || e.status == 405)

/* ---------------- Glimt lærer ---------------- */

val REC67_STATUS = mapOf("active" to "Aktiv", "candidate" to "Kandidat", "disabled" to "Avslått")
private val REC67_USE = mapOf("new" to "ny", "fewshot" to "eksempel", "fast" to "hurtigvei", "match" to "samme plan")
private val REC67_STATE = mapOf("success" to "vellykket", "fail" to "feil", "pending" to "venter")
private val REC67_SRC = mapOf("learned" to "Lært av en vellykket kjøring", "correction" to "Lært av en rettelse", "edited" to "Redigert av deg")
val REC67_VARS = listOf("person", "person.aliases", "place", "when")
private val REC67_KEYS = listOf("save", "fewshot", "fast", "learn")
private val REC67_LAB = mapOf("save" to "Lagre oppskrifter", "fewshot" to "Bruk som eksempler", "fast" to "Hurtigvei", "learn" to "Lær av rettelser")
private val REC67_HELP = mapOf(
    "save" to "Når Glimt løser noe riktig, lagres hvordan (planen med variabler som {person} og {when}). Bare lokalt i databasen.",
    "fewshot" to "Lignende oppskrifter (maks 3) gis til planleggeren som eksempler før de faste.",
    "fast" to "Svært like forespørsler (likhet ≥ 0,92, aktiv oppskrift med minst 5 vellykkede bruk og ingen feil de siste 10) hopper over planleggeren. Aldri for handlinger som endrer data uten at det er slått på for oppskriften.",
    "learn" to "«Nei, jeg mente …» lagrer feil og riktig plan, lager en ny oppskrift og et testtilfelle for eval.",
)

data class G67Recipe(
    val id: String, val status: String, val example: String, val template: String, val intent: String?, val writes: Boolean,
    val allowFastWrite: Boolean, val fastLine: String, val steps: List<String>, val slots: List<String>, val about: String,
    val stat: String, val planJson: String,
)

data class G67RecRun(val at: String, val text: String, val line: String, val fail: Boolean)
data class G67RecNeg(val query: String, val wrong: String, val right: String)
data class G67RecDet(val runs: List<G67RecRun> = emptyList(), val negs: List<G67RecNeg> = emptyList(), val err: String? = null)
data class G67RecTest(val busy: Boolean = false, val err: String? = null, val ok: Boolean = false, val head: String = "", val lines: List<String> = emptyList(), val steps: List<Pair<String, Boolean>> = emptyList())

/** «Brukt 7 ganger · 6 vellykket · 1 feil · siste 10: 6/7» */
private fun recStat67(o: JSONObject): String {
    val u = o.i67("useCount") ?: 0; val s = o.i67("successCount") ?: 0; val f = o.i67("failCount") ?: 0
    if (u == 0 && s == 0 && f == 0) return "Ikke brukt ennå"
    val l = o.optJSONObject("last10")
    val l10 = l?.let { "siste 10: ${it.optInt("success")}/${it.optInt("success") + it.optInt("fail") + it.optInt("pending")}" }
    return listOfNotNull("Brukt $u ${if (u == 1) "gang" else "ganger"}", "$s vellykket", if (f > 0) "$f feil" else null, l10).joinToString(" · ")
}

private fun fastLine67(o: JSONObject?): String {
    o ?: return ""
    return if (o.optBoolean("eligible")) "Kan gå hurtigveien" else "Ikke hurtigvei: " + o.optJSONArray("reasons").strs67().joinToString(" · ")
}

private fun recipe67(o: JSONObject): G67Recipe? {
    val id = o.s67("id") ?: return null
    val steps = o.optJSONArray("readableSteps").strs67().ifEmpty { listOfNotNull(o.s67("readable")) }.ifEmpty {
        o.optJSONObject("plan")?.optJSONArray("calls").objs67().map { c ->
            val a = c.optJSONObject("args")
            c.optString("tool") + "(" + (a?.keys()?.asSequence()?.joinToString("; ") { k -> "$k: ${a.opt(k)}" } ?: "") + ")"
        }
    }
    val slots = o.optJSONObject("slots")?.let { s -> s.keys().asSequence().map { k -> val v = s.optJSONObject(k); "{$k} ← ${v?.s67("source") ?: ""}" + (v?.s67("value")?.let { ": $it" } ?: "") }.toList() } ?: emptyList()
    val about = listOfNotNull(
        REC67_SRC[o.s67("source")] ?: o.s67("source"), o.s67("intent"), if (o.optBoolean("writes")) "endrer data" else "bare lesing",
        if (o.b67("hasEmbedding") == false) "uten embedding (ordlikhet)" else null, o.s67("disabledReason"),
        o.i67("negatives")?.takeIf { it > 0 }?.let { "$it negative eksempler" },
    ).joinToString(" · ")
    val plan = o.optJSONObject("plan") ?: JSONObject().put("calls", JSONArray())
    return G67Recipe(id, o.s67("status") ?: "candidate", o.s67("exampleQuery") ?: "", o.s67("queryTemplate") ?: "", o.s67("intent"), o.optBoolean("writes"),
        o.optBoolean("allowFastWrite"), fastLine67(o.optJSONObject("fast")), steps, slots, about, recStat67(o), runCatching { plan.toString(1) }.getOrDefault(plan.toString()))
}

/** Ukjente variabler i malen/planen ('{person}' og '{person.aliases}' er lov; '{x}' er det ikke). */
private fun badVars67(s: String): List<String> = Regex("\\{([^{}\"]{1,40})\\}").findAll(s).map { it.groupValues[1] }.filter { it.trim() !in REC67_VARS }.distinct().toList()

/** Sjekker redigeringen som web (checkEdit61). → (feil, body) */
internal fun checkRecEdit67(it: G67Recipe, tpl0: String, planText: String, fastWrite: Boolean): Pair<String?, JSONObject> {
    val body = JSONObject()
    val tpl = tpl0.trim()
    if (tpl != it.template) {
        if (tpl.length < 3 || tpl.length > 200) return "Malen må være 3–200 tegn" to body
        badVars67(tpl).firstOrNull()?.let { b -> return "Ukjent variabel i malen: {$b} (lov: ${REC67_VARS.joinToString(", ") { "{$it}" }})" to body }
        body.put("queryTemplate", tpl)
    }
    val raw = planText.trim()
    val plan = runCatching { if (raw.startsWith("[")) JSONObject().put("calls", JSONArray(raw)) else JSONObject(raw) }.getOrNull() ?: return "Planen er ikke gyldig JSON" to body
    val calls = plan.optJSONArray("calls")
    if (calls == null || calls.length() < 1 || calls.length() > 6) return "Planen må ha 1–6 kall" to body
    val norm = JSONArray()
    for (i in 0 until calls.length()) {
        val c = calls.optJSONObject(i)
        val tool = c?.optString("tool").orEmpty()
        if (c == null || tool.isBlank() || (c.has("args") && !c.isNull("args") && c.optJSONObject("args") == null)) return "Hvert kall trenger «tool» og «args»" to body
        norm.put(JSONObject().put("tool", tool).put("args", c.optJSONObject("args") ?: JSONObject()))
    }
    badVars67(norm.toString()).firstOrNull()?.let { b -> return "Ukjent variabel i planen: {$b}" to body }
    val before = runCatching { JSONObject(it.planJson).optJSONArray("calls").objs67().map { c -> JSONObject().put("tool", c.optString("tool")).put("args", c.optJSONObject("args") ?: JSONObject()) } }.getOrDefault(emptyList())
    if (norm.toString() != JSONArray(before).toString()) body.put("plan", JSONObject().put("calls", norm))
    if (it.writes && fastWrite != it.allowFastWrite) body.put("allowFastWrite", fastWrite)
    return null to body
}

class G67Rec {
    var loaded by mutableStateOf(false)
    var missing by mutableStateOf(false)
    var err by mutableStateOf("")
    var msg by mutableStateOf("")
    var items by mutableStateOf<List<G67Recipe>>(emptyList())
    var counts by mutableStateOf<Map<String, Int>>(emptyMap())
    var enabled by mutableStateOf(true)
    /** [aktive, kandidater, kjøringer, vellykket, hurtigvei, rettelser] */
    var stats by mutableStateOf<List<Pair<String, String>>>(emptyList())
    var filter by mutableStateOf("")
    var q by mutableStateOf("")
    var open by mutableStateOf<String?>(null)
    var edit by mutableStateOf<String?>(null)
    var arm by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)
    val det = mutableStateMapOf<String, G67RecDet>()
    val test = mutableStateMapOf<String, G67RecTest>()
    var sws by mutableStateOf<List<G67Sw>>(emptyList())
    var swAdmin by mutableStateOf(false)
    var swMsg by mutableStateOf("")
}

fun AppViewModel.loadRec67() {
    val s = g67.rec
    launch33 {
        try {
            val o = JSONObject(api33 { hlGet("/glimt/recipes") })
            s.items = o.optJSONArray("items").objs67().mapNotNull(::recipe67)
            val c = o.optJSONObject("counts")
            s.counts = listOf("active", "candidate", "disabled", "total").associateWith { k -> c?.optInt(k, -1) ?: -1 }.filterValues { it >= 0 }
            s.enabled = o.optBoolean("enabled", true)
            s.missing = false; s.err = ""
            runCatching { JSONObject(api33 { hlGet("/glimt/recipes/stats") }) }.getOrNull()?.let { st ->
                val r = st.optJSONObject("recipes"); val u = st.optJSONObject("runs")
                val tot = u?.optInt("total") ?: 0
                s.stats = listOf(
                    "${r?.optInt("active") ?: 0}" to "aktive", "${r?.optInt("candidate") ?: 0}" to "kandidater", "$tot" to "kjøringer",
                    (if (tot > 0) pct67((u?.optInt("success") ?: 0).toDouble() / tot) else "–") to "vellykket",
                    pct67(st.d67("fastShare") ?: 0.0) to "hurtigvei", "${st.optInt("corrections")}" to "rettelser",
                )
            }
            runCatching { JSONObject(api33 { hlGet("/glimt/recipes/settings") }) }.getOrNull()?.let { st ->
                s.sws = sws67(st, REC67_KEYS, REC67_LAB, REC67_HELP); s.swAdmin = st.optBoolean("admin") && userIsAdmin
            }
        } catch (e: Exception) { if (missing67(e)) s.missing = true else s.err = msg67(e, "Serveren svarte") }
        s.loaded = true
    }
}

fun AppViewModel.toggleRec67(id: String) {
    val s = g67.rec
    s.open = if (s.open == id) null else id; s.edit = null; s.arm = null; s.msg = ""
    if (s.open == null) return
    launch33 {
        try {
            val o = JSONObject(api33 { hlGet("/glimt/recipes/" + enc67(id)) })
            val runs = o.optJSONArray("runs").objs67().map { r ->
                val st = r.s67("state") ?: ""
                val line = listOfNotNull(REC67_USE[r.s67("use")] ?: r.s67("use"), REC67_STATE[st] ?: st, r.s67("reason"), r.d67("similarity")?.let { "likhet " + String.format(NB67, "%.2f", it) },
                    when (r.s67("vote")) { "up" -> "👍"; "down" -> "👎"; else -> null }).joinToString(" · ")
                G67RecRun(when67(r.s67("at")), r.s67("text") ?: "", line, st == "fail")
            }
            val negs = o.optJSONArray("negatives").objs67().map { n -> G67RecNeg(n.s67("query") ?: "", n.s67("readableWrong") ?: "", n.s67("readableRight") ?: "") }
            s.det[id] = G67RecDet(runs, negs)
            o.optJSONObject("item")?.let(::recipe67)?.let { r -> s.items = s.items.map { x -> if (x.id == r.id) r else x } }
        } catch (e: Exception) { s.det[id] = G67RecDet(err = msg67(e, "Kunne ikke hente kjøringene")) }
    }
}

fun AppViewModel.setRecStatus67(id: String, status: String) {
    val s = g67.rec
    s.busy = true
    launch33 {
        try {
            api33 { request("PATCH", "/glimt/recipes/" + enc67(id), JSONObject().put("status", status), prefix = Api.HOMELAB) }
            s.msg = if (status == "disabled") "Oppskriften er slått av ✓" else "Oppskriften er slått på ✓"
            Haptics.success(); loadRec67()
        } catch (e: Exception) { s.msg = msg67(e, "Kunne ikke endre") }
        s.busy = false
    }
}

fun AppViewModel.deleteRec67(id: String) {
    val s = g67.rec
    if (s.arm != id) { s.arm = id; return }
    launch33 {
        try {
            api33 { hlDelete("/glimt/recipes/" + enc67(id)) }
            s.msg = "Slettet ✓"; s.open = null; s.arm = null; s.det.remove(id); Haptics.success(); loadRec67()
        } catch (e: Exception) { s.msg = msg67(e, "Kunne ikke slette"); s.arm = null }
    }
}

fun AppViewModel.testRec67(id: String, text: String) {
    val s = g67.rec
    s.test[id] = G67RecTest(busy = true)
    launch33 {
        s.test[id] = try {
            val r = JSONObject(api33 { hlPost("/glimt/recipes/" + enc67(id) + "/test", if (text.isBlank()) JSONObject() else JSONObject().put("text", text.trim())) })
            val slots = r.optJSONObject("slots")?.let { o -> o.keys().asSequence().joinToString(" · ") { k -> val v = o.opt(k); "{$k} = " + if (v is JSONArray) v.strs67().joinToString(", ") else "$v" } } ?: ""
            val lines = listOfNotNull(
                "«${r.optString("text")}» · likhet " + (r.d67("similarity")?.let { String.format(NB67, "%.2f", it) } ?: "–") + (if (slots.isNotEmpty()) " · $slots" else ""),
                r.optJSONArray("missing").strs67().takeIf { it.isNotEmpty() }?.let { m -> "Mangler: " + m.joinToString(", ") { "{$it}" } },
                r.s67("readable"),
                r.optJSONObject("fast")?.let { fastLine67(it) },
            )
            val steps = r.optJSONArray("steps").objs67().map { st -> (st.optString("tool") + " " + (st.s67("summary") ?: st.s67("error") ?: st.s67("status") ?: "")) to (st.b67("ok") != false) }
            G67RecTest(ok = r.optBoolean("ok"), head = (if (r.optBoolean("ok")) "Planen virker" else "Planen kunne ikke fylles ut") + (r.i67("ms")?.let { " · $it ms" } ?: ""), lines = lines, steps = steps)
        } catch (e: Exception) { G67RecTest(err = msg67(e, "Testen feilet")) }
    }
}

fun AppViewModel.saveRec67(it: G67Recipe, tpl: String, plan: String, fastWrite: Boolean) {
    val s = g67.rec
    val (err, body) = checkRecEdit67(it, tpl, plan, fastWrite)
    if (err != null) { s.msg = err; return }
    if (body.length() == 0) { s.edit = null; s.msg = "Ingen endringer"; return }
    s.busy = true; s.msg = "Lagrer …"
    launch33 {
        try {
            api33 { request("PATCH", "/glimt/recipes/" + enc67(it.id), body, prefix = Api.HOMELAB) }
            s.edit = null; s.msg = "Lagret ✓"; s.test.remove(it.id); Haptics.success(); loadRec67()
        } catch (e: Exception) { s.msg = msg67(e, "Kunne ikke lagre") }
        s.busy = false
    }
}

/** Glimt lærer: egen bryter (scope user, null = følg serveren) eller for alle (scope server, admin). */
fun AppViewModel.setRecSw67(sw: G67Sw, server: Boolean) {
    val s = g67.rec
    val next = if (server) !sw.srv else !sw.on
    val body = JSONObject().put("scope", if (server) "server" else "user").put(sw.key, if (!server && next == sw.srv) JSONObject.NULL else next)
    launch33 {
        try {
            val o = JSONObject(api33 { hlPut("/glimt/recipes/settings", body) })
            s.sws = sws67(o, REC67_KEYS, REC67_LAB, REC67_HELP)
            s.swMsg = "${sw.label} er ${if (next) "på" else "av"} for ${if (server) "alle" else "deg"}"
        } catch (e: Exception) { s.swMsg = msg67(e, "Kunne ikke lagre") }
    }
}

/* ---------------- Faste oppgaver ---------------- */

val SCH67_STATUS = mapOf("active" to "Aktiv", "paused" to "Pauset", "ended" to "Ferdig")
private val SCH67_RUN = mapOf("running" to "Kjører", "ok" to "Levert", "failed" to "Feilet", "skipped" to "Hoppet over", "missed" to "Tapt", "condition_false" to "Betingelsen ikke oppfylt")
val SCH67_KIND = mapOf("power" to "Strømpriser", "reminder" to "Påminnelse", "query" to "Glimt-forespørsel", "brief" to "Brief", "memory" to "Nattlig oppsummering av minnet", "quality" to "Nattlig eval", "weekly" to "Ukerapport")
private val SCH67_TRIG = mapOf("catchup" to "tatt igjen etter omstart", "run-now" to "kjørt nå")
val SCH67_ZONES = listOf("NO1" to "Øst", "NO2" to "Sør", "NO3" to "Midt", "NO4" to "Nord", "NO5" to "Vest")
private val SCH67_KEYS = listOf("enabled", "conditions", "quiet")
private val SCH67_LAB = mapOf("enabled" to "Planlagte oppgaver", "conditions" to "Betingede varsler", "quiet" to "Stille timer 23–07")
private val SCH67_HELP = mapOf(
    "enabled" to "Glimt kjører faste oppgaver du har bedt om («Send meg strømprisene hver morgen kl. 7») og sender resultatet som push i appen. Av: ingenting kjøres, men oppgavene står.",
    "conditions" to "Varsler med betingelse («si fra hvis strømprisen går over 2 kr») sjekkes i koden mot ekte data – modellen vurderer aldri betingelsen.",
    "quiet" to "Oppgaver uten eget klokkeslett flyttes til 07:00 i stedet for å kjøre mellom 23 og 07. Ba du om et klokkeslett, gjelder det.",
)

data class G67Sched(
    val id: String, val title: String, val what: String, val kind: String, val whenText: String, val whenLabel: String, val explicitTime: Boolean,
    val cond: String?, val condExpr: String?, val zone: String?, val power: Boolean, val channel: String, val status: String, val system: Boolean,
    val next: List<String>, val nextRunAt: String?, val lastRun: String, val private: Boolean,
)

data class G67SRun(val head: String, val meta: String, val result: String?, val reason: String?, val error: String?, val bad: Boolean)
data class G67Brief(val id: String, val title: String, val at: String, val on: Boolean, val line: String, val canAt: Boolean, val canOn: Boolean)
data class G67Prev(val busy: Boolean = false, val err: String? = null, val summary: String = "", val lines: List<String> = emptyList())

private fun whenLabel67(w: JSONObject?): String {
    w ?: return ""
    return listOfNotNull((w.s67("label") ?: w.s67("text")), w.s67("until")?.let { "til og med ${day67(it)}" }).joinToString(" · ")
}

private fun delivery67(r: JSONObject): String {
    val d = r.optJSONObject("delivery") ?: return ""
    d.s67("skipped")?.let { return "Ikke sendt: $it" }
    if (d.optBoolean("delivered")) return if (d.optInt("pushed") > 1) "Push sendt til ${d.optInt("pushed")} enheter" else "Push sendt"
    return if (d.optString("channel") == "push") "Ingen enheter tok imot push" else ""
}

/** Én linje om siste kjøring: «Levert i dag 07:00 · 1,2 s». */
private fun runLine67(r: JSONObject?): String {
    r ?: return "Ikke kjørt ennå"
    val st = r.s67("status") ?: ""
    val head = listOf(SCH67_RUN[st] ?: st, when67(r.s67("finishedAt") ?: r.s67("startedAt") ?: r.s67("plannedAt"))).filter { it.isNotBlank() }.joinToString(" ")
    return listOf(head, if (st != "running") sec67(r.i67("ms")) else "").filter { it.isNotBlank() }.joinToString(" · ")
}

private fun sched67(o: JSONObject): G67Sched? {
    val id = o.s67("id") ?: return null
    val w = o.optJSONObject("when"); val c = o.optJSONObject("condition")
    val zone = o.optJSONObject("params")?.s67("zone")
    return G67Sched(id, o.s67("title") ?: o.s67("what") ?: "Fast oppgave", o.s67("what") ?: "", o.s67("kind") ?: "", w?.s67("text") ?: "", whenLabel67(w), w?.b67("explicitTime") != false,
        c?.let { it.s67("label") ?: it.s67("text") }, c?.s67("expr"), zone, o.s67("kind") == "power" || c?.s67("source") == "power", o.s67("channel") ?: "push",
        o.s67("status") ?: "active", o.optBoolean("system"), o.optJSONArray("nextRuns").strs67().take(3).map(::when67).filter { it.isNotBlank() }, o.s67("nextRunAt"),
        runLine67(o.optJSONObject("lastRun")), o.optBoolean("private"))
}

private fun sRun67(r: JSONObject): G67SRun {
    val st = r.s67("status") ?: ""
    val cond = r.optJSONObject("condition")?.let { c -> "Betingelse ${if (c.optBoolean("met")) "oppfylt" else "ikke oppfylt"}" + (c.d67("value")?.let { v -> " (" + v.toString().replace('.', ',') + ")" } ?: "") }
    val meta = listOfNotNull(SCH67_TRIG[r.s67("trigger")], r.i67("ms")?.let { sec67(it) }, cond, delivery67(r).takeIf { it.isNotBlank() }).joinToString(" · ")
    return G67SRun(listOf(SCH67_RUN[st] ?: st, when67(r.s67("finishedAt") ?: r.s67("startedAt") ?: r.s67("plannedAt"))).filter { it.isNotBlank() }.joinToString(" "),
        meta, r.s67("result"), r.s67("reason"), r.s67("error"), st == "failed" || st == "missed")
}

class G67Sch {
    var loaded by mutableStateOf(false)
    var missing by mutableStateOf(false)
    var err by mutableStateOf("")
    var msg by mutableStateOf("")
    var items by mutableStateOf<List<G67Sched>>(emptyList())
    var briefs by mutableStateOf<List<G67Brief>>(emptyList())
    var counts by mutableStateOf<Map<String, Int>>(emptyMap())
    var enabled by mutableStateOf(true)
    var filter by mutableStateOf("")
    var open by mutableStateOf<String?>(null)
    var edit by mutableStateOf<String?>(null)
    var arm by mutableStateOf<String?>(null)
    val busy = mutableStateMapOf<String, String>()
    val runs = mutableStateMapOf<String, List<G67SRun>>()
    val runsErr = mutableStateMapOf<String, String>()
    val rmsg = mutableStateMapOf<String, Pair<String, Boolean>>()
    var prev by mutableStateOf<G67Prev?>(null)
    /* «Lag fra tekst» */
    var newOpen by mutableStateOf(false)
    var newWhat by mutableStateOf("")
    var newWhen by mutableStateOf("")
    var newCond by mutableStateOf("")
    var newPrev by mutableStateOf<G67Prev?>(null)
    var newBusy by mutableStateOf(false)
    /* Valg */
    var sws by mutableStateOf<List<G67Sw>>(emptyList())
    var swAdmin by mutableStateOf(false)
    var zone by mutableStateOf("NO1")
    var swMsg by mutableStateOf("")
}

private fun prev67(r: JSONObject): G67Prev {
    val runs = r.optJSONArray("nextRuns").strs67().take(3).map(::when67).filter { it.isNotBlank() }
    val c = r.optJSONObject("condition")
    return G67Prev(summary = r.s67("summary") ?: whenLabel67(r.optJSONObject("when")),
        lines = listOfNotNull(runs.takeIf { it.isNotEmpty() }?.let { "Neste: " + it.joinToString(" · ") }, c?.let { "Bare hvis: " + (it.s67("label") ?: it.s67("text") ?: "") + (it.s67("expr")?.let { e -> " · $e" } ?: "") }))
}

fun AppViewModel.loadSch67() {
    val s = g67.sch
    launch33 {
        try {
            val o = JSONObject(api33 { hlGet("/glimt/schedules") })
            s.items = o.optJSONArray("items").objs67().mapNotNull(::sched67)
            s.briefs = o.optJSONArray("builtin").objs67().mapNotNull { b ->
                val id = b.s67("id") ?: return@mapNotNull null
                val ed = b.optJSONArray("editable")?.strs67()
                val on = b.optBoolean("on", true)
                G67Brief(id, b.s67("title") ?: id, b.s67("at") ?: "", on, if (!on) "Av" else listOfNotNull(b.s67("label"), b.s67("nextRunAt")?.let { "neste ${when67(it)}" }).joinToString(" · "),
                    ed == null || "at" in ed, ed == null || "on" in ed)
            }
            val c = o.optJSONObject("counts")
            s.counts = listOf("active", "paused", "ended", "total").associateWith { k -> c?.optInt(k, -1) ?: -1 }.filterValues { it >= 0 }
            s.enabled = o.optBoolean("enabled", true)
            s.missing = false; s.err = ""
            runCatching { JSONObject(api33 { hlGet("/glimt/schedules/settings") }) }.getOrNull()?.let(::schSettings67)
        } catch (e: Exception) { if (missing67(e)) s.missing = true else s.err = msg67(e, "Serveren svarte") }
        s.loaded = true
    }
}

private fun AppViewModel.schSettings67(o: JSONObject) {
    val s = g67.sch
    s.sws = sws67(o, SCH67_KEYS, SCH67_LAB, SCH67_HELP)
    s.swAdmin = o.optBoolean("admin") && userIsAdmin
    s.zone = o.s67("zone") ?: o.optJSONObject("user")?.s67("zone") ?: o.optJSONObject("settings")?.s67("zone") ?: "NO1"
}

fun AppViewModel.toggleSch67(id: String) {
    val s = g67.sch
    s.open = if (s.open == id) null else id; s.edit = null; s.arm = null; s.prev = null
    if (s.open != null) loadSchRuns67(id)
}

private fun AppViewModel.loadSchRuns67(id: String) {
    val s = g67.sch
    launch33 {
        try {
            val o = JSONObject(api33 { hlGet("/glimt/schedules/" + enc67(id) + "/runs?limit=20") })
            s.runs[id] = o.optJSONArray("items").objs67().map(::sRun67); s.runsErr.remove(id)
        } catch (e: Exception) { s.runsErr[id] = msg67(e, "Kunne ikke hente kjøringene") }
    }
}

private fun AppViewModel.patchSch67(id: String, body: JSONObject, ok: String) {
    val s = g67.sch
    s.busy[id] = "patch"
    launch33 {
        try {
            api33 { request("PATCH", "/glimt/schedules/" + enc67(id), body, prefix = Api.HOMELAB) }
            s.rmsg[id] = ok to false; s.edit = null; s.prev = null; Haptics.success(); loadSch67()
        } catch (e: Exception) { s.rmsg[id] = msg67(e, "Kunne ikke lagre") to true }
        s.busy.remove(id)
    }
}

fun AppViewModel.pauseSch67(it: G67Sched, pause: Boolean) =
    patchSch67(it.id, JSONObject().put("status", if (pause) "paused" else "active"), if (pause) "Satt på pause ✓" else "Slått på igjen ✓")

fun AppViewModel.runNowSch67(id: String) {
    val s = g67.sch
    s.busy[id] = "run"
    launch33 {
        try {
            val o = JSONObject(api33 { request("POST", "/glimt/schedules/" + enc67(id) + "/run-now", JSONObject(), prefix = Api.HOMELAB, read = 120_000) })
            val r = o.optJSONObject("run")
            s.rmsg[id] = (r?.let { x -> listOfNotNull(runLine67(x), x.s67("result"), x.s67("reason"), x.s67("error"), delivery67(x).takeIf { d -> d.isNotBlank() }).joinToString("\n") } ?: "Kjørt") to (r?.s67("status") == "failed")
            Haptics.success(); loadSch67(); loadSchRuns67(id)
        } catch (e: Exception) { s.rmsg[id] = msg67(e, "Kunne ikke kjøre") to true }
        s.busy.remove(id)
    }
}

fun AppViewModel.deleteSch67(id: String) {
    val s = g67.sch
    if (s.arm != id) { s.arm = id; return }
    s.busy[id] = "del"
    launch33 {
        try {
            api33 { hlDelete("/glimt/schedules/" + enc67(id)) }
            s.msg = "Slettet ✓"; s.open = null; s.arm = null; Haptics.success(); loadSch67()
        } catch (e: Exception) { s.rmsg[id] = msg67(e, "Kunne ikke slette") to true; s.arm = null }
        s.busy.remove(id)
    }
}

/** «Endre tidspunkt»: forhåndsvis (POST /parse, lagrer ingenting) og lagre (PATCH when). */
fun AppViewModel.previewWhen67(it: G67Sched, text: String) {
    val s = g67.sch
    val t = text.trim().replace(Regex("\\s+"), " ")
    if (t.length < 2 || t.length > 200) { s.prev = G67Prev(err = "Skriv når, f.eks. «hver hverdag kl. 7» (2–200 tegn)"); return }
    s.prev = G67Prev(busy = true)
    launch33 {
        s.prev = try { prev67(JSONObject(api33 { hlPost("/glimt/schedules/parse", JSONObject().put("when", t).apply { if (it.what.isNotBlank()) put("what", it.what) }) })) }
        catch (e: Exception) { G67Prev(err = e.message ?: "Forstod ikke tidspunktet") }
    }
}

fun AppViewModel.saveWhen67(it: G67Sched, text: String) {
    val t = text.trim().replace(Regex("\\s+"), " ")
    if (t.length < 2 || t.length > 200) { g67.sch.prev = G67Prev(err = "Skriv når, f.eks. «hver hverdag kl. 7» (2–200 tegn)"); return }
    if (t == it.whenText) { g67.sch.edit = null; return }
    patchSch67(it.id, JSONObject().put("when", t), "Endret ✓")
}

/** Brief: nytt klokkeslett («6:30», «06.30», «0630» → «06:30») eller av/på. */
fun hhmm67(s: String): String? {
    val m = Regex("^(\\d{1,2})[:.]?(\\d{2})$").find(s.trim()) ?: return null
    val h = m.groupValues[1].toInt(); val mi = m.groupValues[2].toInt()
    return if (h < 24 && mi < 60) "%02d:%02d".format(h, mi) else null
}

fun AppViewModel.saveBrief67(b: G67Brief, at: String?, on: Boolean?) {
    val s = g67.sch
    val body = JSONObject()
    if (at != null) { val v = hhmm67(at) ?: run { s.rmsg[b.id] = "Skriv klokkeslettet som 06:45" to true; return }; body.put("at", v) }
    if (on != null) body.put("on", on)
    s.busy[b.id] = "patch"
    launch33 {
        try {
            api33 { request("PATCH", "/glimt/schedules/" + b.id, body, prefix = Api.HOMELAB) }
            s.rmsg[b.id] = "Lagret ✓" to false; Haptics.success(); loadSch67()
        } catch (e: Exception) { s.rmsg[b.id] = msg67(e, "Kunne ikke lagre") to true }
        s.busy.remove(b.id)
    }
}

private fun newBody67(s: G67Sch): JSONObject? {
    val what = s.newWhat.trim(); val wh = s.newWhen.trim().replace(Regex("\\s+"), " ")
    if (what.length < 2) { s.newPrev = G67Prev(err = "Skriv hva Glimt skal gjøre, f.eks. «send meg strømprisene»"); return null }
    if (wh.length < 2 || wh.length > 200) { s.newPrev = G67Prev(err = "Skriv når, f.eks. «hver hverdag kl. 7» (2–200 tegn)"); return null }
    return JSONObject().put("what", what).put("when", wh).apply { s.newCond.trim().takeIf { it.isNotEmpty() }?.let { put("condition", it) } }
}

/** «Lag fra tekst» – trinn 1: forhåndsvisning (POST /parse lagrer ingenting). */
fun AppViewModel.previewNew67() {
    val s = g67.sch
    val body = newBody67(s) ?: return
    s.newPrev = G67Prev(busy = true)
    launch33 {
        s.newPrev = try { prev67(JSONObject(api33 { hlPost("/glimt/schedules/parse", body) })) }
        catch (e: Exception) { G67Prev(err = msg67(e, "Forstod ikke")) }
    }
}

/** «Lag fra tekst» – trinn 2: lagre (POST /api/glimt/schedules). */
fun AppViewModel.createNew67() {
    val s = g67.sch
    val body = newBody67(s) ?: return
    s.newBusy = true
    launch33 {
        try {
            val o = JSONObject(api33 { hlPost("/glimt/schedules", body) })
            val it = o.optJSONObject("item")?.let(::sched67)
            s.newOpen = false; s.newWhat = ""; s.newWhen = ""; s.newCond = ""; s.newPrev = null
            s.msg = "Lagret ✓" + (it?.let { " · ${it.title} · ${it.whenLabel}" } ?: "")
            Haptics.success(); loadSch67()
        } catch (e: Exception) { s.newPrev = G67Prev(err = msg67(e, "Kunne ikke lagre")) }
        s.newBusy = false
    }
}

fun AppViewModel.setSchSw67(sw: G67Sw, server: Boolean) {
    val s = g67.sch
    val next = if (server) !sw.srv else !sw.on
    val body = JSONObject().put("scope", if (server) "server" else "user").put(sw.key, if (!server && next == sw.srv) JSONObject.NULL else next)
    putSch67(body, "${sw.label} er ${if (next) "på" else "av"} for ${if (server) "alle" else "deg"}")
}

fun AppViewModel.setSchZone67(z: String) = putSch67(JSONObject().put("scope", "user").put("zone", z), "Prisområde $z")

private fun AppViewModel.putSch67(body: JSONObject, ok: String) {
    val s = g67.sch
    launch33 {
        try { schSettings67(JSONObject(api33 { hlPut("/glimt/schedules/settings", body) })); s.swMsg = ok; loadSch67() }
        catch (e: Exception) { s.swMsg = msg67(e, "Kunne ikke lagre") }
    }
}

/* ---------------- Entitetsregister ---------------- */

val ENT67_TYPES = listOf("person", "place", "store", "subscription", "event")
val ENT67_LABELS = mapOf("person" to "Personer", "place" to "Steder", "store" to "Butikker", "subscription" to "Abonnementer", "event" to "Faste hendelser")
val ENT67_ONE = mapOf("person" to "Person", "place" to "Sted", "store" to "Butikk", "subscription" to "Abonnement", "event" to "Fast hendelse")
private val ENT67_WHERE = mapOf("family" to "Familie → Steder", "subscriptions" to "Subscription OS", "weather" to "Vær", "profile" to "Profil")

data class G67Ent(
    val id: String, val type: String, val name: String, val value: String?, val aliases: List<String>, val builtin: List<String>,
    val sourceLabel: String?, val where: String, val derived: Boolean, val canDelete: Boolean,
)

class G67EntS {
    var loaded by mutableStateOf(false)
    var missing by mutableStateOf(false)
    var err by mutableStateOf("")
    var msg by mutableStateOf("")
    var items by mutableStateOf<List<G67Ent>>(emptyList())
    var labels by mutableStateOf(ENT67_LABELS)
    var enabled by mutableStateOf(true)
    var filter by mutableStateOf("")
    var edit by mutableStateOf<String?>(null)
    var add by mutableStateOf(false)
    var arm by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)
    var res by mutableStateOf<String?>(null)
}

private fun ent67(o: JSONObject): G67Ent? {
    val id = o.s67("id") ?: return null
    val ed = o.optJSONObject("editable")
    val derived = !(ed?.b67("name") ?: (o.s67("source") == "memory"))
    return G67Ent(id, o.s67("type") ?: "person", o.s67("name") ?: id, o.s67("value"), o.optJSONArray("aliases").strs67(), o.optJSONArray("builtin").strs67(),
        o.s67("sourceLabel"), ENT67_WHERE[o.s67("source")] ?: o.s67("sourceLabel") ?: "kilden", derived, ed?.b67("delete") ?: !derived)
}

fun AppViewModel.loadEnt67() {
    val s = g67.ent
    launch33 {
        try {
            val o = JSONObject(api33 { hlGet("/glimt/entities") })
            s.items = o.optJSONArray("items").objs67().mapNotNull(::ent67)
            o.optJSONObject("labels")?.let { l -> s.labels = ENT67_TYPES.associateWith { t -> l.s67(t) ?: ENT67_LABELS[t] ?: t } }
            s.enabled = o.optBoolean("enabled", true); s.missing = false; s.err = ""
        } catch (e: Exception) { if (missing67(e)) s.missing = true else s.err = msg67(e, "Serveren svarte") }
        s.loaded = true
    }
}

/** Lagrer en ny (it = null) eller endret entitet. Avledede (Familie-steder, abonnementer …) får bare aliaser. */
fun AppViewModel.saveEnt67(it: G67Ent?, type: String, name: String, value: String, aliasText: String) {
    val s = g67.ent
    val al = aliases67(aliasText)
    val derived = it?.derived == true
    if (!derived) {
        if (type !in ENT67_TYPES) { s.msg = "Velg en type"; return }
        if (name.trim().length !in 2..80) { s.msg = "Navnet må være 2–80 tegn"; return }
    }
    if (al.size > 20) { s.msg = "Maks 20 aliaser"; return }
    al.firstOrNull { a -> a.length !in 2..60 }?.let { b -> s.msg = "Aliaset «$b» må være 2–60 tegn"; return }
    val body = JSONObject().put("aliases", JSONArray(al))
    if (!derived) body.put("type", type).put("name", name.trim()).put("value", value.trim().ifBlank { JSONObject.NULL })
    s.busy = true
    launch33 {
        try {
            if (it == null) api33 { hlPost("/glimt/entities", body) } else api33 { request("PATCH", "/glimt/entities/" + enc67(it.id), body, prefix = Api.HOMELAB) }
            s.msg = if (it == null) "Lagt til ✓" else "Lagret ✓"; s.edit = null; s.add = false; s.arm = null
            Haptics.success(); loadEnt67(); loadMem33(force = true)
        } catch (e: Exception) { s.msg = msg67(e, "Kunne ikke lagre") }
        s.busy = false
    }
}

fun AppViewModel.deleteEnt67(it: G67Ent) {
    val s = g67.ent
    if (s.arm != it.id) { s.arm = it.id; return }
    launch33 {
        try {
            api33 { hlDelete("/glimt/entities/" + enc67(it.id)) }
            s.msg = if (it.derived) "Egne aliaser fjernet ✓" else "Slettet ✓"; s.edit = null; s.arm = null
            Haptics.success(); loadEnt67(); loadMem33(force = true)
        } catch (e: Exception) { s.msg = msg67(e, "Kunne ikke slette"); s.arm = null }
    }
}

/** «Hva betyr …?» (GET /entities/resolve). */
fun AppViewModel.resolveEnt67(q: String) {
    val s = g67.ent
    val t = q.trim().take(80)
    if (t.isEmpty()) return
    launch33 {
        s.res = try {
            val o = JSONObject(api33 { hlGet("/glimt/entities/resolve?q=" + enc67(t)) })
            val it = o.optJSONObject("item")
            if (it == null) "Glimt kjenner ikke «$t» ennå." else {
                val via = mapOf("name" to "navn", "alias" to "alias", "builtin" to "fast ord")[o.s67("via")] ?: o.s67("via") ?: "–"
                "«$t» → ${it.optString("name")} (${ENT67_ONE[it.s67("type")] ?: it.s67("type") ?: ""}${it.s67("value")?.let { v -> " · $v" } ?: ""}) · funnet via $via"
            }
        } catch (e: Exception) { msg67(e, "Kunne ikke slå opp") }
    }
}

/* ---------------- Glimt husker: Forslag, Motstrid, Ikke brukt på lenge ---------------- */

private val MEM67_KEYS = listOf("nightly", "conflicts", "stale")
private val MEM67_LAB = mapOf("nightly" to "Nattlig oppsummering", "conflicts" to "Motstrid-sjekk", "stale" to "Marker ubrukte fakta")
private val MEM67_HELP = mapOf(
    "nightly" to "Kl. 03 hver natt går Glimt gjennom dagens samtaler, rettelser og nye kalenderhendelser og foreslår nye fakta. Ingenting lagres før du godkjenner. Kjøres bare med lokal modell.",
    "conflicts" to "Glimt sier fra når to ting motsier hverandre («Nina er frisør» og «Nina er tannlege») og spør hvilken som stemmer.",
    "stale" to "Fakta som ikke er brukt på lenge får et merke. De slettes aldri automatisk – bare når du trykker Slett.",
)
private val MEM67_SRC = mapOf("conversation" to "Glimt-samtale", "correction" to "Rettelse", "calendar" to "Kalender")
val MEM67_DAYS = listOf(30, 60, 90, 180, 365)
fun days67(n: Int) = "$n ${if (n == 1) "dag" else "dager"}"

data class G67Pend(val id: String, val sentence: String, val sub: String, val subject: String, val obj: String, val alias: Boolean, val aliases: List<String>, val conflictId: String?, val evidence: List<String>)
data class G67Side(val label: String, val src: String?)
data class G67Conf(val id: String, val question: String, val a: G67Side?, val b: G67Side?, val choices: List<Pair<String, String>>)
data class G67Stale(val id: Int, val title: String, val line: String)

class G67Mem {
    var loaded by mutableStateOf(false)
    var missing by mutableStateOf(false)
    var err by mutableStateOf("")
    var msg by mutableStateOf("")
    var pend by mutableStateOf<List<G67Pend>>(emptyList())
    var conf by mutableStateOf<List<G67Conf>>(emptyList())
    var stale by mutableStateOf<List<G67Stale>>(emptyList())
    var staleDays by mutableStateOf(90)
    var sws by mutableStateOf<List<G67Sw>>(emptyList())
    var swAdmin by mutableStateOf(false)
    var swMsg by mutableStateOf("")
    var next by mutableStateOf("")
    var lastRun by mutableStateOf("Ikke kjørt ennå")
    var edit by mutableStateOf<String?>(null)
    var emsg by mutableStateOf("")
    var arm by mutableStateOf<Int?>(null)
    val busy = mutableStateMapOf<String, Boolean>()
    fun on(k: String) = sws.firstOrNull { it.key == k }?.on ?: true
}

private fun memRunLine67(r: JSONObject?): String {
    r ?: return "Ikke kjørt ennå"
    val at = when67(r.s67("at"))
    when (r.s67("status")) {
        "skipped" -> return "Hoppet over $at" + (r.s67("reason")?.let { ": $it" } ?: "")
        "failed" -> return "Feilet $at" + (r.s67("reason")?.let { ": $it" } ?: "")
    }
    fun n(k: String, one: String, many: String) = r.i67(k)?.let { "$it ${if (it == 1) one else many}" }
    return listOfNotNull("Kjørt $at", n("proposals", "forslag", "forslag"), n("conflicts", "motstrid", "motstrid"), n("stale", "ubrukt", "ubrukte")).joinToString(" · ")
}

/** «3 forslag · 1 motstrid · 2 ikke brukt på lenge». */
fun memCounts67(p: Int, c: Int, s: Int): String =
    listOfNotNull(if (p > 0) "$p forslag" else null, if (c > 0) "$c motstrid" else null, if (s > 0) "$s ikke brukt på lenge" else null).joinToString(" · ")

private fun AppViewModel.hygiene67(h: JSONObject) {
    val s = g67.mem
    s.sws = sws67(h, MEM67_KEYS, MEM67_LAB, MEM67_HELP)
    s.swAdmin = h.optBoolean("admin") && userIsAdmin
    s.staleDays = h.i67("staleDays") ?: s.staleDays
    val sch = h.optJSONObject("schedule")
    s.next = when {
        !s.on("nightly") -> "Nattlig oppsummering er slått av"
        sch?.s67("status") == "paused" -> "Nattjobben er satt på pause i Faste oppgaver"
        sch?.s67("nextRunAt") != null -> "Neste ${when67(sch.s67("nextRunAt"))}"
        else -> "Hver natt kl. 03"
    }
    s.lastRun = memRunLine67(h.optJSONObject("lastRun"))
}

fun AppViewModel.loadMem67() {
    val s = g67.mem
    launch33 {
        val p = runCatching { JSONObject(api33 { hlGet("/glimt/memory/pending") }) }
        if (p.exceptionOrNull()?.let(::missing67) == true) { s.missing = true; s.loaded = true; return@launch33 }
        val c = runCatching { JSONObject(api33 { hlGet("/glimt/memory/conflicts") }) }
        val st = runCatching { JSONObject(api33 { hlGet("/glimt/memory/stale") }) }
        val h = runCatching { JSONObject(api33 { hlGet("/glimt/memory/hygiene") }) }
        s.missing = false
        p.getOrNull()?.let { o ->
            s.pend = o.optJSONArray("items").objs67().filter { (it.s67("status") ?: "pending") == "pending" }.mapNotNull { x ->
                val id = x.s67("id") ?: return@mapNotNull null
                G67Pend(id, x.s67("sentence") ?: listOfNotNull(x.s67("subject"), x.s67("predicate") ?: "er", x.s67("object")).joinToString(" "),
                    listOfNotNull(x.s67("sourceLabel") ?: MEM67_SRC[x.s67("source")], x.s67("reason")).joinToString(" · ") + if (x.optBoolean("edited")) " · redigert" else "",
                    x.s67("subject") ?: "", x.s67("object") ?: "", x.s67("kind") == "alias", x.optJSONArray("aliases").strs67(), x.s67("conflictId"),
                    x.optJSONArray("evidence").objs67().mapNotNull { e -> e.s67("text")?.let { t -> "«$t»" + (e.s67("at")?.let { a -> " · " + when67(a) } ?: "") } }.take(3))
            }
        }
        c.getOrNull()?.let { o ->
            s.conf = o.optJSONArray("items").objs67().filter { (it.s67("status") ?: "open") == "open" }.mapNotNull { x ->
                val id = x.s67("id") ?: return@mapNotNull null
                fun side(k: String) = x.optJSONObject(k)?.let { y -> G67Side(y.s67("label") ?: "${y.optString("subject")} er ${y.optString("object")}", y.s67("sourceLabel")) }
                val a = side("a"); val b = side("b")
                val ch = x.optJSONArray("choices").objs67().mapNotNull { y -> y.s67("id")?.takeIf { it in setOf("keep_a", "keep_b", "both") }?.let { it to (y.s67("label") ?: it) } }
                    .ifEmpty { listOf("keep_a" to "Behold «${a?.label ?: "A"}»", "keep_b" to "Behold «${b?.label ?: "B"}»", "both" to "Begge stemmer") }
                G67Conf(id, x.s67("question") ?: "Hvilken stemmer?", a, b, ch)
            }
        }
        st.getOrNull()?.let { o ->
            s.staleDays = o.i67("staleDays") ?: s.staleDays
            s.stale = o.optJSONArray("items").objs67().mapNotNull { x ->
                if (!x.has("id")) return@mapNotNull null
                val subj = x.s67("subject") ?: ""
                val title = x.s67("title")?.let { t -> if (subj.isNotEmpty() && !t.lowercase().contains(subj.lowercase())) "$subj → $t" else t } ?: "$subj → ${x.optString("object")}".trim()
                val n = x.i67("daysUnused")
                val head = if (n == null) "Ikke brukt på lenge" else "Ikke brukt på ${days67(n)}"
                val tail = x.s67("lastUsedAt")?.let { "sist brukt ${date67(it)}" } ?: x.s67("keptAt")?.let { "beholdt ${date67(it)}" } ?: x.s67("createdAt")?.let { "aldri brukt · lagt inn ${date67(it)}" } ?: "aldri brukt"
                G67Stale(x.optInt("id"), title, "$head · $tail")
            }
        }
        h.getOrNull()?.let { hygiene67(it) }
        s.err = listOf(p, c, st, h).firstNotNullOfOrNull { it.exceptionOrNull() }?.let { msg67(it, "Serveren svarte") } ?: ""
        s.loaded = true
    }
}

private fun AppViewModel.memAct67(key: String, path: String, body: JSONObject, ok: String, after: (() -> Unit)? = null) {
    val s = g67.mem
    s.busy[key] = true
    launch33 {
        try {
            api33 { hlPost(path, body) }
            s.msg = ok; after?.invoke(); Haptics.success(); loadMem67(); loadMem33(force = true)
        } catch (e: Exception) {
            s.msg = if (e is ApiException && e.status == 409) (e.message ?: "Motsier noe Glimt allerede vet – velg under Motstrid først.") else msg67(e, "Kunne ikke lagre")
        }
        s.busy.remove(key)
    }
}

fun AppViewModel.approvePend67(p: G67Pend) = memAct67(p.id, "/glimt/memory/pending/${enc67(p.id)}/approve", JSONObject(), "Lagt inn i Glimt husker ✓")
fun AppViewModel.rejectPend67(p: G67Pend) = memAct67(p.id, "/glimt/memory/pending/${enc67(p.id)}/reject", JSONObject(), "Avvist")

/** Redigering av et forslag: «Lagre forslaget» (edit) eller «Lagre og godkjenn» (approve med de nye verdiene). */
fun AppViewModel.editPend67(p: G67Pend, subject: String, obj: String, aliasText: String, approve: Boolean) {
    val s = g67.mem
    val sj = subject.trim().replace(Regex("\\s+"), " "); val o = obj.trim().replace(Regex("\\s+"), " "); val al = aliases67(aliasText)
    val err = when {
        sj.length !in 2..80 -> "Navnet må være 2–80 tegn"
        o.length !in 1..120 -> "Hva det er må være 1–120 tegn"
        al.size > 20 -> "Maks 20 aliaser"
        else -> al.firstOrNull { it.length !in 2..60 }?.let { "Aliaset «$it» må være 2–60 tegn" }
    }
    if (err != null) { s.emsg = err; return }
    val body = JSONObject()
    if (sj != p.subject) body.put("subject", sj)
    if (o != p.obj) body.put("object", o)
    if (al != p.aliases) body.put("aliases", JSONArray(al))
    s.emsg = ""
    memAct67(p.id, "/glimt/memory/pending/${enc67(p.id)}/" + if (approve) "approve" else "edit", body, if (approve) "Lagt inn i Glimt husker ✓" else "Forslaget er lagret ✓") { s.edit = null }
}

fun AppViewModel.resolveConf67(c: G67Conf, choice: String) =
    memAct67(c.id, "/glimt/memory/conflicts/${enc67(c.id)}/resolve", JSONObject().put("choice", choice), "Avgjort ✓")

fun AppViewModel.keepStale67(it: G67Stale) = memAct67("s${it.id}", "/glimt/memory/stale/${it.id}/keep", JSONObject(), "Beholdt ✓")

fun AppViewModel.deleteStale67(it: G67Stale) {
    val s = g67.mem
    if (s.arm != it.id) { s.arm = it.id; return }
    s.busy["s${it.id}"] = true
    launch33 {
        try { api33 { hlDelete("/glimt/memory/${it.id}") }; s.msg = "Slettet ✓"; s.arm = null; Haptics.success(); loadMem67(); loadMem33(force = true) }
        catch (e: Exception) { s.msg = msg67(e, "Kunne ikke slette"); s.arm = null }
        s.busy.remove("s${it.id}")
    }
}

fun AppViewModel.runMem67() {
    val s = g67.mem
    s.busy["run"] = true
    launch33 {
        try {
            val o = JSONObject(api33 { request("POST", "/glimt/memory/hygiene/run-now", JSONObject(), prefix = Api.HOMELAB, read = 180_000) })
            s.msg = memRunLine67(o.optJSONObject("run")); Haptics.success(); loadMem67()
        } catch (e: Exception) { s.msg = msg67(e, "Kunne ikke kjøre") }
        s.busy.remove("run")
    }
}

fun AppViewModel.setMemSw67(sw: G67Sw, server: Boolean) {
    val next = if (server) !sw.srv else !sw.on
    putHyg67(JSONObject().put("scope", if (server) "server" else "user").put(sw.key, if (!server && next == sw.srv) JSONObject.NULL else next),
        "${sw.label} er ${if (next) "på" else "av"} for ${if (server) "alle" else "deg"}")
}

fun AppViewModel.setStaleDays67(n: Int) = putHyg67(JSONObject().put("scope", "user").put("staleDays", n), "Merkes etter ${days67(n)}")

private fun AppViewModel.putHyg67(body: JSONObject, ok: String) {
    val s = g67.mem
    launch33 {
        try { hygiene67(JSONObject(api33 { hlPut("/glimt/memory/hygiene", body) })); s.swMsg = ok; loadMem67() }
        catch (e: Exception) { s.swMsg = msg67(e, "Kunne ikke lagre") }
    }
}

/* ---------------- Kvalitet ---------------- */

private val Q67_ST = mapOf("running" to "Kjører", "ok" to "OK", "regression" to "Regresjon", "failed" to "Feilet", "skipped" to "Hoppet over", "aborted" to "Avbrutt")
private val Q67_CST = mapOf("green" to "Grønn", "red" to "Rød", "partial" to "Delvis", "env" to "Miljøfeil")
private val Q67_LAB = mapOf("nightly" to "Nattlig eval", "weekly" to "Ukerapport")
private val Q67_HELP = mapOf(
    "nightly" to "Kl. 02 hver natt kjøres eval-testene mot den lokale modellen. Du får push bare når noe som var grønt har blitt rødt. Avbrytes hvis noen bruker Glimt.",
    "weekly" to "Søndag kl. 20: én kort melding med antall forespørsler, andel løst på første forsøk, rettelser, nye oppskrifter, hurtigvei og median svartid.",
)
fun q67Status(s: String): String = Q67_ST[s] ?: s
fun q67Case(s: String): String = Q67_CST[s] ?: s

data class G67QRun(val id: String, val status: String, val line: String, val sub: String, val extra: String, val reason: String?, val regs: List<String>, val md: Boolean, val progress: Float?)
data class G67QCase(val id: String, val status: String, val reg: Boolean, val line: String, val title: String?, val reason: String?)
data class G67QDet(val cases: List<G67QCase> = emptyList(), val meta: String = "", val err: String? = null)
data class G67Week(
    val week: String, val label: String, val partial: Boolean, val text: String?, val sent: String, val tiles: List<Triple<String, String, String>>,
    val system: String?, val eval: String?, val weeks: List<Pair<String, String>>,
)

class G67Q {
    var loaded by mutableStateOf(false)
    var missing by mutableStateOf(false)
    var err by mutableStateOf("")
    var msg by mutableStateOf("")
    var week by mutableStateOf<String?>(null)
    var wk by mutableStateOf<G67Week?>(null)
    var wkErr by mutableStateOf("")
    var admin by mutableStateOf(false)
    var runs by mutableStateOf<List<G67QRun>>(emptyList())
    var running by mutableStateOf<G67QRun?>(null)
    var runsErr by mutableStateOf("")
    var runsLoaded by mutableStateOf(false)
    var keepDays by mutableStateOf(30)
    var evalOn by mutableStateOf(true)
    var next by mutableStateOf("")
    var weekly by mutableStateOf<G67Sw?>(null)
    var nightly by mutableStateOf<G67Sw?>(null)
    var swMsg by mutableStateOf("")
    var open by mutableStateOf<String?>(null)
    var allCases by mutableStateOf<String?>(null)
    val det = mutableStateMapOf<String, G67QDet>()
    val md = mutableStateMapOf<String, String>()
    var busy by mutableStateOf(false)
    /** Prompt 68: «Innstillinger for nattlig eval» (admin) – serverens verdier og utkastet som ikke er lagret. */
    var cfg by mutableStateOf<Map<String, Any>>(emptyMap())
    var draft by mutableStateOf<Map<String, Any>>(emptyMap())
    var cfgBusy by mutableStateOf(false)
    var cfgMsg by mutableStateOf("")
    var cfgErr by mutableStateOf(false)
}

/* ---------------- Prompt 68: innstillingene for nattlig eval (bare admin, PUT /settings scope 'server') ---------------- */

/** Grensene på serveren (SERVER64-API.md §2). */
val QCFG68_LIM: Map<String, IntRange> = mapOf("runs" to 1..5, "maxMinutes" to 15..360, "interactiveWaitSec" to 5..120, "keepDays" to 7..180)
/** Steget for − / + per felt. */
val QCFG68_STEP: Map<String, Int> = mapOf("runs" to 1, "maxMinutes" to 15, "interactiveWaitSec" to 5, "keepDays" to 7)
val QCFG68_BOOLS = listOf("nightly", "weekly")

/** Klemmer verdien til grensen for feltet. */
fun qClamp68(key: String, v: Int): Int {
    val r = QCFG68_LIM[key] ?: return v
    return v.coerceIn(r.first, r.last)
}

private fun qCfg68(o: JSONObject?): Map<String, Any> {
    val m = mutableMapOf<String, Any>()
    if (o == null) return m
    for (k in QCFG68_BOOLS) m[k] = o.optBoolean(k, true)
    for (k in QCFG68_LIM.keys) o.i67(k)?.let { m[k] = qClamp68(k, it) }
    return m
}

/** Feltene i utkastet som er endret (klemt til grensene) – det er bare dem «Lagre» sender. */
fun qChanged68(cfg: Map<String, Any>, draft: Map<String, Any>): Map<String, Any> {
    val out = linkedMapOf<String, Any>()
    for ((k, v) in draft) {
        val x: Any = if (v is Int) qClamp68(k, v) else v
        if (cfg[k] != x) out[k] = x
    }
    return out
}

/** Endrer utkastet (stepper, felt eller bryter). Tall klemmes til grensene. */
fun AppViewModel.setQDraft68(key: String, v: Any) {
    val s = g67.q
    val x: Any = if (v is Int) qClamp68(key, v) else v
    s.draft = s.draft + (key to x)
    s.cfgMsg = ""; s.cfgErr = false
}

/** Lagre: PUT /glimt/quality/settings {scope:'server', …} med bare de endrede feltene. */
fun AppViewModel.saveQCfg68() {
    val s = g67.q
    if (!userIsAdmin || !s.admin) return
    val ch = qChanged68(s.cfg, s.draft)
    if (ch.isEmpty()) { s.cfgMsg = "Ingen endringer"; s.cfgErr = false; return }
    val body = JSONObject().put("scope", "server")
    ch.forEach { (k, v) -> body.put(k, v) }
    s.cfgBusy = true
    launch33 {
        try {
            val r = api33 { hlPut("/glimt/quality/settings", body) }
            val srv = runCatching { JSONObject(r).optJSONObject("server") }.getOrNull()
            s.cfg = if (srv != null) qCfg68(srv) else s.cfg + ch
            s.draft = s.cfg
            s.cfgMsg = "Lagret ✓"; s.cfgErr = false
            Haptics.success(); loadQ67()
        } catch (e: Exception) { s.cfgMsg = msg67(e, "Kunne ikke lagre"); s.cfgErr = true }
        s.cfgBusy = false
    }
}

private fun qRun67(r: JSONObject): G67QRun? {
    val id = r.s67("id") ?: return null
    val st = r.s67("status") ?: ""
    val p = r.optJSONObject("progress")
    val progressLine = if (p == null || (p.i67("total") ?: 0) == 0) "Starter …" else listOfNotNull("${p.optInt("done")} av ${p.optInt("total")}", p.s67("current")).joinToString(" · ")
    val total = r.i67("total") ?: 0
    val line = when {
        st == "running" -> progressLine
        total == 0 -> r.s67("reason") ?: if (st == "skipped") "Ikke kjørt" else ""
        else -> listOfNotNull("${r.optInt("passed")}/$total bestått", r.i67("cases")?.let { "${r.optInt("greenCases")}/$it caser grønne" },
            r.d67("p50Ms")?.let { "p50 ${ms67(it)}" }, r.d67("p90Ms")?.let { "p90 ${ms67(it)}" }).joinToString(" · ")
    }
    fun n(v: Int, one: String, many: String) = if (v > 0) "$v ${if (v == 1) one else many}" else null
    val extra = listOfNotNull(n(r.optInt("modelFailures"), "modellfeil", "modellfeil"), n(r.optInt("envFailures"), "miljøfeil", "miljøfeil")?.let { "$it (teller ikke)" },
        n(r.optJSONArray("improved")?.length() ?: 0, "case bedre", "caser bedre"), n(r.optInt("newCases"), "ny case", "nye caser"), if (r.optBoolean("notified")) "push sendt" else null).joinToString(" · ")
    val sub = listOfNotNull(when67(r.s67("startedAt")).takeIf { it.isNotBlank() }, if (r.s67("trigger") == "run-now") "kjørt manuelt" else null, r.d67("ms")?.let { ms67(it) }, r.s67("model")).joinToString(" · ")
    val regs = r.optJSONArray("regressions").objs67().map { x -> "${x.optString("caseId")} ${x.s67("before") ?: "?"} → ${x.s67("now") ?: "?"}" + (x.s67("reason")?.let { ": $it" } ?: "") }
    val pr = p?.let { x -> val t = x.optInt("total"); if (t > 0) (x.optInt("done").toFloat() / t).coerceIn(0f, 1f) else 0f }
    return G67QRun(id, st, line.ifBlank { q67Status(st) }, sub, extra, r.s67("reason")?.takeIf { st != "running" }, regs, r.optJSONObject("report")?.optBoolean("md") == true, pr)
}

private fun week67(w: JSONObject): G67Week {
    val u = w.optJSONObject("user") ?: JSONObject()
    val tiles = listOf(
        Triple("Forespørsler", "${u.optInt("requests")}", ""),
        Triple("Løst på første forsøk", pct67(u.d67("firstTryShare")), u.i67("firstTry")?.let { "$it av ${u.optInt("requests")}" } ?: ""),
        Triple("Rettelser", "${u.optInt("corrections")}", ""),
        Triple("Nye oppskrifter", "${u.optInt("newRecipes")}", ""),
        Triple("Hurtigvei", pct67(u.d67("fastShare")), u.i67("fast")?.let { "$it svar" } ?: ""),
        Triple("Svar-cache", pct67(u.d67("cacheShare")), u.i67("cache")?.let { "$it svar" } ?: ""),
        Triple("Median svartid", ms67(u.d67("medianMs")), u.d67("p90Ms")?.let { "p90 ${ms67(it)}" } ?: ""),
    )
    val sys = w.optJSONObject("system")
    val sysLine = sys?.let { s ->
        listOf("${s.optInt("requests")} forespørsler fra ${s.optInt("users")} ${if (s.optInt("users") == 1) "bruker" else "brukere"}", "${pct67(s.d67("firstTryShare"))} første forsøk",
            "${s.optInt("corrections")} rettelser", "${s.optInt("newRecipes")} nye oppskrifter", "hurtigvei ${pct67(s.d67("fastShare"))}", "median ${ms67(s.d67("medianMs"))}").joinToString(" · ")
    }
    val ev = sys?.optJSONObject("eval")?.let { e ->
        fun n(v: Int, one: String, many: String) = "$v ${if (v == 1) one else many}"
        listOfNotNull(n(e.optInt("runs"), "nattlig kjøring", "nattlige kjøringer"), "${e.optInt("completed")} fullført", n(e.optInt("regressions"), "regresjon", "regresjoner"),
            e.optInt("aborted").takeIf { it > 0 }?.let { "$it avbrutt" }, e.optInt("skipped").takeIf { it > 0 }?.let { "$it hoppet over" }).joinToString(" · ")
    }
    val sent = when {
        w.s67("sentAt") != null -> "Sendt som push ${when67(w.s67("sentAt"))}"
        w.optBoolean("partial") -> "Uka er ikke ferdig – tallene oppdateres fortløpende"
        w.b67("enabled") == false -> "Ukerapporten er slått av – ingen push"
        else -> "Ikke sendt"
    }
    val weeks = w.optJSONArray("weeks").objs67().mapNotNull { x -> x.s67("week")?.let { it to (x.s67("label") ?: it) } }
    return G67Week(w.optString("week"), w.s67("label") ?: w.optString("week"), w.optBoolean("partial"), w.s67("text"), sent, tiles, sysLine, ev, weeks)
}

fun AppViewModel.loadQ67() {
    val s = g67.q
    launch33 {
        val st = runCatching { JSONObject(api33 { hlGet("/glimt/quality/settings") }) }
        if (st.exceptionOrNull()?.let(::missing67) == true) { s.missing = true; s.loaded = true; return@launch33 }
        s.missing = false
        st.getOrNull()?.let { o ->
            val sw = sws67(o, listOf("nightly", "weekly"), Q67_LAB, Q67_HELP)
            s.weekly = sw.firstOrNull { it.key == "weekly" }; s.nightly = sw.firstOrNull { it.key == "nightly" }
            s.admin = o.optBoolean("admin") && userIsAdmin
            s.keepDays = o.optJSONObject("server")?.i67("keepDays") ?: s.keepDays
            // Prompt 68: serverens verdier for «Innstillinger for nattlig eval»; utkastet følger med når ingenting er endret.
            val dirty = qChanged68(s.cfg, s.draft).isNotEmpty()
            s.cfg = qCfg68(o.optJSONObject("server"))
            if (!dirty) s.draft = s.cfg
            val sch = o.optJSONObject("schedules")?.optJSONObject("nightly")
            s.evalOn = o.optJSONObject("settings")?.optBoolean("nightly", true) != false
            s.next = when {
                !s.evalOn -> "Nattlig eval er slått av"
                sch?.s67("status") == "paused" -> "Satt på pause i Faste oppgaver"
                sch?.s67("nextRunAt") != null -> "Neste ${when67(sch.s67("nextRunAt"))}"
                else -> "Hver natt kl. 02"
            }
        }
        s.err = st.exceptionOrNull()?.let { msg67(it, "Serveren svarte") } ?: ""
        loadWeek67()
        if (s.admin) loadQRuns67()
        s.loaded = true
    }
}

fun AppViewModel.loadWeek67(week: String? = g67.q.week) {
    val s = g67.q
    s.week = week
    launch33 {
        try { s.wk = week67(JSONObject(api33 { hlGet("/glimt/quality/weekly" + (week?.let { "?week=" + enc67(it) } ?: "")) })); s.wkErr = "" }
        catch (e: Exception) { s.wkErr = msg67(e, "Serveren svarte") }
    }
}

fun AppViewModel.loadQRuns67() {
    val s = g67.q
    launch33 {
        try {
            val o = JSONObject(api33 { hlGet("/glimt/quality/runs?limit=30") })
            s.running = o.optJSONObject("running")?.let(::qRun67)
            s.runs = o.optJSONArray("items").objs67().mapNotNull(::qRun67).filter { it.status != "running" || it.id != s.running?.id }
            s.keepDays = o.i67("keepDays") ?: s.keepDays
            if (o.b67("enabled") == false) s.evalOn = false
            s.runsErr = ""
        } catch (e: Exception) {
            if (e is ApiException && e.status == 403 && e.message?.startsWith(Api.TOKEN_REFUSED) != true) s.admin = false else s.runsErr = msg67(e, "Serveren svarte")
        }
        s.runsLoaded = true
    }
}

fun AppViewModel.toggleQRun67(id: String) {
    val s = g67.q
    s.open = if (s.open == id) null else id
    if (s.open == null || s.det[id]?.err == null && s.det[id] != null) return
    launch33 {
        s.det[id] = try {
            val o = JSONObject(api33 { hlGet("/glimt/quality/runs/" + enc67(id)) })
            val rank = mapOf("red" to 1, "partial" to 2, "env" to 3, "green" to 4)
            val cases = o.optJSONArray("cases").objs67().map { c ->
                val b = c.optJSONObject("baseline")
                G67QCase(c.optString("id"), c.optString("status"), c.optBoolean("regression"),
                    "${c.optInt("passes")}/${c.optInt("runs")}" + (c.optInt("envRuns").takeIf { it > 0 }?.let { " (+$it miljø)" } ?: "") + (b?.let { " · før ${it.optInt("passes")}/${it.optInt("runs")}" } ?: "") + " · p50 ${ms67(c.d67("p50Ms"))}",
                    c.s67("title"), c.s67("reason") ?: if (c.optString("status") == "env") c.optJSONArray("envReasons").strs67().firstOrNull() else null)
            }.sortedWith(compareBy({ if (it.reg) 0 else rank[it.status] ?: 5 }, { it.id }))
            val meta = listOfNotNull(o.s67("backend"), o.s67("url"), o.s67("commit")?.let { "commit $it" }, o.i67("runsPerCase")?.let { "$it kjøringer per case" },
                o.s67("baselineRunId")?.let { "sammenlignet med $it" } ?: "ingen tidligere kjøring å sammenligne med").joinToString(" · ")
            G67QDet(cases, meta)
        } catch (e: Exception) { G67QDet(err = msg67(e, "Kunne ikke hente casene")) }
    }
}

fun AppViewModel.loadQMd67(id: String) {
    val s = g67.q
    if (s.md.containsKey(id)) { s.md.remove(id); return }
    s.md[id] = "Henter rapporten …"
    launch33 {
        s.md[id] = try { api33 { request("GET", "/glimt/quality/runs/" + enc67(id) + "?format=md", prefix = Api.HOMELAB) } }
        catch (e: Exception) { "Kunne ikke hente rapporten: ${e.message}" }
    }
}

fun AppViewModel.runQ67() {
    val s = g67.q
    if (!userIsAdmin) return
    s.busy = true
    launch33 {
        try {
            val o = JSONObject(api33 { hlPost("/glimt/quality/run-now", JSONObject()) })
            val r = o.optJSONObject("run")?.let(::qRun67)
            s.msg = if (o.optBoolean("ok", true)) "Eval startet" else "Ikke kjørt: ${r?.reason ?: r?.line ?: ""}"
            Haptics.success(); loadQRuns67()
        } catch (e: Exception) { s.msg = msg67(e, "Kunne ikke starte"); loadQRuns67() }
        s.busy = false
    }
}

fun AppViewModel.abortQ67() {
    val s = g67.q
    if (!userIsAdmin) return
    s.busy = true
    launch33 {
        try { api33 { hlPost("/glimt/quality/abort", JSONObject()) }; s.msg = "Avbrutt"; loadQRuns67() }
        catch (e: Exception) { s.msg = msg67(e, "Kunne ikke avbryte") }
        s.busy = false
    }
}

fun AppViewModel.setQSw67(sw: G67Sw, server: Boolean) {
    val s = g67.q
    val next = if (server) !sw.srv else !sw.on
    val body = JSONObject().put("scope", if (server) "server" else "user").put(sw.key, if (!server && next == sw.srv) JSONObject.NULL else next)
    launch33 {
        try { api33 { hlPut("/glimt/quality/settings", body) }; s.swMsg = "${sw.label} er ${if (next) "på" else "av"} for ${if (server) "alle" else "deg"}"; loadQ67() }
        catch (e: Exception) { s.swMsg = msg67(e, "Kunne ikke lagre") }
    }
}

/* ---------------- Tilstanden ---------------- */

class G67State {
    val rec = G67Rec()
    val sch = G67Sch()
    val ent = G67EntS()
    val mem = G67Mem()
    val q = G67Q()
}

/**
 * Gamle/eksterne navn på sidene (web-lenker i push: /#/innstillinger/faste-oppgaver, …/glimt-husker, …/kvalitet[/run/<id>|/uke/<uke>])
 * → sidene i appen. Brukes av settingsLink35 (finanshub://settings/<side>). null = ikke en av disse.
 */
fun AppViewModel.alias67(path: String): String? {
    val parts = path.trim('/').lowercase().split('/')
    return when (parts.firstOrNull()) {
        "faste-oppgaver", "faste", "planlagte", "schedules" -> "g67sch"
        "glimt-husker", "minne", "husker", "memory" -> "g67mem"
        "glimt-laerer", "glimt-lærer", "oppskrifter", "recipes" -> "g67rec"
        "entiteter", "entitetsregister", "entities" -> "g67ent"
        "kvalitet", "quality", "eval", "ukerapport" -> {
            when (parts.getOrNull(1)) {
                "run" -> parts.getOrNull(2)?.takeIf { Regex("^q[0-9a-f]{14}$").matches(it) }?.let { g67.q.open = null; toggleQRun67(it) }
                "uke" -> parts.getOrNull(2)?.uppercase()?.takeIf { Regex("^\\d{4}-W\\d{2}$").matches(it) }?.let { g67.q.week = it }
            }
            "g67q"
        }
        "glimt67", "glimt-og-ai" -> "glimt67"
        "huske", "gjoremal", "gjøremål" -> "kal"
        // Prompt 68: Husstand → Brukere og familie (ui/Users68Ui.kt), som web-aliasene i settings65.js.
        "brukere-og-familie", "users", "brukere", "familie", "family", "fam", "husstand", "barn", "helse", "healthpos" -> "users68"
        else -> null
    }
}
