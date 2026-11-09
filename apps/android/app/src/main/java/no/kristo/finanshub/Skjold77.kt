package no.kristo.finanshub

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/*
 * Prompt 77 (SKJAIAND, CONTRACT77): smarte forslag i Skjold Lab – Glimt kjenner igjen delen fra bildet og teksten.
 *  - «✦ Foreslå» i Ny/Endre del: POST /api/skjold/ai/suggest (partId + navn/beskrivelse/specs fra skjemaet, eller multipart file for
 *    en ny del som ikke er lagret ennå). Kortet viser navn, kategori («ny»), specs og tags, hver med ✓, og «Bruk alle».
 *  - Auto-forslag når et bilde tas eller velges og innstillingen autoSuggestOnPhoto er på («Glimt tenker …»).
 *  - «Finn bilde»: POST /ai/images {q} → kandidater (miniatyrer via serverens proxy, signerte id-er). Forhåndsvisning før lagring;
 *    POST /parts/:id/photos/from-search {id}. Ny del: valgt bilde lagres når delen er lagret.
 *  - «Rydd opp med Glimt» (⋯ i lista): POST /ai/tidy → jobb som polles, gjennomgang før/etter med avkrysning, «Godta valgte» / «Hopp over».
 *  - Innstillinger (⚙ i Skjold Lab, Innstillinger → Moduler → Skjold Lab): GET|PUT /ai/settings {webImages, autoSuggestOnPhoto}.
 * All AI kjører på serveren (ai-run, lokal modell som standard). Ingenting endres uten at brukeren godtar det.
 * UI: ui/Skjold77Ui.kt.
 */

/** Ett forslag fra Glimt (POST /ai/suggest). */
data class SkjSug77(
    val name: String?, val category: String?, val categoryNew: Boolean, val specs: List<Pair<String, String>>, val tags: List<String>,
    val confidence: Double?, val why: String?, val source: String?, val decoded: List<String>,
)

/** Kandidat fra bildesøket: id er en signert, kortlivet referanse (ingen rå URL-er). */
data class SkjImg77(val id: String, val thumbUrl: String?, val title: String?, val source: String?, val width: Int?, val height: Int?, val previewUrl: String? = null)

/** Én rad i «Rydd opp»: før → etter. */
data class SkjTidy77(
    val partId: String, val beforeName: String, val beforeCat: String?, val after: SkjSug77, val confidence: Double?, val error: String? = null,
)

object Skjold77 {
    /* Forslag i skjemaet */
    var sugBusy by mutableStateOf(false)
    var sug by mutableStateOf<SkjSug77?>(null)
    var sugErr by mutableStateOf<String?>(null)
    /** Feltene i kortet som er tatt i bruk (name, category, spec:<k>, tag:<t>). */
    var used by mutableStateOf<Set<String>>(emptySet())
    internal var sugJob: Job? = null
    internal var sugSeq = 0

    /* Finn bilde */
    var imgOpen by mutableStateOf(false)
    var imgBusy by mutableStateOf(false)
    var imgQ by mutableStateOf("")
    var imgs by mutableStateOf<List<SkjImg77>>(emptyList())
    var imgErr by mutableStateOf<String?>(null)
    var imgPick by mutableStateOf<SkjImg77?>(null)
    /** Ny del (ikke lagret ennå): valgte bilder fra søket, lagres etter POST /parts. */
    var pendingImgs by mutableStateOf<List<SkjImg77>>(emptyList())

    /* Innstillinger */
    var settingsOpen by mutableStateOf(false)
    var webImages by mutableStateOf(true)
    var autoSuggest by mutableStateOf(true)
    var settingsLoaded by mutableStateOf(false)

    /* Rydd opp */
    var tidyJob by mutableStateOf<String?>(null)
    var tidyState by mutableStateOf("")
    var tidyDone by mutableIntStateOf(0)
    var tidyTotal by mutableIntStateOf(0)
    var tidyItems by mutableStateOf<List<SkjTidy77>>(emptyList())
    var tidySel by mutableStateOf<Set<String>>(emptySet())
    /** Rader brukeren har krysset av/på selv (så nye rader fra pollingen ikke overstyrer valget). */
    internal var tidyTouched: Set<String> = emptySet()
    var tidyErr by mutableStateOf<String?>(null)
    var tidyBusy by mutableStateOf(false)
    internal var tidyPoll: Job? = null
    var menuOpen by mutableStateOf(false)

    fun resetDraft() {
        sugJob?.cancel(); sugSeq++
        sug = null; sugErr = null; sugBusy = false; used = emptySet()
        imgOpen = false; imgs = emptyList(); imgErr = null; imgPick = null; imgBusy = false; pendingImgs = emptyList()
    }

    fun reset() {
        resetDraft(); tidyPoll?.cancel(); tidyJob = null; tidyItems = emptyList(); tidySel = emptySet(); tidyErr = null; tidyState = ""
        tidyDone = 0; tidyTotal = 0; settingsOpen = false; menuOpen = false; settingsLoaded = false
    }
}

/* ======================= Rene regler (speilet i test/p77-and.test.js) ======================= */

/** «Glimt tenker …» mens forslaget lages (bilde: opptil 60 s, tekst: 30 s). */
internal const val THINK77 = "Glimt tenker …"

/** 0.82 → «82 %», null → null. */
internal fun confText77(c: Double?): String? = conf01_77(c)?.let { "${Math.round(it * 100)} %" }

/** Sikkerhet 0–1 (godtar også 0–100 fra serveren). */
internal fun conf01_77(c: Double?): Double? = c?.takeIf { !it.isNaN() }?.let { if (it > 1.0) it / 100.0 else it }?.coerceIn(0.0, 1.0)

/** Jobben er ferdig (eller feilet). */
internal fun tidyFinished77(state: String): Boolean = state in setOf("done", "ferdig", "finished", "completed", "error", "failed", "feil", "cancelled", "avbrutt")

/** Miniatyr fra bildesøket: bare stier på egen server (proxy), aldri tredjeparts-URL-er. */
internal fun ownThumb77(u: String?): String? = u?.trim()?.takeIf { it.startsWith("/") && !it.startsWith("//") }

/** Kilde for forslaget: «fra bildet», «fra teksten», «fra bilde og tekst». */
internal fun sourceText77(s: String?): String? = when (s) { "bilde" -> "fra bildet"; "tekst" -> "fra teksten"; "begge" -> "fra bilde og tekst"; else -> null }

/** Specs fra forslaget inn i skjemaet: samme nøkkel byttes, nye legges til, tomme rader (f.eks. «verdi» uten tekst) ryddes bort. */
internal fun mergeSpecs77(cur: List<Pair<String, String>>, add: List<Pair<String, String>>): List<Pair<String, String>> {
    val out = cur.filter { it.first.isNotBlank() || it.second.isNotBlank() }.toMutableList()
    for ((k, v) in add) {
        if (k.isBlank() || v.isBlank()) continue
        val i = out.indexOfFirst { it.first.trim().equals(k.trim(), ignoreCase = true) }
        if (i >= 0) out[i] = out[i].first to v else out += k to v
    }
    return out.filter { it.second.isNotBlank() || it.first.isBlank() }.ifEmpty { listOf("verdi" to "") }
}

/** Tags inn i feltet «a, b»: uten dubletter (store/små bokstaver likt). */
internal fun mergeTags77(cur: String, add: List<String>): String {
    val l = cur.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toMutableList()
    for (t in add.map { it.trim() }.filter { it.isNotEmpty() }) if (l.none { it.equals(t, ignoreCase = true) }) l += t
    return l.joinToString(", ")
}

/** Har forslaget noe nytt i forhold til skjemaet? (navn, kategori, specs eller tags). */
internal fun sugDiffers77(s: SkjSug77, name: String, cat: String, specs: List<Pair<String, String>>, tags: String): Boolean {
    val tagSet = tags.split(',').map { it.trim().lowercase(Locale.ROOT) }.toSet()
    return (s.name != null && s.name != name.trim()) || (s.category != null && s.category != cat.trim()) ||
        s.specs.any { (k, v) -> specs.none { it.first.equals(k, true) && it.second == v } } || s.tags.any { it.lowercase(Locale.ROOT) !in tagSet }
}

/** Søketekst for «Finn bilde»: forslagets navn hvis det finnes, ellers navnet i skjemaet. */
internal fun imgQuery77(sugName: String?, name: String): String = (sugName?.takeIf { it.isNotBlank() } ?: name).trim()

/** Avkrysning som standard i «Rydd opp»: noe er endret og sikkerheten er minst 0,5 (ukjent sikkerhet teller som ja). */
internal fun tidyDefault77(t: SkjTidy77): Boolean =
    t.error == null && (conf01_77(t.confidence) ?: 1.0) >= 0.5 && ((t.after.name != null && t.after.name != t.beforeName) || (t.after.category != null && t.after.category != t.beforeCat) || t.after.specs.isNotEmpty() || t.after.tags.isNotEmpty())

/** «3 av 12» for fremdriften. */
internal fun progress77(done: Int, total: Int): String = if (total <= 0) "Starter …" else "$done av $total"

/* ======================= Parsing ======================= */

private fun specsOf77(o: Any?): List<Pair<String, String>> = when (o) {
    is JSONObject -> o.keys().asSequence().mapNotNull { k -> o.opt(k)?.let { if (it == JSONObject.NULL) null else it.toString() }?.takeIf { it.isNotBlank() }?.let { k to it } }.toList()
    is JSONArray -> objs34(o).mapNotNull { e -> val k = e.s43("key", "k", "name"); val v = e.s43("value", "v"); if (k != null && v != null) k to v else null }
    else -> emptyList()
}

private fun strList77(o: Any?): List<String> = when (o) {
    is JSONArray -> (0 until o.length()).mapNotNull { o.opt(it)?.takeIf { v -> v != JSONObject.NULL }?.toString()?.trim()?.takeIf { it.isNotEmpty() } }
    is String -> o.split(',').map { it.trim() }.filter { it.isNotEmpty() }
    else -> emptyList()
}

/** decoded: {resistor?, smd?, cap?} – hver som tekst eller {text|value|label}. */
private fun decoded77(o: JSONObject?): List<String> {
    if (o == null) return emptyList()
    val lbl = mapOf("resistor" to "Fargebånd", "smd" to "SMD-kode", "cap" to "Kondensatorkode")
    return o.keys().asSequence().mapNotNull { k ->
        val v = o.opt(k)
        val t = when (v) {
            is JSONObject -> v.s43("text", "value", "label", "display") ?: listOfNotNull(v.s43("code"), v.s43("ohms", "farad")).joinToString(" → ").takeIf { it.isNotBlank() }
            null, JSONObject.NULL -> null
            else -> v.toString().takeIf { it.isNotBlank() && it != "null" }
        } ?: return@mapNotNull null
        (lbl[k] ?: k) + ": " + t
    }.toList()
}

private fun JSONObject.dbl77(k: String): Double? = if (!has(k) || isNull(k)) null else optDouble(k).takeIf { !it.isNaN() } ?: optString(k).replace(',', '.').toDoubleOrNull()

internal fun parseSug77(o: JSONObject): SkjSug77 {
    val c = o.optJSONObject("category")
    return SkjSug77(
        o.s43("name"), c?.s43("name") ?: o.s43("category"), o.optBoolean("categoryNew", c?.optBoolean("new") ?: false),
        specsOf77(o.opt("specs")), strList77(o.opt("tags")), o.dbl77("confidence"), o.s43("why", "reason"), o.s43("source"),
        decoded77(o.optJSONObject("decoded")),
    )
}

internal fun parseImgs77(raw: String): List<SkjImg77> = objs34(arr76(raw)).mapNotNull { o ->
    val id = o.s43("id") ?: return@mapNotNull null
    SkjImg77(id, ownThumb77(o.s43("thumbUrl", "thumb")) ?: return@mapNotNull null, o.s43("title"), o.s43("source"), o.optInt("width", 0).takeIf { it > 0 }, o.optInt("height", 0).takeIf { it > 0 }, ownThumb77(o.s43("previewUrl", "preview")))
}

internal fun parseTidy77(o: JSONObject): SkjTidy77? {
    val id = o.opt("partId")?.takeIf { it != JSONObject.NULL }?.toString() ?: return null
    val b = o.optJSONObject("before") ?: JSONObject()
    val a = o.optJSONObject("after") ?: JSONObject()
    return SkjTidy77(id, b.s43("name") ?: "?", b.s43("category"), parseSug77(a), o.dbl77("confidence") ?: a.dbl77("confidence"), o.s43("error"))
}

/** Melding fra et svar som ikke ga resultater (innstillingen av, SearXNG mangler …). */
private fun note77(raw: String): String? = runCatching { JSONObject(raw).s43("message", "error", "hint", "note") }.getOrNull()

/* ======================= Nettverk ======================= */

private const val AI77 = "$API76/ai"

private suspend fun AppViewModel.post77(path: String, body: JSONObject, read: Int = 30_000): String =
    api46 { request("POST", AI77 + path, body, prefix = Api.HOMELAB, read = read) }

private suspend fun AppViewModel.get77(path: String): String = api46 { hlGet(AI77 + path, 12_000) }

private fun errText77(e: Exception, fallback: String): String = when {
    e is ApiException && e.status == 0 && e.code == null -> "Glimt svarte ikke i tide, eller du er uten nett. Prøv igjen."
    e is ApiException -> e.message?.takeIf { it.isNotBlank() } ?: fallback
    else -> uiErr73(e, fallback)
}

/** Navn, beskrivelse og specs fra skjemaet (det brukeren ser nå, også ulagrede endringer). */
private fun draftFields77(d: SkjDraft76): JSONObject = JSONObject().apply {
    d.name.trim().takeIf { it.isNotEmpty() }?.let { put("name", it) }
    d.description.trim().takeIf { it.isNotEmpty() }?.let { put("description", it) }
    put("specs", JSONObject().apply { d.specs.forEach { (k, v) -> if (k.isNotBlank() && v.isNotBlank()) put(k.trim(), v.trim()) } })
    d.category.trim().takeIf { it.isNotEmpty() }?.let { put("category", it) }
}

/** Siste lagrede bilde (filnavn fra photos[].name) på delen, for auto-forslag etter opplasting. */
private fun lastPhotoName77(p: SkjPart76?): String? {
    val a = p?.raw?.optJSONArray("photos") ?: return null
    for (i in a.length() - 1 downTo 0) {
        val v = a.opt(i)
        val n = if (v is JSONObject) v.s43("name", "file") else v?.toString()
        if (!n.isNullOrBlank() && !n.startsWith("/") && !n.startsWith("http")) return n
    }
    return null
}

/**
 * «✦ Foreslå» (eller auto ved bilde). [photoUri]: nytt bilde på en ny del (sendes som multipart file).
 * [photoName]: filnavn til et lagret bilde. Ellers: partId (serveren bruker delens bilder) + teksten i skjemaet.
 */
fun AppViewModel.suggest77(d: SkjDraft76, photoUri: Uri? = null, photoName: String? = null, auto: Boolean = false) {
    val s = Skjold77
    if (d.name.isBlank() && d.id == null && photoUri == null && d.newPhotos.isEmpty()) { s.sugErr = "Skriv et navn eller ta et bilde først."; return }
    s.sugJob?.cancel()
    val seq = ++s.sugSeq
    s.sugBusy = true; s.sugErr = null
    if (!auto) Haptics.tap()
    s.sugJob = launchJob46 {
        try {
            val fields = draftFields77(d)
            val uri = photoUri ?: if (d.id == null) d.newPhotos.lastOrNull() else null
            val raw = if (uri != null) {
                val jpeg = withContext(Dispatchers.IO) {
                    runCatching { appCtx46.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()?.takeIf { it.size <= 40 * 1024 * 1024 }?.let { jpeg76(it, 1280) }
                } ?: throw ApiException("Kunne ikke lese bildet.", 400)
                val parts = mutableListOf(Api.Part("file", "del.jpg", "image/jpeg", jpeg))
                fields.keys().forEach { k -> parts += Api.Part(k, "", "text/plain", fields.get(k).toString().toByteArray()) }
                api46 { upload("$AI77/suggest", parts, prefix = Api.HOMELAB, read = 75_000) }
            } else {
                d.id?.let { fields.put("partId", it.toLongOrNull() ?: it) }
                photoName?.let { fields.put("photo", it) }
                post77("/suggest", fields, read = if (d.id != null || photoName != null) 75_000 else 40_000)
            }
            if (seq != s.sugSeq) return@launchJob46
            val sg = JSONObject(raw).let { parseSug77(it.optJSONObject("suggestion") ?: it) }
            s.sug = sg; s.used = emptySet()
            if (auto && !sugDiffers77(sg, d.name, d.category, d.specs, d.tags)) s.sug = null
            Haptics.success()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (seq == s.sugSeq) { s.sugErr = errText77(e, "Fikk ikke forslag fra Glimt."); if (!auto) Haptics.error() }
        } finally { if (seq == s.sugSeq) s.sugBusy = false }
    }
}

/** Ta i bruk ett felt fra kortet ([key]: name, category, spec:<k>, tag:<t>) eller alle (null). */
fun applySug77(d: SkjDraft76, key: String? = null) {
    val s = Skjold77
    val g = s.sug ?: return
    val all = key == null
    if ((all || key == "name") && g.name != null) { d.name = g.name; s.used = s.used + "name" }
    if ((all || key == "category") && g.category != null) { d.category = g.category; s.used = s.used + "category" }
    val sp = g.specs.filter { all || key == "spec:" + it.first }
    if (sp.isNotEmpty()) { d.specs = mergeSpecs77(d.specs, sp); s.used = s.used + sp.map { "spec:" + it.first } }
    val tg = g.tags.filter { all || key == "tag:$it" }
    if (tg.isNotEmpty()) { d.tags = mergeTags77(d.tags, tg); s.used = s.used + tg.map { "tag:$it" } }
    Haptics.select()
}

/** Kalles når et bilde er tatt/valgt i skjemaet (ny del: før lagring; endre: etter opplasting). */
internal fun AppViewModel.photoAdded77(d: SkjDraft76?, uri: Uri?, saved: SkjPart76?) {
    if (!Skjold77.autoSuggest || d == null) return
    if (d.id == null && uri != null) suggest77(d, photoUri = uri, auto = true)
    else if (d.id != null) suggest77(d, photoName = lastPhotoName77(saved), auto = true)
}

/* ---------- Finn bilde ---------- */

fun AppViewModel.findImages77(q: String) {
    val s = Skjold77
    val query = q.trim()
    s.imgOpen = true; s.imgQ = query; s.imgPick = null; s.imgErr = null
    if (!s.webImages) { s.imgs = emptyList(); s.imgErr = "«Finn bilder på nett» er slått av. Slå det på under ⚙ i Skjold Lab."; return }
    if (query.isEmpty()) { s.imgs = emptyList(); s.imgErr = "Skriv et navn først, så søker Glimt etter bilder av delen."; return }
    s.imgBusy = true; s.imgs = emptyList()
    launch46 {
        try {
            val raw = post77("/images", JSONObject().put("q", query), read = 30_000)
            s.imgs = parseImgs77(raw)
            if (s.imgs.isEmpty()) s.imgErr = note77(raw) ?: "Fant ingen bilder av «$query». Prøv et kortere navn."
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.imgErr = errText77(e, "Bildesøket feilet.")
        } finally { s.imgBusy = false }
    }
}

/** «Bruk bildet»: lagres på delen (eller venter til en ny del er lagret). */
fun AppViewModel.useImage77(d: SkjDraft76, img: SkjImg77) {
    val s = Skjold77
    val id = d.id
    if (id == null) {
        s.pendingImgs = s.pendingImgs + img
        s.imgPick = null; s.imgOpen = false
        Haptics.success()
        if (s.autoSuggest && d.name.isBlank()) suggest77(d, auto = true)
        return
    }
    s.imgBusy = true
    launch46 {
        try {
            val p = fromSearch77(id, img)
            s.imgPick = null; s.imgOpen = false
            Haptics.success()
            flash("Bildet er lagret")
            p?.let { Skjold76.part = it; Skjold76.items = Skjold76.items?.map { o -> if (o.id == it.id) it else o } }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.imgErr = errText77(e, "Kunne ikke lagre bildet.")
        } finally { s.imgBusy = false }
    }
}

private suspend fun AppViewModel.fromSearch77(id: String, img: SkjImg77): SkjPart76? {
    val raw = api46 { request("POST", "$API76/parts/$id/photos/from-search", JSONObject().put("id", img.id), prefix = Api.HOMELAB, read = 45_000) }
    return runCatching { JSONObject(raw).let { it.optJSONObject("part") ?: it } }.getOrNull()?.let { parsePart76(it) }
}

/** Etter POST /parts for en ny del: valgte bilder fra søket lagres. Gir siste versjon av delen. */
internal suspend fun AppViewModel.savePending77(id: String): SkjPart76? {
    val s = Skjold77
    var p: SkjPart76? = null
    for (img in s.pendingImgs) {
        try { fromSearch77(id, img)?.let { p = it } } catch (e: CancellationException) { throw e } catch (e: Exception) {
            flash("Kunne ikke lagre bildet fra søket: " + errText77(e, "feil"))
        }
    }
    s.resetDraft()
    return p
}

/* ---------- Innstillinger ---------- */

fun AppViewModel.loadAiSettings77() = launch46 {
    val s = Skjold77
    val o = try { JSONObject(get77("/settings")) } catch (e: CancellationException) { throw e } catch (_: Exception) { null } ?: return@launch46
    (o.optJSONObject("settings") ?: o).let { j ->
        if (j.has("webImages")) s.webImages = j.optBoolean("webImages", true)
        if (j.has("autoSuggestOnPhoto")) s.autoSuggest = j.optBoolean("autoSuggestOnPhoto", true)
    }
    s.settingsLoaded = true
}

fun AppViewModel.putAiSettings77(webImages: Boolean? = null, autoSuggest: Boolean? = null) {
    val s = Skjold77
    val oldW = s.webImages; val oldA = s.autoSuggest
    webImages?.let { s.webImages = it }; autoSuggest?.let { s.autoSuggest = it }
    Haptics.select()
    launch46 {
        try {
            api46 { hlPut("$AI77/settings", JSONObject().put("webImages", s.webImages).put("autoSuggestOnPhoto", s.autoSuggest)) }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.webImages = oldW; s.autoSuggest = oldA
            flash("Kunne ikke lagre: " + errText77(e, "feil"))
        }
    }
}

/** ⚙ i Skjold Lab / Innstillinger → Moduler → Skjold Lab. */
fun AppViewModel.openSkjoldSettings77() {
    openSkjold76()
    Skjold77.settingsOpen = true
    loadAiSettings77()
}

/* ---------- Rydd opp ---------- */

/** Start «Rydd opp»: [ids] = de valgte (treffene i lista), null = alle delene. */
fun AppViewModel.startTidy77(ids: List<String>?) {
    val s = Skjold77
    s.menuOpen = false
    s.tidyPoll?.cancel()
    s.tidyJob = null; s.tidyItems = emptyList(); s.tidySel = emptySet(); s.tidyTouched = emptySet(); s.tidyErr = null
    s.tidyState = "starter"; s.tidyDone = 0; s.tidyTotal = ids?.size ?: Skjold76.total
    push76("tidy")
    Haptics.tap()
    s.tidyPoll = launchJob46 {
        try {
            val body = if (ids == null) JSONObject().put("all", true) else JSONObject().put("partIds", JSONArray().apply { ids.forEach { put(it.toLongOrNull() ?: it) } })
            val raw = post77("/tidy", body)
            val job = JSONObject(raw).let { it.s43("jobId", "id") } ?: throw ApiException("Serveren ga ingen jobb.", 500)
            s.tidyJob = job
            var fails = 0
            while (true) {
                val o = try { JSONObject(get77("/tidy/" + java.net.URLEncoder.encode(job, "UTF-8"))).also { fails = 0 } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
                    if (e.status in 400..499 || ++fails >= 5) throw e
                    null
                }
                if (o != null) {
                    readTidy77(o)
                    if (tidyFinished77(s.tidyState)) break
                }
                delay(1_500)
            }
            if (s.tidyState in setOf("error", "failed", "feil")) s.tidyErr = s.tidyErr ?: "Glimt klarte ikke å gå gjennom alle delene."
            Haptics.success()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.tidyErr = errText77(e, "Kunne ikke starte opprydningen.")
            s.tidyState = "error"
        }
    }
}

private fun readTidy77(o: JSONObject) {
    val s = Skjold77
    s.tidyState = o.s43("state", "status") ?: s.tidyState
    s.tidyDone = o.optInt("done", s.tidyDone)
    s.tidyTotal = o.optInt("total", s.tidyTotal)
    o.s43("error", "message")?.let { if (s.tidyState in setOf("error", "failed", "feil")) s.tidyErr = it }
    val items = objs34(o.optJSONArray("items")).mapNotNull { parseTidy77(it) }
    val known = s.tidyItems.map { it.partId }.toSet()
    s.tidyItems = items
    // Nye rader får standardvalget; det brukeren har krysset av/på selv, beholdes.
    s.tidySel = s.tidySel.filter { id -> items.any { it.partId == id } }.toSet() +
        items.filter { it.partId !in known && it.partId !in s.tidyTouched && tidyDefault77(it) }.map { it.partId }
}

fun toggleTidy77(id: String) {
    val s = Skjold77
    s.tidyTouched = s.tidyTouched + id
    s.tidySel = if (id in s.tidySel) s.tidySel - id else s.tidySel + id
    Haptics.select()
}

/** «Godta valgte»: POST /ai/tidy/:jobId/apply {partIds}. Endringene logges i historikken; angre i 10 s. */
fun AppViewModel.applyTidy77() {
    val s = Skjold77
    val job = s.tidyJob ?: return
    val ids = s.tidySel.toList()
    if (ids.isEmpty()) { flash("Kryss av delene du vil endre"); return }
    s.tidyBusy = true
    launch46 {
        try {
            val raw = post77("/tidy/" + java.net.URLEncoder.encode(job, "UTF-8") + "/apply", JSONObject().put("partIds", JSONArray().apply { ids.forEach { put(it.toLongOrNull() ?: it) } }))
            val o = runCatching { JSONObject(raw) }.getOrNull()
            val n = o?.optInt("applied", -1)?.takeIf { it >= 0 } ?: o?.optJSONArray("applied")?.length() ?: ids.size
            // Angre: historikk-id-ene fra svaret (POST /history/:id/undo).
            val hist = (o?.optJSONArray("history") ?: o?.optJSONArray("historyIds") ?: o?.optJSONArray("undo"))?.let { a ->
                (0 until a.length()).mapNotNull { i -> a.opt(i)?.let { v -> if (v is JSONObject) v.s43("id", "historyId") else v.toString() } }
            }.orEmpty()
            s.tidyItems = s.tidyItems.filter { it.partId !in ids }
            s.tidySel = emptySet()
            Haptics.success()
            Skjold76.stack = Skjold76.stack.filter { it != "tidy" }.ifEmpty { listOf("list") }
            searchSkjold76(now = true)
            val text = if (n == 1) "1 del er ryddet" else "$n deler er ryddet"
            if (hist.isNotEmpty()) offerUndo76(text) {
                for (h in hist) runCatching { api46 { hlPost("$API76/history/" + java.net.URLEncoder.encode(h, "UTF-8") + "/undo") } }
                searchSkjold76(now = true)
                flash("Opprydningen er angret")
            } else flash("$text. Du kan angre i historikken på hver del.")
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            flash("Kunne ikke lagre: " + errText77(e, "feil"))
        } finally { s.tidyBusy = false }
    }
}

/** «Hopp over»: lukker gjennomgangen uten å endre noe. */
fun closeTidy77() {
    val s = Skjold77
    s.tidyPoll?.cancel()
    s.tidyItems = emptyList(); s.tidySel = emptySet(); s.tidyJob = null
    Skjold76.stack = Skjold76.stack.filter { it != "tidy" }.ifEmpty { listOf("list") }
}
