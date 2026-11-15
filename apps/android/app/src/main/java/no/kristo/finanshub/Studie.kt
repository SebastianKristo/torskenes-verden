package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

data class SEmne44(val kode: String, val navn: String, val sp: Double?, val karakter: String?, val semester: String?)

data class SDoc44(
    val id: String, val kind: String?, val title: String, val institution: String?, val date: String?, val emner: List<SEmne44>, val snitt: String?,
    val sp: Double?, val found: List<String>, val summary: String?,
)

/* ======================= Studie → Dokumenter ======================= */

private fun parseDoc44(o0: JSONObject): SDoc44 {
    val o = o0.optJSONObject("doc") ?: o0
    val emner = o.list44("emner", "courses", "subjects").map { e ->
        SEmne44(e.s43("kode", "code") ?: "", e.s43("navn", "name") ?: "", e.d43("sp", "credits"), e.s43("karakter", "grade"), e.s43("semester"))
    }
    return SDoc44(o.s43("id") ?: "", o.s43("kind", "type"), o.s43("title", "name", "filename") ?: o.s43("institution") ?: "Dokument", o.s43("institution", "school"),
        o.s43("date"), emner, o.s43("snitt", "average"), o.d43("sp", "credits"), o.strs44("found"), o.s43("summary"))
}

fun AppViewModel.openStudy44() { p44.studyOpen = true; loadDocs44() }

fun AppViewModel.loadDocs44() = launch44 {
    try {
        val raw = api44 { hlGet("/study/documents") }
        p44.docs = arr43(raw, "documents", "docs", "items").map(::parseDoc44)
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 404) p44.docsMissing = true else p44.docErr = e.message
        if (p44.docs == null) p44.docs = emptyList()
    } catch (e: Exception) { p44.docErr = e.message; if (p44.docs == null) p44.docs = emptyList() }
}

/** Opplasting: Glimt leser (OCR + modell) på serveren. Stegene vises med ekte tid. */
fun AppViewModel.uploadDoc44(name: String, mime: String, data: ByteArray) = launch44 {
    p44.docBusy = true; p44.docErr = null
    val t0 = System.currentTimeMillis()
    fun step(s: String) { p44.docSteps = p44.docSteps + (s + " · " + String.format(java.util.Locale("nb", "NO"), "%.1f s", (System.currentTimeMillis() - t0) / 1000.0)) }
    p44.docSteps = emptyList()
    try {
        val raw = api44 { upload("/study/documents", listOf(Api.Part("file", name, mime, data)), prefix = Api.HOMELAB, read = 180_000) }
        step("Lastet opp og kryptert")
        val o = JSONObject(raw)
        o.strs44("steps").forEach { p44.docSteps = p44.docSteps + it }
        val d = parseDoc44(o)
        step("Leste ${d.emner.size} emner" + (d.snitt?.let { " · snitt $it" } ?: ""))
        p44.doc = d
        Haptics.success()
        loadDocs44()
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        p44.docErr = if (e.status == 404) "Studie-dokumenter finnes ikke på serveren ennå. Oppdater Homelab." else e.message
    } catch (e: Exception) { p44.docErr = e.message } finally { p44.docBusy = false }
}

fun AppViewModel.askDoc44(d: SDoc44, q: String) = launch44 {
    if (q.isBlank()) return@launch44
    p44.docAnswer = "Glimt leser dokumentet …"
    p44.docAnswer = try { JSONObject(api44 { hlPost("/study/documents/" + enc44(d.id) + "/ask", JSONObject().put("q", q)) }).s43("answer", "text") ?: "Fant ikke noe svar." }
        catch (e: CancellationException) { throw e } catch (e: Exception) { "Glimt svarte ikke (${uiErr73(e, "feil")})." }
}

fun AppViewModel.applyDoc44(d: SDoc44) = launch44 {
    try {
        val o = JSONObject(api44 { hlPost("/study/documents/" + enc44(d.id) + "/apply") })
        flash(o.s43("message") ?: "${o.i43("added") ?: d.emner.size} emner lagt i Studie")
    } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke lagt emnene i Studie: ${e.message}") }
}

fun AppViewModel.deleteDoc44(d: SDoc44) = launch44 {
    try { api44 { hlDelete("/study/documents/" + enc44(d.id)) }; p44.doc = null; Haptics.dismiss(); loadDocs44() }
    catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke slettet: ${e.message}") }
}
