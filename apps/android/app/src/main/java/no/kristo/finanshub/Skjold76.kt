package no.kristo.finanshub

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URLEncoder
import java.text.Normalizer
import java.util.Locale

/*
 * Prompt 76 (SKJAND, CONTRACT76): Skjold Lab – sorteringssystem for deler i skuffeskap (Raaco 150-01: 12 rader × 5 skuffer).
 * Alt går via /api/skjold (server/skjold76, per bruker): skap, kart over skuffene, deler med FTS-søk, flytt/antall/historikk,
 * bilder (servert med eier-sjekk), hjørner for perspektiv-overlegget, ledige skuffer og etiketter for utskrift.
 *  - Nummerering: rad 1 øverst, skuff 1 til venstre. «Rad 4 · Skuff 2», kort «4-2».
 *  - Offline: siste liste (og skapene) lagres i filesDir per konto, så søk virker uten nett. Endringer krever nett (tydelig melding).
 *  - Bilder: skaleres og roteres på telefonen (maks 1600 px, JPEG) før opplasting – EXIF (GPS) blir ikke med.
 *  - UI: ui/Skjold76Ui.kt (side, tegning med perspektiv via android.graphics.Matrix.setPolyToPoly, oppsett med hjørnehåndtak).
 */

data class SkjLoc76(val cabinetId: String?, val cabinet: String?, val row: Int?, val col: Int?, val compartment: Int?, val text: String) {
    val placed: Boolean get() = cabinetId != null && row != null && col != null
}

data class SkjPart76(
    val id: String, val name: String, val category: String?, val description: String?, val specs: List<Pair<String, String>>,
    val qty: Double, val unit: String, val minQty: Double?, val tags: List<String>, val loc: SkjLoc76,
    val url: String?, val price: Double?, val supplier: String?, val photos: List<String>, val thumbUrl: String?,
    val history: List<SkjHist76> = emptyList(), val raw: JSONObject = JSONObject(),
    /** n for DELETE /parts/:id/photos/:n (0-basert, fra photos[].n), samme rekkefølge som [photos]. */
    val photoNs: List<Int> = emptyList(),
) {
    val low: Boolean get() = lowStock76(qty, minQty)
}

data class SkjHist76(val at: String, val action: String, val from: String?, val to: String?)
data class SkjCab76(
    val id: String, val name: String, val rows: Int, val cols: Int, val kind: String, val photoUrl: String?, val thumbUrl: String?,
    /** tl, tr, br, bl normalisert 0–1 (x, y). */
    val corners: List<Pair<Float, Float>>?, val parts: Int, val used: Int, val notes: String? = null,
)
data class SkjMapPart76(val id: String, val name: String, val thumbUrl: String?, val qty: Double)
data class SkjDrawer76(val row: Int, val col: Int, val label: String?, val compartments: Int, val count: Int, val parts: List<SkjMapPart76>, val color: String?)
data class SkjMap76(val cabinetId: String, val rows: Int, val cols: Int, val drawers: List<SkjDrawer76>) {
    fun at(r: Int, c: Int): SkjDrawer76? = drawers.firstOrNull { it.row == r && it.col == c }
}
data class SkjCat76(val name: String, val count: Int)
data class SkjUndo76(val text: String, val seq: Int, val action: suspend AppViewModel.() -> Unit)

/** Ny/endre del: feltene i skjemaet (tekst), plassering og bilder som venter på opplasting (ny del). */
class SkjDraft76(p: SkjPart76?) {
    var id by mutableStateOf(p?.id)
    var name by mutableStateOf(p?.name ?: "")
    var category by mutableStateOf(p?.category ?: "")
    var description by mutableStateOf(p?.description ?: "")
    var specs by mutableStateOf(p?.specs ?: listOf("verdi" to ""))
    var qty by mutableStateOf(p?.qty?.let { qtyText76(it) } ?: "1")
    var unit by mutableStateOf(p?.unit ?: "stk")
    var minQty by mutableStateOf(p?.minQty?.let { qtyText76(it) } ?: "")
    var tags by mutableStateOf(p?.tags?.joinToString(", ") ?: "")
    var url by mutableStateOf(p?.url ?: "")
    var price by mutableStateOf(p?.price?.let { qtyText76(it) } ?: "")
    var supplier by mutableStateOf(p?.supplier ?: "")
    var cabinetId by mutableStateOf(p?.loc?.cabinetId)
    var row by mutableStateOf(p?.loc?.row)
    var col by mutableStateOf(p?.loc?.col)
    var compartment by mutableStateOf(p?.loc?.compartment)
    var newPhotos by mutableStateOf<List<Uri>>(emptyList())
}

/** Hele tilstanden for Skjold Lab (én side om gangen; stakken styrer tilbake). */
object Skjold76 {
    var open by mutableStateOf(false)
    var missing by mutableStateOf(false)
    var err by mutableStateOf<String?>(null)
    /** Viser bufret liste (uten nett). */
    var offline by mutableStateOf(false)
    var cachedAt by mutableStateOf<Long?>(null)
    /** list · part · edit · cab · setup */
    var stack by mutableStateOf(listOf("list"))
    val screen: String get() = stack.lastOrNull() ?: "list"
    var q by mutableStateOf("")
    /** Forslag: (tekst, del-id eller null, undertekst). Del → detaljsiden; ellers søk på teksten. */
    var suggest by mutableStateOf<List<Triple<String, String?, String?>>>(emptyList())
    var items by mutableStateOf<List<SkjPart76>?>(null)
    var total by mutableIntStateOf(0)
    var busy by mutableStateOf(false)
    var cat by mutableStateOf<String?>(null)
    var low by mutableStateOf(false)
    var filterCab by mutableStateOf<String?>(null)
    var cats by mutableStateOf<List<SkjCat76>>(emptyList())
    var cabinets by mutableStateOf<List<SkjCab76>>(emptyList())
    var cabId by mutableStateOf<String?>(null)
    var maps by mutableStateOf<Map<String, SkjMap76>>(emptyMap())
    var part by mutableStateOf<SkjPart76?>(null)
    var draft by mutableStateOf<SkjDraft76?>(null)
    /** Valgt skuff i tegningen (rad, kol) → arket med innholdet. */
    var drawer by mutableStateOf<Pair<Int, Int>?>(null)
    /** «move» (Flytt) eller «place» (plassering i skjemaet): neste trykk i tegningen velger skuff. */
    var pick by mutableStateOf<String?>(null)
    /** Tegning («draw») eller bildet med uthevingen («photo»). */
    var view by mutableStateOf("draw")
    /** Ny verdi starter pulsen (2 s) på uthevet skuff. */
    var pulse by mutableIntStateOf(0)
    var undo by mutableStateOf<SkjUndo76?>(null)
    var undoSeq = 0
    /** Advarsel etter flytt: andre deler i samme skuff/rom. */
    var occupied by mutableStateOf<List<String>>(emptyList())
    /** Skap-oppsett: utkast til hjørner (tl, tr, br, bl) mens håndtakene dras. */
    var corners by mutableStateOf<List<Pair<Float, Float>>?>(null)
    /** Sletting av skap med deler (409): skapet som venter på valg av nytt sted. */
    var cabDeleteAsk by mutableStateOf<SkjCab76?>(null)
    internal var searchJob: Job? = null
    internal var suggestJob: Job? = null
    internal var accountKey: String? = null
    internal var printView: Any? = null

    fun reset() {
        stack = listOf("list"); q = ""; suggest = emptyList(); items = null; part = null; draft = null; drawer = null; pick = null
        cat = null; low = false; filterCab = null; cabinets = emptyList(); maps = emptyMap(); cabId = null; undo = null; occupied = emptyList()
        corners = null; cabDeleteAsk = null; err = null; missing = false; offline = false
        Skjold77.reset() // prompt 77
        Skjold78.reset() // prompt 78
    }
}

/* ======================= Rene regler (speilet i test/p76-and.test.js) ======================= */

internal const val API76 = "/skjold"
internal const val FILES76 = "/api/skjold/files/"

/** «4-2»: rad og skuff. */
internal fun short76(row: Int, col: Int): String = "$row-$col"

/** «Rad 4 · Skuff 2» (+ « · Rom 1»). */
internal fun drawerText76(row: Int, col: Int, comp: Int? = null): String = "Rad $row · Skuff $col" + (comp?.let { " · Rom $it" } ?: "")

/** Standard etikett når skuffen ikke har egen: «R4·S2». */
internal fun defLabel76(row: Int, col: Int): String = "R$row·S$col"

/** «Hovedskap · Rad 4 · Skuff 2 · Rom 1», eller «Uten plass». */
internal fun locText76(cab: String?, row: Int?, col: Int?, comp: Int?): String =
    if (cab == null || row == null || col == null) "Uten plass" else "$cab · " + drawerText76(row, col, comp)

/** Lavt lager: antall ≤ min (bare når min er satt). */
internal fun lowStock76(qty: Double, min: Double?): Boolean = min != null && qty <= min

/** 50 → «50», 2.5 → «2,5». */
internal fun qtyText76(v: Double): String = if (v == Math.floor(v) && !v.isInfinite() && Math.abs(v) < 1e12) v.toLong().toString() else String.format(Locale("nb", "NO"), "%.2f", v).trimEnd('0').trimEnd(',')

/** Antall skuffer i bredden for et tilleggsskap: ~60 mm per skuff (27 cm → 4). */
internal fun suggestCols76(widthMm: Int, drawerMm: Int = 60): Int = (widthMm / drawerMm.toDouble()).toInt().coerceIn(1, 12)

/** Rad og skuff (1-basert) fra et punkt i skapets rutenett (0..cols, 0..rows); null utenfor. */
internal fun cellAt76(gx: Float, gy: Float, rows: Int, cols: Int): Pair<Int, Int>? {
    if (gx < 0f || gy < 0f || gx >= cols || gy >= rows) return null
    return (gy.toInt() + 1) to (gx.toInt() + 1)
}

/** Søketekst uten aksenter og skilletegn: «10 kΩ» → «10k», «Skrue M3» → «skruem3», æøå → ae/o/a. */
internal fun fold76(s: String): String {
    val l = s.lowercase(Locale.ROOT).replace("æ", "ae").replace("ø", "o").replace("å", "a").replace("Ω", "").replace("ω", "")
    val n = Normalizer.normalize(l, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
    return n.replace(Regex("[^a-z0-9]+"), "")
}

/** Ord for prefikssøk offline: «m3 skru» → [m3, skru]. */
internal fun words76(q: String): List<String> = q.split(Regex("[\\s,;-]+")).map { fold76(it) }.filter { it.isNotEmpty() }

/** Offline-søk i bufret liste: hvert ord må finnes som prefiks i navn, kategori, beskrivelse, specs, tags eller etikett. */
internal fun offlineMatch76(hay: List<String>, q: String): Boolean {
    val ws = words76(q)
    if (ws.isEmpty()) return true
    val toks = hay.flatMap { h -> h.split(Regex("[\\s,;/·×()-]+")).map { fold76(it) } + fold76(h) }.filter { it.isNotEmpty() }
    return ws.all { w -> toks.any { it.startsWith(w) } }
}

/** Rangering som serveren: eksakt navn (0), navn-prefiks (1), resten (2). */
internal fun rank76(name: String, q: String): Int {
    val n = fold76(name); val f = fold76(q)
    return when { f.isEmpty() -> 2; n == f -> 0; n.startsWith(f) -> 1; else -> 2 }
}

/* ======================= Parsing ======================= */

private fun JSONObject.d76(vararg k: String): Double? {
    for (x in k) if (has(x) && !isNull(x)) { val v = optDouble(x); if (!v.isNaN()) return v; optString(x).replace(',', '.').toDoubleOrNull()?.let { return it } }
    return null
}
private fun JSONObject.i76(vararg k: String): Int? = d76(*k)?.toInt()
private fun JSONObject.id76(vararg k: String): String? { for (x in k) if (has(x) && !isNull(x)) opt(x)?.toString()?.takeIf { it.isNotBlank() && it != "null" }?.let { return it }; return null }

/** Filnavn eller URL → URL vi kan hente (eier-sjekk på serveren). */
internal fun fileUrl76(f: String?): String? = f?.takeIf { it.isNotBlank() }?.let { if (it.startsWith("/") || it.startsWith("http")) it else FILES76 + URLEncoder.encode(it, "UTF-8") }

private fun specs76(o: Any?): List<Pair<String, String>> = when (o) {
    is JSONObject -> o.keys().asSequence().mapNotNull { k -> o.opt(k)?.toString()?.takeIf { it.isNotBlank() && it != "null" }?.let { k to it } }.toList()
    is String -> runCatching { specs76(JSONObject(o)) }.getOrDefault(emptyList())
    else -> emptyList()
}

private fun strs76(o: Any?): List<String> = when (o) {
    is JSONArray -> (0 until o.length()).mapNotNull { i -> o.opt(i)?.let { v -> if (v is JSONObject) v.s43("url", "file", "name") else v.toString() }?.takeIf { it.isNotBlank() && it != "null" } }
    is String -> if (o.trimStart().startsWith("[")) runCatching { strs76(JSONArray(o)) }.getOrDefault(emptyList()) else o.split(',').map { it.trim() }.filter { it.isNotEmpty() }
    else -> emptyList()
}

internal fun parsePart76(o: JSONObject): SkjPart76? {
    val id = o.id76("id") ?: return null
    val l = o.optJSONObject("location")
    val cabId = l?.id76("cabinetId") ?: o.id76("cabinetId", "cabinet_id")
    val cab = l?.s43("cabinet") ?: o.s43("cabinetName")
    val row = l?.i76("row") ?: o.i76("row")
    val col = l?.i76("col") ?: o.i76("col")
    val comp = l?.i76("compartment") ?: o.i76("compartment")
    val text = l?.s43("text") ?: locText76(cab ?: "Skap", row, col, comp)
    val hist = objs34(o.optJSONArray("history")).map { h -> SkjHist76(h.s43("at") ?: "", h.s43("action") ?: "endret", h.opt("from")?.toString()?.takeIf { it != "null" }, h.opt("to")?.toString()?.takeIf { it != "null" }) }
    return SkjPart76(
        id, o.s43("name") ?: "Uten navn", o.s43("category"), o.s43("description"), specs76(o.opt("specs")),
        o.d76("qty") ?: 0.0, o.s43("unit") ?: "stk", o.d76("minQty", "min_qty", "min"), strs76(o.opt("tags")),
        SkjLoc76(cabId, cab, row, col, comp, text), o.s43("url"), o.d76("price"), o.s43("supplier"),
        (o.optJSONArray("photoUrls")?.let { strs76(it) } ?: strs76(o.opt("photos"))).mapNotNull { fileUrl76(it) }, fileUrl76(o.s43("thumbUrl", "thumb")), hist, o,
        o.optJSONArray("photos")?.let { a -> (0 until a.length()).map { i -> a.optJSONObject(i)?.i76("n") ?: i } }.orEmpty(),
    )
}

private fun pt76(o: Any?): Pair<Float, Float>? = when (o) {
    is JSONObject -> { val x = o.d76("x"); val y = o.d76("y"); if (x != null && y != null) x.toFloat() to y.toFloat() else null }
    is JSONArray -> if (o.length() >= 2) o.optDouble(0).toFloat() to o.optDouble(1).toFloat() else null
    else -> null
}

internal fun parseCorners76(o: Any?): List<Pair<Float, Float>>? {
    val j = when (o) { is JSONObject -> o; is String -> runCatching { JSONObject(o) }.getOrNull(); else -> null } ?: return null
    val l = listOf("tl", "tr", "br", "bl").map { pt76(j.opt(it)) ?: return null }
    return l.takeIf { pts -> pts.all { it.first.isFinite() && it.second.isFinite() } }
}

internal fun cornersJson76(c: List<Pair<Float, Float>>): JSONObject = JSONObject().apply {
    listOf("tl", "tr", "br", "bl").forEachIndexed { i, k -> put(k, JSONObject().put("x", c[i].first.toDouble().coerceIn(0.0, 1.0)).put("y", c[i].second.toDouble().coerceIn(0.0, 1.0))) }
}

internal fun parseCab76(o: JSONObject): SkjCab76? {
    val id = o.id76("id") ?: return null
    val cnt = o.optJSONObject("counts")
    return SkjCab76(
        id, o.s43("name") ?: "Skap", o.i76("rows") ?: 12, o.i76("cols") ?: 5, o.s43("kind") ?: "kjøpt",
        fileUrl76(o.s43("photoUrl")), fileUrl76(o.s43("thumbUrl")), parseCorners76(o.opt("corners") ?: o.opt("photo_corners")),
        cnt?.i76("parts") ?: o.i76("parts") ?: 0, cnt?.i76("usedDrawers") ?: 0, o.s43("notes"),
    )
}

internal fun parseMap76(id: String, o: JSONObject): SkjMap76 = SkjMap76(
    id, o.i76("rows") ?: 12, o.i76("cols") ?: 5,
    objs34(o.optJSONArray("drawers")).mapNotNull { d ->
        val r = d.i76("row") ?: return@mapNotNull null; val c = d.i76("col") ?: return@mapNotNull null
        val ps = objs34(d.optJSONArray("parts")).mapNotNull { p -> p.id76("id")?.let { SkjMapPart76(it, p.s43("name") ?: "?", fileUrl76(p.s43("thumbUrl")), p.d76("qty") ?: 0.0) } }
        // customLabel = egen etikett (null = standard «R4·S2»); eldre svar har bare label.
        SkjDrawer76(r, c, if (d.has("customLabel")) d.s43("customLabel") else d.s43("label"), (d.i76("compartments") ?: 1).coerceIn(1, 4), d.i76("count") ?: ps.size, ps, d.s43("color"))
    },
)

/** GET /categories: [{name|category, count}], {items:[…]} eller {kategori: antall}. */
internal fun parseCats76(raw: String): List<SkjCat76> {
    val t = raw.trimStart()
    val arr = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { o ->
        o.optJSONArray("items") ?: o.optJSONArray("categories") ?: return o.keys().asSequence().map { k -> SkjCat76(k, o.optInt(k)) }.toList().sortedByDescending { it.count }
    }
    return objs34(arr).mapNotNull { c -> c.s43("name", "category")?.let { SkjCat76(it, c.i76("count", "n") ?: 0) } }
}

/** Liste fra et svar som er en matrise eller {items|<key>: […]}. */
internal fun arr76(raw: String, key: String = "items"): JSONArray {
    val t = raw.trimStart()
    if (t.startsWith("[")) return JSONArray(t)
    val o = JSONObject(t)
    return o.optJSONArray(key) ?: o.optJSONArray("items") ?: JSONArray()
}

private fun itemsOf76(raw: String): Pair<List<SkjPart76>, Int> {
    val t = raw.trimStart()
    if (t.startsWith("[")) return objs34(JSONArray(t)).mapNotNull { parsePart76(it) }.let { it to it.size }
    val o = JSONObject(t)
    val l = objs34(o.optJSONArray("items")).mapNotNull { parsePart76(it) }
    return l to (o.i76("total") ?: l.size)
}

/** JSON-kroppen for POST/PATCH /parts fra skjemaet (null = ugyldig: navn mangler). */
internal fun draftJson76(d: SkjDraft76): JSONObject? {
    val name = d.name.trim().takeIf { it.isNotEmpty() } ?: return null
    fun num(s: String) = s.replace(" ", "").replace(',', '.').toDoubleOrNull()
    val specs = JSONObject().apply { d.specs.forEach { (k, v) -> if (k.isNotBlank() && v.isNotBlank()) put(k.trim(), v.trim()) } }
    val tags = JSONArray().apply { d.tags.split(',').map { it.trim() }.filter { it.isNotEmpty() }.distinct().forEach { put(it) } }
    return JSONObject().put("name", name).put("category", d.category.trim().ifEmpty { JSONObject.NULL })
        .put("description", d.description.trim().ifEmpty { JSONObject.NULL }).put("specs", specs)
        .put("qty", num(d.qty) ?: 0.0).put("unit", d.unit.ifBlank { "stk" }).put("minQty", num(d.minQty) ?: JSONObject.NULL)
        .put("tags", tags).put("url", d.url.trim().ifEmpty { JSONObject.NULL }).put("price", num(d.price) ?: JSONObject.NULL)
        .put("supplier", d.supplier.trim().ifEmpty { JSONObject.NULL })
        .put("cabinetId", d.cabinetId?.let { it.toLongOrNull() ?: it } ?: JSONObject.NULL).put("row", d.row ?: JSONObject.NULL)
        .put("col", d.col ?: JSONObject.NULL).put("compartment", d.compartment ?: JSONObject.NULL)
}

/* ======================= Nettverk ======================= */

private suspend fun AppViewModel.get76(path: String, timeout: Int = 12_000): String = api46 { hlGet(API76 + path, timeout) }
private suspend fun AppViewModel.post76(path: String, body: JSONObject = JSONObject()): String = api46 { hlPost(API76 + path, body) }
private suspend fun AppViewModel.put76(path: String, body: JSONObject): String = api46 { hlPut(API76 + path, body) }
private suspend fun AppViewModel.patch76(path: String, body: JSONObject): String = api46 { request("PATCH", API76 + path, body, prefix = Api.HOMELAB) }
private suspend fun AppViewModel.del76(path: String): String = api46 { hlDelete(API76 + path) }

/** Uten nett (status 0) er endringer ikke mulig: tydelig melding. Andre feil vises som de er. */
internal const val NEED_NET76 = "Endringer krever nett. Du ser den lagrede listen – prøv igjen når du er på nett."

private fun AppViewModel.act76(block: suspend () -> Unit) = launch46 {
    try { block() } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 0 && e.code == null) { Skjold76.offline = true; flash("Kunne ikke lagre. $NEED_NET76") }
        else flash("Kunne ikke lagre: ${e.message ?: "feil"}")
    }
}

private fun cacheFile76(ctx: Context, key: String): File = File(File(ctx.filesDir, "skjold76").apply { mkdirs() }, "cache-" + key.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".json")

private fun AppViewModel.cacheKey76(): String = account?.id ?: "anon"

private fun AppViewModel.saveCache76(itemsRaw: JSONArray, cabsRaw: JSONArray?) {
    runCatching {
        val o = JSONObject().put("at", System.currentTimeMillis()).put("items", itemsRaw)
        if (cabsRaw != null) o.put("cabinets", cabsRaw)
        else runCatching { JSONObject(cacheFile76(appCtx46, cacheKey76()).readText()).optJSONArray("cabinets") }.getOrNull()?.let { o.put("cabinets", it) }
        cacheFile76(appCtx46, cacheKey76()).writeText(o.toString())
    }
}

/** Bufret liste + skap (uten nett), filtrert lokalt. */
private fun AppViewModel.fromCache76(): Boolean {
    val s = Skjold76
    val o = runCatching { JSONObject(cacheFile76(appCtx46, cacheKey76()).readText()) }.getOrNull() ?: return false
    val all = objs34(o.optJSONArray("items")).mapNotNull { parsePart76(it) }
    if (s.cabinets.isEmpty()) s.cabinets = objs34(o.optJSONArray("cabinets")).mapNotNull { parseCab76(it) }
    s.cachedAt = o.optLong("at").takeIf { it > 0 }
    val q = s.q.trim()
    s.items = all.filter { p ->
        offlineMatch76(listOfNotNull(p.name, p.category, p.description, p.loc.text) + p.specs.flatMap { listOf(it.first, it.second) } + p.tags, q) &&
            (s.cat == null || p.category == s.cat) && (!s.low || p.low) && (s.filterCab == null || p.loc.cabinetId == s.filterCab)
    }.sortedWith(compareBy({ rank76(it.name, q) }, { it.name.lowercase() }))
    s.total = s.items?.size ?: 0
    s.offline = true
    return true
}

fun AppViewModel.openSkjold76(q: String? = null, partId: String? = null, cabId: String? = null, drawer: Pair<Int, Int>? = null) {
    val s = Skjold76
    val key = account?.id
    if (s.accountKey != key) { s.reset(); s.accountKey = key }
    s.open = true
    s.err = null
    Haptics.tap()
    if (q != null) s.q = q
    loadSkjold76()
    when {
        partId != null -> openPart76(partId)
        cabId != null -> { s.cabId = cabId; s.drawer = drawer; s.pulse++; s.stack = listOf("list", "cab"); loadMap76(cabId) }
    }
}

/** Tilbake: lukker ark/valg først, så én side i stakken, og til slutt Skjold Lab. */
fun AppViewModel.closeSkjold76() {
    val s = Skjold76
    val a = Skjold77 // prompt 77: ark og valg i forslagene lukkes først
    when {
        Skjold78.calOn -> stopCal78() // prompt 78: kalibreringen avsluttes (lyset slukkes)
        a.settingsOpen -> a.settingsOpen = false
        a.menuOpen -> a.menuOpen = false
        a.imgPick != null -> a.imgPick = null
        a.imgOpen -> a.imgOpen = false
        s.screen == "tidy" -> closeTidy77()
        s.cabDeleteAsk != null -> s.cabDeleteAsk = null
        s.pick != null -> s.pick = null
        s.drawer != null && s.screen == "cab" -> s.drawer = null
        s.suggest.isNotEmpty() -> s.suggest = emptyList()
        s.stack.size > 1 -> { s.stack = s.stack.dropLast(1); if (s.screen != "setup") s.corners = null; if (s.screen != "edit") s.draft = null }
        else -> { s.open = false; s.searchJob?.cancel() }
    }
    Haptics.back()
}

internal fun push76(screen: String) {
    val s = Skjold76
    s.stack = s.stack.filter { it != screen } + screen
}

/** finanshub://skjold[/del/<id>|/skap/<id>[/4-2]][?q=…] (Glimt-kort, felles søk, etikett-QR). */
fun AppViewModel.skjoldLink76(uri: Uri) {
    val seg = uri.pathSegments.orEmpty()
    val q = uri.getQueryParameter("q")
    when (seg.firstOrNull()) {
        "del", "part", "parts" -> openSkjold76(q, partId = seg.getOrNull(1))
        "skap", "cabinet" -> {
            val d = seg.getOrNull(2)?.split('-')?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 2 }?.let { it[0] to it[1] }
            openSkjold76(q, cabId = seg.getOrNull(1), drawer = d)
        }
        else -> openSkjold76(q)
    }
}

fun AppViewModel.loadSkjold76() = launch46 {
    val s = Skjold76
    try {
        val raw = get76("/cabinets")
        s.missing = false
        val arr = arr76(raw, "cabinets")
        s.cabinets = objs34(arr).mapNotNull { parseCab76(it) }
        if (s.cabId == null || s.cabinets.none { it.id == s.cabId }) s.cabId = s.cabinets.firstOrNull()?.id
        s.cabId?.let { loadMap76(it) }
        runCatching { s.cats = parseCats76(get76("/categories")) }
        loadAiSettings77() // prompt 77
        loadAllLeds78() // prompt 78: LED-oppsett per skap + innstillingene
        searchSkjold76(now = true)
        saveCabs76(arr)
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 404) s.missing = true
        else if (e.status == 0 && fromCache76()) Unit
        else s.err = e.message
    } catch (e: Exception) { s.err = uiErr73(e, "Kunne ikke hente Skjold Lab.") }
}

private fun AppViewModel.saveCabs76(arr: JSONArray) {
    runCatching {
        val f = cacheFile76(appCtx46, cacheKey76())
        val o = runCatching { JSONObject(f.readText()) }.getOrNull() ?: JSONObject().put("items", JSONArray()).put("at", System.currentTimeMillis())
        f.writeText(o.put("cabinets", arr).toString())
    }
}

/** Søk/filter mot GET /parts (220 ms debounce mens man skriver). Uten nett: bufret liste. */
fun AppViewModel.searchSkjold76(now: Boolean = false) {
    val s = Skjold76
    s.searchJob?.cancel()
    s.searchJob = launchJob46 {
        if (!now) delay(220)
        s.busy = true
        try {
            val p = StringBuilder("/parts?limit=500")
            s.q.trim().takeIf { it.isNotEmpty() }?.let { p.append("&q=").append(URLEncoder.encode(it, "UTF-8")) }
            s.cat?.let { p.append("&category=").append(URLEncoder.encode(it, "UTF-8")) }
            s.filterCab?.let { p.append("&cabinet=").append(URLEncoder.encode(it, "UTF-8")) }
            if (s.low) p.append("&low=1")
            val raw = get76(p.toString())
            val (l, n) = itemsOf76(raw)
            s.items = l; s.total = n; s.offline = false; s.missing = false; s.err = null
            // Hele lista (uten filter) bufres for offline-søk.
            if (s.q.isBlank() && s.cat == null && !s.low && s.filterCab == null) {
                val arr = runCatching { JSONArray(raw) }.getOrNull() ?: JSONObject(raw).optJSONArray("items") ?: JSONArray()
                withContext(Dispatchers.IO) { saveCache76(arr, null) }
            }
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404) s.missing = true else if (e.status == 0) { if (!fromCache76()) s.err = e.message } else s.err = e.message
        } catch (e: Exception) { s.err = uiErr73(e, "Søket feilet.") } finally { s.busy = false }
    }
}

/** Forslag under søkefeltet (maks 8). Uten nett: navn fra bufret liste. */
fun AppViewModel.suggestSkjold76(text: String) {
    val s = Skjold76
    s.q = text
    s.suggestJob?.cancel()
    if (text.trim().length < 2) { s.suggest = emptyList(); searchSkjold76(); return }
    s.suggestJob = launchJob46 {
        delay(150)
        s.suggest = if (s.offline) s.items.orEmpty().filter { offlineMatch76(listOf(it.name), text) }.map { Triple(it.name, it.id, it.loc.text) }.distinctBy { it.first }.take(8)
        else runCatching {
            val raw = get76("/suggest?q=" + URLEncoder.encode(text.trim(), "UTF-8"), 6_000)
            val a = arr76(raw)
            (0 until a.length()).mapNotNull { i ->
                a.opt(i)?.let { v ->
                    if (v is JSONObject) v.s43("text", "name", "q")?.let { t -> Triple(t, if ((v.s43("kind") ?: "part") == "part") v.id76("id") else null, v.s43("sub")) }
                    else Triple(v.toString(), null, null)
                }
            }.distinctBy { it.first + it.second }.take(8)
        }.getOrDefault(emptyList())
    }
    searchSkjold76()
}

fun AppViewModel.openPart76(id: String) {
    val s = Skjold76
    s.part = s.items?.firstOrNull { it.id == id } ?: s.part?.takeIf { it.id == id }
    s.pick = null; s.occupied = emptyList(); s.view = "draw"
    push76("part")
    s.pulse++
    launch46 {
        val p = try { parsePart76(JSONObject(get76("/parts/$id"))) } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status != 0) flash("Fikk ikke hentet delen: ${e.message}")
            null
        } ?: return@launch46
        if (s.screen == "part" || s.part?.id == id) s.part = p
        p.loc.cabinetId?.let { c -> s.cabId = c; if (s.maps[c] == null) loadMap76(c) }
    }
    s.part?.loc?.cabinetId?.let { c -> s.cabId = c; if (s.maps[c] == null) loadMap76(c) }
    partOpened78(id) // prompt 78: lys opp automatisk når innstillingen er på
}

fun AppViewModel.loadMap76(cabId: String) = launch46 {
    val s = Skjold76
    val m = try { parseMap76(cabId, JSONObject(get76("/cabinets/$cabId/map"))) } catch (e: CancellationException) { throw e } catch (_: Exception) { null } ?: return@launch46
    s.maps = s.maps + (cabId to m)
}

private fun AppViewModel.afterChange76(p: SkjPart76?) {
    val s = Skjold76
    if (p != null) {
        s.part = p
        s.items = s.items?.map { if (it.id == p.id) p else it }
    }
    s.cabId?.let { loadMap76(it) }
    p?.loc?.cabinetId?.takeIf { it != s.cabId }?.let { loadMap76(it) }
    searchSkjold76(now = true)
    loadCabsQuiet76()
}

private fun AppViewModel.loadCabsQuiet76() = launch46 {
    runCatching { objs34(arr76(get76("/cabinets"), "cabinets")).mapNotNull { parseCab76(it) } }.getOrNull()?.let { Skjold76.cabinets = it }
}

/** Antall ±1 (eller sett). */
fun AppViewModel.qtySkjold76(p: SkjPart76, delta: Double? = null, set: Double? = null) = act76 {
    val body = if (set != null) JSONObject().put("set", set) else JSONObject().put("delta", delta ?: 0.0)
    Haptics.select()
    // Optimistisk: tallet endres med en gang.
    val opt = p.copy(qty = set ?: (p.qty + (delta ?: 0.0)).coerceAtLeast(0.0))
    Skjold76.part = opt
    val raw = post76("/parts/${p.id}/qty", body)
    afterChange76(runCatching { JSONObject(raw).let { it.optJSONObject("part") ?: it } }.getOrNull()?.let { parsePart76(it) } ?: opt)
}

/** Flytt til (skap, rad, kol, rom). Svaret har occupied (andre deler i samme skuff/rom): advarsel. Angre i 10 s. */
fun AppViewModel.moveSkjold76(p: SkjPart76, cabId: String?, row: Int?, col: Int?, comp: Int?) = act76 {
    val s = Skjold76
    val from = p.loc
    val raw = post76("/parts/${p.id}/move", JSONObject().put("cabinetId", cabId?.let { it.toLongOrNull() ?: it } ?: JSONObject.NULL)
        .put("row", row ?: JSONObject.NULL).put("col", col ?: JSONObject.NULL).put("compartment", comp ?: JSONObject.NULL))
    val o = runCatching { JSONObject(raw) }.getOrNull()
    s.occupied = objs34(o?.optJSONArray("occupied")).mapNotNull { it.s43("name") }
    val np = (o?.optJSONObject("part") ?: o)?.let { parsePart76(it) } ?: runCatching { parsePart76(JSONObject(get76("/parts/${p.id}"))) }.getOrNull()
    s.pick = null
    s.pulse++
    Haptics.success()
    afterChange76(np)
    val text = "Flyttet til " + locText76(s.cabinets.firstOrNull { it.id == cabId }?.name ?: "skap", row, col, comp)
    offerUndo76(text) { moveBack76(p.id, from) }
}

private suspend fun AppViewModel.moveBack76(id: String, l: SkjLoc76) {
    val raw = post76("/parts/$id/move", JSONObject().put("cabinetId", l.cabinetId?.let { it.toLongOrNull() ?: it } ?: JSONObject.NULL)
        .put("row", l.row ?: JSONObject.NULL).put("col", l.col ?: JSONObject.NULL).put("compartment", l.compartment ?: JSONObject.NULL))
    afterChange76(runCatching { JSONObject(raw) }.getOrNull()?.let { parsePart76(it.optJSONObject("part") ?: it) } ?: runCatching { parsePart76(JSONObject(get76("/parts/$id"))) }.getOrNull())
    Skjold76.occupied = emptyList()
    flash("Flyttet tilbake")
}

/** «Angre» i 10 s (feltet under siden). */
internal fun AppViewModel.offerUndo76(text: String, action: suspend AppViewModel.() -> Unit) {
    val s = Skjold76
    val seq = ++s.undoSeq
    s.undo = SkjUndo76(text, seq, action)
    launch46 { delay(10_000); if (s.undo?.seq == seq) s.undo = null }
}

fun AppViewModel.runUndo76() {
    val u = Skjold76.undo ?: return
    Skjold76.undo = null
    act76 { u.action(this) }
}

/** Myk sletting (30 dager). Angre via POST /parts/:id/restore. */
fun AppViewModel.deleteSkjold76(p: SkjPart76) = act76 {
    val s = Skjold76
    del76("/parts/${p.id}")
    s.items = s.items?.filter { it.id != p.id }
    if (s.screen == "part") s.stack = s.stack.dropLast(1)
    s.part = null
    Haptics.success()
    afterChange76(null)
    offerUndo76("«${p.name}» er slettet") {
        post76("/parts/${p.id}/restore")
        afterChange76(null)
        flash("«${p.name}» er tilbake")
    }
}

/** Lagre skjemaet: POST (ny) eller PATCH (endre). Nye bilder lastes opp etterpå. */
fun AppViewModel.saveDraft76() {
    val s = Skjold76
    val d = s.draft ?: return
    val body = draftJson76(d) ?: run { flash("Skriv inn et navn på delen"); return }
    act76 {
        s.busy = true
        try {
            val raw = if (d.id == null) post76("/parts", body) else patch76("/parts/${d.id}", body)
            var p = runCatching { JSONObject(raw).let { it.optJSONObject("part") ?: it } }.getOrNull()?.let { parsePart76(it) }
            val id = p?.id ?: d.id
            if (id != null) for (u in d.newPhotos) { uploadPartPhotoNow76(id, u)?.let { p = it } }
            if (id != null && d.id == null && Skjold77.pendingImgs.isNotEmpty()) savePending77(id)?.let { p = it } // prompt 77: bilder fra «Finn bilde»
            Skjold77.resetDraft()
            s.draft = null
            s.stack = s.stack.dropLast(1)
            Haptics.success()
            flash(if (d.id == null) "«${d.name.trim()}» er lagt til" else "Lagret")
            afterChange76(p)
            if (d.id == null && id != null) openPart76(id)
        } finally { s.busy = false }
    }
}

fun AppViewModel.newPart76(prefill: SkjPart76? = null) {
    val s = Skjold76
    Skjold77.resetDraft()
    s.draft = SkjDraft76(prefill).also { d ->
        d.id = null
        if (prefill == null) {
            // Ny del fra skuffen som er åpen i tegningen: plasseringen fylles inn.
            val dr = s.drawer
            if (s.screen == "cab" && dr != null) { d.cabinetId = s.cabId; d.row = dr.first; d.col = dr.second }
            if (s.cat != null) d.category = s.cat ?: ""
        }
    }
    s.drawer = null
    push76("edit")
}

fun AppViewModel.editPart76(p: SkjPart76) {
    Skjold77.resetDraft()
    Skjold76.draft = SkjDraft76(p)
    push76("edit")
}

/** «Foreslå ledig»: første tomme skuff (GET /free, ellers kartet). */
fun AppViewModel.suggestFree76(d: SkjDraft76) = launch46 {
    val s = Skjold76
    val prefer = d.cabinetId ?: s.cabId
    val hit: Triple<String, Int, Int>? = try {
        val raw = get76("/free")
        val t = raw.trimStart()
        val arr = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("cabinets") ?: JSONObject(t).optJSONArray("items") ?: JSONArray()
        val cabs = objs34(arr).sortedBy { if (it.id76("cabinetId", "id") == prefer) 0 else 1 }
        cabs.firstNotNullOfOrNull { c ->
            val cid = c.id76("cabinetId", "id") ?: return@firstNotNullOfOrNull null
            val f = objs34(c.optJSONArray("free") ?: c.optJSONArray("drawers")).firstOrNull() ?: return@firstNotNullOfOrNull null
            val r = f.i76("row"); val cc = f.i76("col")
            if (r != null && cc != null) Triple(cid, r, cc) else null
        }
    } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
    val pick = hit ?: prefer?.let { cid ->
        val m = s.maps[cid] ?: return@let null
        (1..m.rows).asSequence().flatMap { r -> (1..m.cols).asSequence().map { c -> r to c } }.firstOrNull { (r, c) -> (m.at(r, c)?.count ?: 0) == 0 }?.let { Triple(cid, it.first, it.second) }
    }
    if (pick == null) { flash("Fant ingen ledig skuff"); return@launch46 }
    d.cabinetId = pick.first; d.row = pick.second; d.col = pick.third; d.compartment = null
    s.cabId = pick.first; s.pulse++
    if (s.maps[pick.first] == null) loadMap76(pick.first)
    Haptics.select()
}

/* ---------- Bilder ---------- */

/** Leser, roterer etter EXIF og skalerer til maks [max] px, JPEG 88 (EXIF/GPS blir ikke med). */
internal fun jpeg76(data: ByteArray, max: Int = 1600): ByteArray? = runCatching { jpegOrNull76(data, max) }.getOrNull()

private fun jpegOrNull76(data: ByteArray, max: Int): ByteArray? {
    val b = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, b)
    if (b.outWidth <= 0 || b.outHeight <= 0) return null
    var sample = 1
    while (maxOf(b.outWidth, b.outHeight) / (sample * 2) >= max) sample *= 2
    val bmp = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val rot = when (runCatching { ExifInterface(data.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }.getOrDefault(1)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f; ExifInterface.ORIENTATION_ROTATE_180 -> 180f; ExifInterface.ORIENTATION_ROTATE_270 -> 270f; else -> 0f
    }
    val sc = minOf(1f, max.toFloat() / maxOf(bmp.width, bmp.height))
    val m = android.graphics.Matrix().apply { postScale(sc, sc); if (rot != 0f) postRotate(rot) }
    val out = if (sc < 1f || rot != 0f) Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true) else bmp
    return ByteArrayOutputStream().use { o -> out.compress(Bitmap.CompressFormat.JPEG, 88, o); o.toByteArray() }
}

private suspend fun AppViewModel.readJpeg76(uri: Uri): ByteArray? = withContext(Dispatchers.IO) {
    val raw = runCatching { appCtx46.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return@withContext null
    if (raw.size > 40 * 1024 * 1024) return@withContext null
    jpeg76(raw)
}

private suspend fun AppViewModel.uploadPartPhotoNow76(id: String, uri: Uri): SkjPart76? {
    val jpeg = readJpeg76(uri) ?: run { flash("Kunne ikke lese bildet"); return null }
    val raw = api46 { upload(API76 + "/parts/$id/photos", listOf(Api.Part("file", "del.jpg", "image/jpeg", jpeg)), prefix = Api.HOMELAB) }
    return runCatching { JSONObject(raw).let { it.optJSONObject("part") ?: it } }.getOrNull()?.let { parsePart76(it) }
}

fun AppViewModel.addPartPhoto76(uri: Uri) {
    val s = Skjold76
    val d = s.draft
    if (d != null && d.id == null) { d.newPhotos = d.newPhotos + uri; photoAdded77(d, uri, null); return }
    val id = d?.id ?: s.part?.id ?: return
    act76 {
        s.busy = true
        try {
            val p = uploadPartPhotoNow76(id, uri)
            Haptics.success()
            if (d != null) photoAdded77(d, null, p) // prompt 77: auto-forslag fra bildet
            afterChange76(p ?: runCatching { parsePart76(JSONObject(get76("/parts/$id"))) }.getOrNull())
        } finally { s.busy = false }
    }
}

fun AppViewModel.deletePartPhoto76(id: String, n: Int) = act76 {
    del76("/parts/$id/photos/$n")
    afterChange76(runCatching { parsePart76(JSONObject(get76("/parts/$id"))) }.getOrNull())
}

/* ---------- Skap ---------- */

/** Nytt skap eller endring (navn, rader, kolonner, type). */
fun AppViewModel.saveCab76(id: String?, name: String, rows: Int, cols: Int, kind: String, done: (String?) -> Unit = {}) = act76 {
    val body = JSONObject().put("name", name.trim().ifEmpty { "Skap" }).put("rows", rows.coerceIn(1, 40)).put("cols", cols.coerceIn(1, 20)).put("kind", kind)
    val raw = if (id == null) post76("/cabinets", body) else patch76("/cabinets/$id", body)
    val c = runCatching { JSONObject(raw).let { it.optJSONObject("cabinet") ?: it } }.getOrNull()?.let { parseCab76(it) }
    Haptics.success()
    flash(if (id == null) "Skapet er lagt til" else "Skapet er lagret")
    val nid = c?.id ?: id
    loadCabsQuiet76()
    nid?.let { Skjold76.cabId = it; loadMap76(it) }
    done(nid)
}

/** Slett skap. 409 (har deler) → spør om deler skal flyttes til et annet skap eller «Uten plass». */
fun AppViewModel.deleteCab76(c: SkjCab76, move: String? = null) = act76 {
    val s = Skjold76
    try {
        del76("/cabinets/${c.id}" + (move?.let { "?move=" + URLEncoder.encode(it, "UTF-8") } ?: ""))
    } catch (e: ApiException) {
        if (e.status == 409) { s.cabDeleteAsk = c; return@act76 }
        throw e
    }
    s.cabDeleteAsk = null
    s.cabinets = s.cabinets.filter { it.id != c.id }
    s.maps = s.maps - c.id
    if (s.cabId == c.id) s.cabId = s.cabinets.firstOrNull()?.id
    s.stack = listOf("list")
    flash("«${c.name}» er slettet")
    afterChange76(null)
}

fun AppViewModel.uploadCabPhoto76(id: String, uri: Uri) = act76 {
    val s = Skjold76
    s.busy = true
    try {
        val jpeg = readJpeg76(uri) ?: run { flash("Kunne ikke lese bildet"); return@act76 }
        api46 { upload(API76 + "/cabinets/$id/photo", listOf(Api.Part("file", "skap.jpg", "image/jpeg", jpeg)), prefix = Api.HOMELAB) }
        // Nytt bilde: hjørnene starter litt innenfor kanten, så brukeren drar dem på plass.
        s.corners = listOf(.08f to .06f, .92f to .06f, .92f to .94f, .08f to .94f)
        Haptics.success()
        loadCabsQuiet76()
    } finally { s.busy = false }
}

fun AppViewModel.putCorners76(id: String, c: List<Pair<Float, Float>>) = act76 {
    put76("/cabinets/$id/corners", cornersJson76(c))
    Haptics.success()
    flash("Hjørnene er lagret")
    Skjold76.corners = null
    loadCabsQuiet76()
}

fun AppViewModel.deleteCabPhoto76(id: String) = act76 {
    del76("/cabinets/$id/photo")
    Skjold76.corners = null
    if (Skjold76.view == "photo") Skjold76.view = "draw"
    loadCabsQuiet76()
}

/** Etikett og antall rom (1–4) for én skuff. */
fun AppViewModel.putDrawer76(cabId: String, row: Int, col: Int, label: String, comps: Int) = act76 {
    put76("/cabinets/$cabId/drawers/$row/$col", JSONObject().put("label", label.trim().ifEmpty { JSONObject.NULL }).put("compartments", comps.coerceIn(1, 4)).put("color", JSONObject.NULL))
    Haptics.success()
    loadMap76(cabId)
}

/* ---------- Etiketter ---------- */

/** Henter /labels (HTML) med tokenet og skriver ut via WebView + PrintManager (nettleseren har ikke app-tokenet). */
fun AppViewModel.printLabels76(ctx: Context, cabId: String?) = act76 {
    val html = withContext(Dispatchers.IO) {
        String(api46 { bytes(Api.HOMELAB + API76 + "/labels" + (cabId?.let { "?cabinet=" + URLEncoder.encode(it, "UTF-8") } ?: "")) }, Charsets.UTF_8)
    }
    val wv = android.webkit.WebView(ctx)
    Skjold76.printView = wv // holdes til utskriften er sendt
    wv.webViewClient = object : android.webkit.WebViewClient() {
        override fun onPageFinished(view: android.webkit.WebView, url: String?) {
            val pm = ctx.getSystemService(Context.PRINT_SERVICE) as? android.print.PrintManager ?: return
            runCatching { pm.print("Skjold Lab etiketter", view.createPrintDocumentAdapter("Skjold Lab etiketter"), android.print.PrintAttributes.Builder().build()) }
        }
    }
    wv.loadDataWithBaseURL(base.trimEnd('/') + "/", html, "text/html", "utf-8", null)
}

/* ---------- Glimt («hvor er M3-skruene?») ---------- */

/** Bøyningsendelse bort for spørsmål: «skruene» → «skru», «motstandene» → «motstand». */
internal fun stem76(w: String): String {
    for (suf in listOf("ene", "ane", "er", "en", "et", "ne", "a", "e")) if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.dropLast(suf.length)
    return w
}

/** «hvor er M3-skruene?» → «m3 skru» (uten spørreord og bøyning). */
internal fun whereQuery76(q: String): String = q.trim().lowercase(Locale("nb", "NO"))
    .replace(Regex("^(hvor (er|finner jeg|ligger|har jeg( lagt)?)|finn|vis meg)\\s+(de |den |det |mine |min |mitt )?"), "")
    .trimEnd('?', '.', '!', ' ').split(Regex("[\\s-]+")).filter { it.isNotBlank() }.joinToString(" ") { stem76(it) }

/**
 * Snarveien «hvor er …» går til Familie. Er det en del i Skjold Lab (bufret liste), skal spørsmålet gå til Glimt (skjold.find) i stedet.
 */
fun AppViewModel.skjoldKnows76(q: String): Boolean {
    val rest = whereQuery76(q)
    if (rest.isBlank()) return false
    val parts = Skjold76.items ?: runCatching { objs34(JSONObject(cacheFile76(appCtx46, cacheKey76()).readText()).optJSONArray("items")).mapNotNull { parsePart76(it) } }.getOrNull() ?: return false
    return parts.any { p -> offlineMatch76(listOfNotNull(p.name, p.category) + p.tags + p.specs.map { it.second }, rest) }
}

/** Lenken «Åpne i Skjold Lab ›» under Glimt-svaret (spørsmålet [q] → finanshub://skjold/…). */
var glimtSkj76 by mutableStateOf<Pair<String, String>?>(null)

/** Fra Glimt-svaret (results/open/card/tool): del → /del/<id>, skuff → /skap/<id>/<r>-<k>, ellers Skjold Lab. null = ikke Skjold. */
internal fun glimtLink76(open: JSONObject?, card: JSONObject?, tool: String?, intent: String? = null, results: JSONArray? = null): String? {
    // skjold.find: results[{kind:'part', id, open:{web:'/#/skjold/del/<id>', deepLink:'finanshub://skjold/del/<id>', drawer}}]
    val parts = objs34(results).filter { it.s43("kind", "type") == "part" }
    if (parts.size == 1) {
        val r = parts[0]
        r.optJSONObject("open")?.s43("deepLink")?.takeIf { it.startsWith("finanshub://skjold") }?.let { return it }
        r.s43("id")?.let { return "finanshub://skjold/del/" + URLEncoder.encode(it, "UTF-8") }
    }
    val href = listOfNotNull(open?.s43("deepLink", "url", "href", "link", "web"), card?.s43("deepLink", "url", "href", "link"))
        .firstOrNull { it.contains("#/skjold") || it.startsWith("finanshub://skjold") }
    if (href != null) return if (href.startsWith("finanshub://")) href else "finanshub://skjold" + href.substringAfter("#/skjold").substringBefore('?').let { if (it.isEmpty() || it.startsWith("/")) it else "/$it" }
        .replace(Regex("^/del(er)?/"), "/del/")
    val kinds = setOf("skjold", "part", "parts", "deler", "del")
    val isSkj = parts.isNotEmpty() || open?.s43("route", "module", "type") in kinds || card?.s43("type", "kind", "module") in kinds ||
        tool?.startsWith("skjold") == true || intent == "parts_find"
    if (!isSkj) return null
    val o = open ?: card
    val pid = o?.s43("partId") ?: card?.s43("partId") ?: card?.optJSONObject("part")?.s43("id")
    if (pid != null) return "finanshub://skjold/del/" + URLEncoder.encode(pid, "UTF-8")
    val cab = o?.s43("cabinetId"); val r = o?.optInt("row", 0) ?: 0; val c = o?.optInt("col", 0) ?: 0
    if (cab != null && r > 0 && c > 0) return "finanshub://skjold/skap/$cab/${short76(r, c)}"
    return "finanshub://skjold"
}

/** Kalles når Glimt har svart på Hjem: husker lenken for spørsmålet (vises bare under det svaret). */
fun glimtAnswered76(q: String, open: JSONObject?, card: JSONObject?, tool: String?, intent: String? = null, results: JSONArray? = null) {
    glimtSkj76 = glimtLink76(open, card, tool, intent, results)?.let { q to it }
}
