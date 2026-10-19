package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 33 (GLIMT-MEMORY): «Glimt husker» – det brukeren har lært Glimt, per bruker på serveren.
 * Alias = avsender/bedrift → type/tittel («påhåret» → Frisør · Påhåret Studio Hoff).
 * API: GET/POST /api/glimt/memory {match, type, title?} → {item, matches}, DELETE /api/glimt/memory/:id,
 *      POST /api/glimt/memory/:id/apply {dryRun?} → {count}. Hendelsen som vises: GET /api/kalender/events/:id (konteksten for
 *      «det var frisør» i Glimt). PATCH /api/kalender/events/:id kan svare suggestMemory {match, name, type, title, text}.
 * Grensesnittet: ui/Memory33Ui.kt (Innstillinger → AI → GLIMT HUSKER, «Lær Glimt hva dette er…» i detaljarket og arket).
 */

data class Mem33Item(val id: Int, val match: String, val type: String, val title: String)

/** Arket «Lær Glimt hva dette er…». asked = lagret, viser «Endre tittel på N avtaler?». */
data class Mem33Learn(
    val name: String, val type: String = "", val title: String = "", val text: String = "", val suggest: Boolean = false,
    val asked: Boolean = false, val count: Int = 0, val memId: Int? = null, val err: String = "", val busy: Boolean = false,
)

data class Mem33Ask(val id: Int, val count: Int, val title: String)

class Mem33State {
    var items by mutableStateOf<List<Mem33Item>>(emptyList())
    var loaded by mutableStateOf(false)
    var missing by mutableStateOf(false)
    var msg by mutableStateOf("")
    var learn by mutableStateOf<Mem33Learn?>(null)
    var ask by mutableStateOf<Mem33Ask?>(null)
    var adding by mutableStateOf(false)
}

val MEM33_TYPES: List<Pair<String, String>> = listOf("frisør" to "Frisør", "lege" to "Lege", "tannlege" to "Tannlege", "fysio" to "Fysio",
    "optiker" to "Optiker", "psykolog" to "Psykolog", "annet" to "Annet")
fun mem33TypeName(t: String): String = MEM33_TYPES.firstOrNull { it.first == t }?.second ?: "Annet"
/** «frisøren din» (Ok, Glimt husker at X er frisøren din). */
fun mem33Din(t: String): String = mapOf("frisør" to "frisøren din", "lege" to "legen din", "tannlege" to "tannlegen din", "fysio" to "fysioterapeuten din",
    "optiker" to "optikeren din", "psykolog" to "psykologen din")[t] ?: "lagret"
/** «→ Frisør · Påhåret» i listen (tittelen alene når den allerede sier typen). */
fun mem33Line(it: Mem33Item): String {
    val n = mem33TypeName(it.type)
    if (it.title.isEmpty()) return "→ $n"
    return if (it.title.lowercase().contains(n.lowercase()) || it.type == "annet") "→ ${it.title}" else "→ $n · ${it.title}"
}

private fun mem33Item(o: JSONObject?): Mem33Item? {
    if (o == null || !o.has("id")) return null
    val m = o.optStr("match") ?: return null
    return Mem33Item(o.optInt("id"), m, o.optStr("type") ?: "annet", o.optStr("title") ?: "")
}

/** «PÅHÅRET Studio Hoff» → «Påhåret Studio Hoff». */
fun mem33Nice(s: String): String = s.trim().split(Regex("\\s+")).joinToString(" ") { w ->
    val letters = w.filter { it.isLetter() }
    if (letters.length < 2 || letters != letters.uppercase() || w in setOf("AS", "ASA", "DA", "ANS")) w else w.take(1) + w.drop(1).lowercase()
}

/** Avsenderen i notatet («Mvh PÅHÅRET Studio Hoff»), ellers tittelen uten «Frisør · ». */
fun mem33NameOf(title: String, note: String?): String {
    val n = note.orEmpty()
    val m = Regex("(?i)(?:med vennlig hilsen|vennlig hilsen|hilsen|mvh)\\.?[\\s,:]+([A-ZÆØÅ0-9][^\\n.!?,]{1,50})").findAll(n).lastOrNull()
    if (m != null) return mem33Nice(m.groupValues[1].trim())
    return mem33Nice(title.substringAfter(" · ", title))
}

fun AppViewModel.loadMem33(force: Boolean = false) {
    val s = mem33
    if (s.loaded && !force) return
    launch33 {
        try {
            val o = JSONObject(api33 { hlGet("/glimt/memory") })
            val arr = o.optJSONArray("items")
            s.items = (0 until (arr?.length() ?: 0)).mapNotNull { mem33Item(arr?.optJSONObject(it)) }
            s.missing = false
        } catch (e: ApiException) {
            s.missing = e.status == 404
            if (e.status != 404) s.msg = e.message ?: "Fikk ikke hentet listen"
        } catch (e: Exception) { s.msg = e.message ?: "Fikk ikke hentet listen" }
        s.loaded = true
    }
}

/** Lagrer et alias. → (item, antall avtaler som kan få ny tittel) */
internal suspend fun AppViewModel.addMem33(match: String, type: String, title: String?): Pair<Mem33Item?, Int> {
    val body = JSONObject().put("match", match).put("type", type)
    if (!title.isNullOrBlank()) body.put("title", title)
    val o = JSONObject(api33 { hlPost("/glimt/memory", body) })
    val it = mem33Item(o.optJSONObject("item"))
    loadMem33(force = true)
    return it to o.optInt("matches", 0)
}

internal suspend fun AppViewModel.applyMem33(id: Int): Int =
    JSONObject(api33 { hlPost("/glimt/memory/$id/apply", JSONObject()) }).optInt("count", 0)

fun AppViewModel.deleteMem33(it: Mem33Item) {
    val s = mem33
    s.items = s.items.filter { x -> x.id != it.id }
    launch33 {
        try { api33 { hlDelete("/glimt/memory/${it.id}") }; s.msg = "Slettet ✓"; Haptics.success() }
        catch (e: Exception) { s.msg = "Kunne ikke slette"; loadMem33(force = true) }
    }
}

fun AppViewModel.saveMemForm33(match: String, type: String, title: String) {
    val s = mem33
    val n = match.trim()
    if (n.length < 2) { s.msg = "Skriv navnet på avsenderen."; return }
    launch33 {
        try {
            val (it, c) = addMem33(n, type, title.trim().ifBlank { null })
            s.adding = false; s.msg = "Lagret ✓"
            s.ask = if (c > 0 && it != null) Mem33Ask(it.id, c, it.title.ifBlank { mem33TypeName(type) + " · " + n }) else null
            Haptics.success()
        } catch (e: ApiException) { s.msg = e.message ?: "Kunne ikke lagre" } catch (e: Exception) { s.msg = e.message ?: "Kunne ikke lagre" }
    }
}

fun AppViewModel.applyAsk33(yes: Boolean) {
    val s = mem33
    val a = s.ask ?: return
    s.ask = null
    if (!yes) return
    launch33 {
        val n = runCatching { applyMem33(a.id) }.getOrDefault(0)
        s.msg = "$n ${if (n == 1) "avtale" else "avtaler"} fikk nytt navn ✓"
        reloadKal27()
    }
}

/** Hendelsen som vises blir konteksten for «det var frisør» i Glimt. Svaret trengs ikke. */
fun AppViewModel.shownMem33(e: Kal26Ev) {
    if (!e.editable) return
    val id = e.googleId ?: e.id
    launch33 { runCatching { api33 { hlGet("/kalender/events/" + URLEncoder.encode(id, "UTF-8")) } } }
}

fun AppViewModel.openLearn33(e: Kal26Ev) {
    kal26.sel = null
    mem33.learn = Mem33Learn(name = mem33NameOf(e.title, e.note))
}

/** Forslaget fra PATCH når brukeren selv ga en rask time ny tittel. Lagres bare med «Husk». */
fun AppViewModel.suggestMem33(o: JSONObject?) {
    val name = o?.optStr("name") ?: return
    val t = o.optStr("type").orEmpty()
    mem33.learn = Mem33Learn(name = name, type = if (t == "annet") "" else t, title = o.optStr("title").orEmpty(), text = o.optStr("text").orEmpty(), suggest = true)
}

fun AppViewModel.saveLearn33() {
    val s = mem33
    val l = s.learn ?: return
    val name = l.name.trim()
    if (l.type.isEmpty()) { s.learn = l.copy(err = "Velg hva det er."); return }
    if (name.length < 2) { s.learn = l.copy(err = "Skriv navnet på avsenderen."); return }
    val custom = l.title.trim()
    val title = if (l.type == "annet") custom.ifBlank { name } else if (l.suggest && custom.isNotEmpty()) custom else mem33TypeName(l.type) + " · " + name
    s.learn = l.copy(busy = true, err = "")
    launch33 {
        try {
            val (it, c) = addMem33(name, l.type, title)
            s.learn = s.learn?.copy(busy = false, asked = true, memId = it?.id, count = c, title = it?.title?.ifBlank { null } ?: title, name = name)
            Haptics.success()
        } catch (e: ApiException) { s.learn = s.learn?.copy(busy = false, err = e.message ?: "Kunne ikke lagre") }
        catch (e: Exception) { s.learn = s.learn?.copy(busy = false, err = e.message ?: "Kunne ikke lagre") }
    }
}

fun AppViewModel.applyLearn33() {
    val s = mem33
    val l = s.learn ?: return
    val id = l.memId ?: return
    s.learn = l.copy(busy = true)
    launch33 {
        try {
            val n = applyMem33(id)
            s.learn = null
            flash(if (n == 0) "Ingen avtaler å endre" else "$n ${if (n == 1) "avtale" else "avtaler"} fikk nytt navn")
            reloadKal27()
        } catch (e: Exception) { s.learn = s.learn?.copy(busy = false, err = "Kunne ikke endre avtalene.") }
    }
}

/** Glimt-boblen: «Endre N avtaler ›» etter «husk at Påhåret er frisøren min». */
fun AppViewModel.applyAns33() {
    val a = p31.ans ?: return
    if (a.applyId <= 0) return
    p31.ans = a.copy(applyCount = 0)
    launch33 {
        val n = runCatching { applyMem33(a.applyId) }.getOrDefault(0)
        if (p31.ans?.q == a.q) p31.ans = p31.ans?.copy(text = "Ferdig: **$n ${if (n == 1) "avtale" else "avtaler"}** heter nå «${a.applyTitle}».")
        Haptics.success()
        reloadKal27()
    }
}
