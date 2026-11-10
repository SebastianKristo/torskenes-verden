package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.Locale

/*
 * Prompt 82 (CHKAND, CONTRACT82): sjekk ut deler til et produkt (prosjekt) og sjekk dem inn igjen.
 *  - Delsiden: «Sjekk ut» → ark med antall (± maks lager), produkt (aktive + «Nytt produkt …»), notat → POST /checkout. Angre (10 min på
 *    serveren, 10 s i feltet) via POST /checkout/undo {undoToken}. Seksjonen «Brukt i» (GET /parts/:id → usedIn[]), trykk åpner produktet.
 *  - Plukklista: «Til produkt: [velg/ingen]». Med produkt går «Ta ut av lager» via POST /checkout (alt eller ingenting), uten som før.
 *  - Produkter (skjermene «projects» og «project»): liste (navn, status, antall deler, kostnad), stykkliste med bilde, navn, antall og
 *    plassering, «Sjekk inn» per del (POST /usage/:id/return, nyeste linje først), «Marker som ferdig», «Gi nytt navn», «Slett».
 * UI: ui/Skjold82Ui.kt.
 */

data class SkjProject82(
    val id: String, val name: String, val status: String, val notes: String?, val parts: Int, val units: Double, val cost: Double?, val updated: String?,
) {
    val done: Boolean get() = status == "ferdig"
}

/** Én utsjekking (skj_usage-rad) i et produkt. */
data class SkjUsage82(
    val usageId: String, val partId: String, val name: String, val thumbUrl: String?, val qty: Double, val returnedQty: Double,
    val at: String?, val loc: String, val unit: String, val price: Double?, val note: String? = null,
) {
    val net: Double get() = net82(qty, returnedQty)
}

/** Stykklistelinje: én del, summen av utsjekkingene. */
data class SkjBom82(
    val partId: String, val name: String, val thumbUrl: String?, val loc: String, val unit: String, val price: Double?, val net: Double, val lines: List<SkjUsage82>,
)

/** «Brukt i» på delsiden. */
data class SkjUsedIn82(val projectId: String, val name: String, val qty: Double, val status: String)

/** Arket «Sjekk ut» (fra delsiden). [projectId] null + [newName] ikke null = nytt produkt. */
data class SkjCheckout82(val part: SkjPart76, val qty: Int = 1, val projectId: String? = null, val newName: String? = null, val note: String = "")

object Skjold82 {
    var projects by mutableStateOf<List<SkjProject82>?>(null)
    var projErr by mutableStateOf<String?>(null)
    var current by mutableStateOf<SkjProject82?>(null)
    var lines by mutableStateOf<List<SkjUsage82>?>(null)
    var sheet by mutableStateOf<SkjCheckout82?>(null)
    var busy by mutableStateOf(false)
    /** Plukklista: produktet delene går til (null = ingen). [pickNew] = navn på nytt produkt. */
    var pickProject by mutableStateOf<String?>(null)
    var pickNew by mutableStateOf<String?>(null)
    var renameAsk by mutableStateOf(false)
    var deleteAsk by mutableStateOf(false)
    /** Del-id → antall som sjekkes inn (åpent inline-felt). */
    var returning by mutableStateOf<Pair<String, Int>?>(null)
    var missing by mutableStateOf(false)
    internal var seq = 0

    fun reset() {
        projects = null; projErr = null; current = null; lines = null; sheet = null; busy = false; pickProject = null; pickNew = null
        renameAsk = false; deleteAsk = false; returning = null; missing = false; seq++
    }

    /** Ark/dialog åpent (tilbake lukker det først). */
    val modal: Boolean get() = sheet != null || renameAsk || deleteAsk || returning != null
    fun closeModal() { sheet = null; renameAsk = false; deleteAsk = false; returning = null }
}

/* ======================= Rene regler (speilet i test/p82-and.test.js) ======================= */

internal const val MAX_NAME82 = 80

/** Netto utsjekket (aldri under 0). */
internal fun net82(qty: Double, returned: Double): Double = (qty - returned).coerceAtLeast(0.0)

/** Største antall som kan sjekkes ut: hele stk på lager. */
internal fun maxOut82(stock: Double): Int = if (stock.isNaN() || stock <= 0) 0 else Math.floor(stock + 1e-9).toInt().coerceAtMost(9999)

/** Antallet i arket: 1 … lager (0 når lageret er tomt). */
internal fun clampOut82(n: Int, stock: Double): Int = maxOut82(stock).let { m -> if (m <= 0) 0 else n.coerceIn(1, m) }

/** Gyldig produktnavn: trimmet, 1–80 tegn (null = ugyldig). */
internal fun projectName82(s: String?): String? = s?.trim()?.replace(Regex("\\s+"), " ")?.takeIf { it.isNotEmpty() && it.length <= MAX_NAME82 }

/** Aktivt produkt med samme navn (uten hensyn til store/små bokstaver). */
internal fun findActive82(list: List<SkjProject82>, name: String): SkjProject82? {
    val n = name.trim().lowercase(Locale("nb", "NO"))
    return list.firstOrNull { !it.done && it.name.trim().lowercase(Locale("nb", "NO")) == n }
}

/** Aktive først, så ferdige; ellers serverens rekkefølge. */
internal fun sortProjects82(list: List<SkjProject82>): List<SkjProject82> = list.filter { !it.done } + list.filter { it.done }

/** Stykklista: utsjekkingene gruppert per del (i rekkefølgen delen først ble sjekket ut), bare deler med noe igjen. */
internal fun bom82(lines: List<SkjUsage82>): List<SkjBom82> = lines.groupBy { it.partId }.map { (id, ls) ->
    val f = ls.first()
    SkjBom82(id, f.name, ls.firstNotNullOfOrNull { it.thumbUrl }, ls.lastOrNull { it.loc.isNotBlank() }?.loc ?: "", f.unit, ls.firstNotNullOfOrNull { it.price },
        ls.sumOf { it.net }, ls)
}.filter { it.net > 1e-9 }

/** Hvilke linjer «Sjekk inn [qty]» går til: nyeste utsjekking først, aldri mer enn netto per linje. */
internal fun returnPlan82(lines: List<SkjUsage82>, qty: Double): List<Pair<String, Double>> {
    var left = qty
    val out = mutableListOf<Pair<String, Double>>()
    for (l in lines.filter { it.net > 1e-9 }.sortedByDescending { it.at ?: "" }) {
        if (left <= 1e-9) break
        val n = minOf(left, l.net)
        out += l.usageId to n
        left -= n
    }
    return out
}

/** Kan slettes bare uten aktive utsjekkinger. */
internal fun canDelete82(units: Double): Boolean = units <= 1e-9

/** «12 stk · 4 deler · 230 kr». */
internal fun projSub82(p: SkjProject82): String = listOfNotNull(
    "${qtyText76(p.units)} stk", "${p.parts} ${if (p.parts == 1) "del" else "deler"}", p.cost?.let { costText82(it) },
).joinToString(" · ")

internal fun costText82(v: Double): String = String.format(Locale("nb", "NO"), "%,.0f", v).replace(Regex("[\\u00A0\\u202F]"), " ") + " kr"

internal fun statusText82(s: String): String = if (s == "ferdig") "Ferdig" else "Aktiv"

/** Toast etter utsjekking. */
internal fun outText82(n: Double, project: String): String = "Sjekket ut ${qtyText76(n)} stk til «$project»"

/** Body for POST /checkout. */
internal fun checkoutBody82(projectId: String?, projectName: String?, items: List<Pair<String, Int>>, note: String?): JSONObject = JSONObject().apply {
    if (projectId != null) put("projectId", projectId.toLongOrNull() ?: projectId) else put("projectName", projectName ?: "")
    put("items", JSONArray().apply { items.forEach { (id, q) -> put(JSONObject().put("partId", id.toLongOrNull() ?: id).put("qty", q)) } })
    note?.trim()?.takeIf { it.isNotEmpty() }?.let { put("note", it.take(500)) }
}

/* ======================= Parsing ======================= */

private fun JSONObject.id82(vararg k: String): String? {
    for (x in k) if (has(x) && !isNull(x)) opt(x)?.toString()?.takeIf { it.isNotBlank() && it != "null" }?.let { return it }
    return null
}

internal fun parseProject82(o: JSONObject): SkjProject82? {
    val id = o.id82("id", "projectId") ?: return null
    val cost = if (o.has("cost") && !o.isNull("cost")) o.optDouble("cost").takeIf { !it.isNaN() } else null
    return SkjProject82(id, o.s43("name") ?: "Uten navn", if (o.s43("status") == "ferdig") "ferdig" else "aktiv", o.s43("notes"),
        o.i43("parts") ?: 0, o.d43("units") ?: 0.0, cost, o.s43("updated", "updatedAt"))
}

internal fun parseProjects82(raw: String): List<SkjProject82> = sortProjects82(objs34(arr76(raw, "projects")).mapNotNull { parseProject82(it) })

private fun parseUsage82(o: JSONObject, d: JSONObject? = null): SkjUsage82? {
    val uid = o.id82("usageId", "id") ?: return null
    val pid = o.id82("partId", "part_id") ?: d?.id82("partId", "part_id") ?: return null
    val loc = o.opt("loc").let { if (it is JSONObject) it.s43("text") else o.s43("loc", "location") } ?: d?.s43("loc", "location") ?: ""
    return SkjUsage82(
        uid, pid, o.s43("name") ?: d?.s43("name") ?: "Del $pid", fileUrl76(o.s43("thumbUrl", "thumb") ?: d?.s43("thumbUrl", "thumb")),
        o.d43("qty") ?: 0.0, o.d43("returnedQty", "returned_qty", "returned") ?: 0.0, o.s43("at"), loc, o.s43("unit") ?: d?.s43("unit") ?: "stk",
        o.d43("price") ?: d?.d43("price"), o.s43("note"),
    )
}

/** GET /projects/:id → (prosjekt, linjer). items er enkeltlinjer, eller grupper per del med lines/usages inni. */
internal fun parseProjectDetail82(raw: String): Pair<SkjProject82?, List<SkjUsage82>> {
    val o = JSONObject(raw)
    val p = parseProject82(o.optJSONObject("project") ?: o)
    val lines = objs34(o.optJSONArray("items") ?: o.optJSONObject("project")?.optJSONArray("items")).flatMap { g ->
        val sub = g.optJSONArray("lines") ?: g.optJSONArray("usages")
        if (sub != null) objs34(sub).mapNotNull { parseUsage82(it, g) } else listOfNotNull(parseUsage82(g))
    }.distinctBy { it.usageId }
    return p to lines
}

/** usedIn[] fra GET /parts/:id (netto > 0). */
internal fun usedIn82(part: SkjPart76?): List<SkjUsedIn82> = objs34(part?.raw?.optJSONArray("usedIn")).mapNotNull { o ->
    val id = o.id82("projectId", "id") ?: return@mapNotNull null
    SkjUsedIn82(id, o.s43("name") ?: "Produkt", o.d43("qty") ?: 0.0, o.s43("status") ?: "aktiv")
}.filter { it.qty > 1e-9 }

/* ======================= Nettverk ======================= */

private fun enc82(s: String): String = URLEncoder.encode(s, "UTF-8")
private suspend fun AppViewModel.get82(path: String): String = api46 { hlGet(API76 + path, 10_000) }
private suspend fun AppViewModel.post82(path: String, body: JSONObject = JSONObject()): String = api46 { hlPost(API76 + path, body) }
private suspend fun AppViewModel.patch82(path: String, body: JSONObject): String = api46 { request("PATCH", API76 + path, body, prefix = Api.HOMELAB) }
private suspend fun AppViewModel.del82(path: String): String = api46 { hlDelete(API76 + path) }

internal fun errText82(e: Exception, fallback: String): String = when {
    e is ApiException && e.status == 0 && e.code == null -> NEED_NET76
    e is ApiException && e.status == 404 && e.code == null -> "Serveren har ikke produkter ennå. Oppdater Homelab."
    e is ApiException && e.status == 429 -> "Vent litt – for mange kall på kort tid."
    e is ApiException -> e.message?.takeIf { it.isNotBlank() } ?: fallback
    else -> uiErr73(e, fallback)
}

/** Henter produktlista (stille ved feil når [quiet]). */
fun AppViewModel.loadProjects82(quiet: Boolean = false) {
    val s = Skjold82
    launch46 {
        try {
            s.projects = parseProjects82(get82("/projects"))
            s.projErr = null; s.missing = false
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (e is ApiException && e.status == 404 && e.code == null) s.missing = true
            if (!quiet) s.projErr = errText82(e, "Fikk ikke hentet produktene.")
            if (s.projects == null && !quiet) s.projects = emptyList()
        }
    }
}

/** «Produkter» i Skjold Lab. */
fun AppViewModel.openProjects82() {
    push76("projects")
    Haptics.tap()
    loadProjects82()
}

/** Produktsiden (stykklista). */
fun AppViewModel.openProject82(id: String) {
    val s = Skjold82
    s.current = s.projects?.firstOrNull { it.id == id } ?: s.current?.takeIf { it.id == id }
    if (s.current?.id != id) s.current = null
    s.lines = null; s.returning = null; s.renameAsk = false; s.deleteAsk = false
    push76("project")
    Haptics.tap()
    loadProject82(id)
}

fun AppViewModel.loadProject82(id: String) {
    val s = Skjold82
    val seq = ++s.seq
    launch46 {
        try {
            val (p, l) = parseProjectDetail82(get82("/projects/${enc82(id)}"))
            if (seq != s.seq) return@launch46
            if (p != null) s.current = p
            s.lines = l
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (seq == s.seq) { s.lines = s.lines ?: emptyList(); flash(errText82(e, "Fikk ikke hentet produktet.")) }
        }
    }
}

/** Åpner arket «Sjekk ut» fra delsiden. */
fun AppViewModel.startCheckout82(pt: SkjPart76) {
    val s = Skjold82
    if (maxOut82(pt.qty) <= 0) { flash("Ingen ${pt.unit} på lager å sjekke ut"); Haptics.error(); return }
    val active = s.projects.orEmpty().filter { !it.done }
    s.sheet = SkjCheckout82(pt, 1, active.firstOrNull()?.id, if (active.isEmpty()) "" else null)
    Haptics.tap()
    loadProjects82(quiet = true)
}

/** Etter utsjekking/innsjekking: oppdater delen, lista, produktene og plukklista. */
private fun AppViewModel.after82(partIds: Collection<String>) {
    val s76 = Skjold76
    s76.part?.takeIf { it.id in partIds }?.let { openPartQuiet82(it.id) }
    searchSkjold76(now = true)
    loadProjects82(quiet = true)
    Skjold82.current?.let { if (s76.screen == "project") loadProject82(it.id) }
}

/** Henter delen på nytt (antall og usedIn) uten å bytte skjerm. */
private fun AppViewModel.openPartQuiet82(id: String) = launch46 {
    val p = try { parsePart76(JSONObject(get82("/parts/${enc82(id)}")).let { it.optJSONObject("part") ?: it }) } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
    if (p != null && Skjold76.part?.id == id) Skjold76.part = p
}

/**
 * POST /checkout. Alt eller ingenting: 409 når en del ikke har nok (ingenting er endret). [done] får true når det gikk.
 * Angre: POST /checkout/undo {undoToken}.
 */
internal fun AppViewModel.checkout82(projectId: String?, projectName: String?, items: List<Pair<String, Int>>, note: String?, done: (Boolean) -> Unit = {}) {
    val s = Skjold82
    if (s.busy || items.isEmpty() || items.any { it.second <= 0 }) return
    val name = if (projectId == null) projectName82(projectName) ?: run { flash("Gi produktet et navn (maks $MAX_NAME82 tegn)"); Haptics.error(); return } else null
    s.busy = true
    launch46 {
        try {
            val o = JSONObject(post82("/checkout", checkoutBody82(projectId, name, items, note)))
            val proj = o.optJSONObject("project")?.let { parseProject82(it) }
            val label = proj?.name ?: name ?: s.projects?.firstOrNull { it.id == projectId }?.name ?: "produktet"
            val token = o.s43("undoToken")
            Haptics.success()
            done(true)
            after82(items.map { it.first })
            val n = items.sumOf { it.second }.toDouble()
            if (token != null) offerUndo76(outText82(n, label)) {
                post82("/checkout/undo", JSONObject().put("undoToken", token))
                after82(items.map { it.first })
                flash("Lagret er som før")
            } else flash(outText82(n, label))
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            done(false)
            val msg = errText82(e, "Kunne ikke sjekke ut.")
            flash(if (e is ApiException && e.status == 409) "Ikke nok på lager – ingenting er sjekket ut. $msg" else "Kunne ikke sjekke ut: $msg")
            Haptics.error()
        } finally { s.busy = false }
    }
}

/** «Sjekk ut» i arket. */
fun AppViewModel.confirmCheckout82() {
    val c = Skjold82.sheet ?: return
    val n = clampOut82(c.qty, c.part.qty)
    if (n <= 0) { flash("Ingen ${c.part.unit} på lager"); Haptics.error(); return }
    if (c.projectId == null && projectName82(c.newName) == null) { flash("Gi produktet et navn (maks $MAX_NAME82 tegn)"); Haptics.error(); return }
    checkout82(c.projectId, c.newName, listOf(c.part.id to n), c.note) { ok -> if (ok) Skjold82.sheet = null }
}

/** «Sjekk inn» [qty] av en del i produktet (fordelt på linjene, nyeste først). */
fun AppViewModel.returnPart82(b: SkjBom82, qty: Int) {
    val s = Skjold82
    val proj = s.current ?: return
    if (s.busy || qty <= 0) return
    val plan = returnPlan82(b.lines, qty.toDouble())
    if (plan.isEmpty()) return
    s.busy = true
    launch46 {
        var done = 0.0
        try {
            for ((uid, n) in plan) { post82("/usage/${enc82(uid)}/return", JSONObject().put("qty", n)); done += n }
            Haptics.success()
            flash("Sjekket inn ${qtyText76(done)} ${b.unit} fra «${proj.name}»")
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            flash((if (done > 0) "Sjekket inn ${qtyText76(done)}, men resten feilet: " else "Kunne ikke sjekke inn: ") + errText82(e, "feil"))
            Haptics.error()
        } finally {
            s.busy = false; s.returning = null
            after82(listOf(b.partId))
            loadProject82(proj.id)
        }
    }
}

private fun AppViewModel.patchProject82(body: JSONObject, ok: String) {
    val s = Skjold82
    val proj = s.current ?: return
    if (s.busy) return
    s.busy = true
    launch46 {
        try {
            val raw = patch82("/projects/${enc82(proj.id)}", body)
            runCatching { JSONObject(raw).let { it.optJSONObject("project") ?: it } }.getOrNull()?.let { parseProject82(it) }?.let { np ->
                s.current = np.copy(parts = if (np.parts == 0) proj.parts else np.parts, units = if (np.units == 0.0) proj.units else np.units, cost = np.cost ?: proj.cost)
            } ?: run { s.current = proj.copy(name = body.optString("name", proj.name), status = body.optString("status", proj.status)) }
            Haptics.success()
            flash(ok)
            loadProjects82(quiet = true)
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            flash("Kunne ikke lagre: " + errText82(e, "feil")); Haptics.error()
        } finally { s.busy = false }
    }
}

/** «+ Nytt produkt» i lista: POST /projects {name}. Finnes et aktivt med samme navn, åpnes det. */
fun AppViewModel.createProject82(name: String) {
    val s = Skjold82
    val n = projectName82(name) ?: run { flash("Navnet må ha 1–$MAX_NAME82 tegn"); Haptics.error(); return }
    findActive82(s.projects.orEmpty(), n)?.let { openProject82(it.id); return }
    if (s.busy) return
    s.busy = true
    launch46 {
        try {
            val o = JSONObject(post82("/projects", JSONObject().put("name", n)))
            val pr = parseProject82(o.optJSONObject("project") ?: o)
            Haptics.success()
            loadProjects82(quiet = true)
            if (pr != null) { s.projects = sortProjects82(listOf(pr) + s.projects.orEmpty().filter { it.id != pr.id }); openProject82(pr.id) }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            flash("Kunne ikke lage produktet: " + errText82(e, "feil")); Haptics.error()
        } finally { s.busy = false }
    }
}

fun AppViewModel.renameProject82(name: String) {
    val n = projectName82(name) ?: run { flash("Navnet må ha 1–$MAX_NAME82 tegn"); Haptics.error(); return }
    Skjold82.renameAsk = false
    patchProject82(JSONObject().put("name", n), "Nytt navn: «$n»")
}

/** «Marker som ferdig» / «Gjør aktiv igjen». */
fun AppViewModel.toggleDone82() {
    val p = Skjold82.current ?: return
    val next = if (p.done) "aktiv" else "ferdig"
    patchProject82(JSONObject().put("status", next), if (next == "ferdig") "«${p.name}» er ferdig" else "«${p.name}» er aktiv igjen")
}

/** «Slett» (bare uten aktive utsjekkinger – serveren svarer 409 ellers). */
fun AppViewModel.deleteProject82() {
    val s = Skjold82
    val proj = s.current ?: return
    s.deleteAsk = false
    if (s.busy) return
    s.busy = true
    launch46 {
        try {
            del82("/projects/${enc82(proj.id)}")
            Haptics.success()
            flash("«${proj.name}» er slettet")
            s.projects = s.projects?.filter { it.id != proj.id }
            if (Skjold76.screen == "project") Skjold76.stack = Skjold76.stack.dropLast(1)
            s.current = null; s.lines = null
            loadProjects82(quiet = true)
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            flash(if (e is ApiException && e.status == 409) "Sjekk inn alle delene før produktet kan slettes." else "Kunne ikke slette: " + errText82(e, "feil"))
            Haptics.error()
        } finally { s.busy = false }
    }
}

/** Plukklista: «Ta ut av lager» med produkt → én utsjekking (alt eller ingenting), tømmer lista ved suksess. */
internal fun AppViewModel.takeOutTo82(): Boolean {
    val s = Skjold82
    val pid = s.pickProject
    val newName = s.pickNew
    if (pid == null && newName == null) return false
    val list = Skjold79.items
    if (list.isEmpty()) return true
    if (pid == null && projectName82(newName) == null) { flash("Gi produktet et navn (maks $MAX_NAME82 tegn)"); Haptics.error(); return true }
    val items = list.map { it.id to it.take }
    checkout82(pid, newName, items, null) { ok ->
        if (ok) {
            val ids = items.map { it.first }.toSet()
            Skjold79.items = Skjold79.items.filter { it.id !in ids }
            pickChanged79()
            s.pickNew = null
            s.pickProject = s.projects?.firstOrNull { it.id == pid }?.takeIf { !it.done }?.id
        }
    }
    return true
}
