package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

/*
 * Prompt 81 (SPANAND, CONTRACT81): store skuffer (sammenslåtte ruter) og forhåndsoppsettet «Skjold Lab-hylla (3D-print)».
 *  - En skuff er «anker» i øverste venstre rute og dekker spanR × spanC ruter. Kartet (GET /cabinets/:id/map) lister fortsatt
 *    alle ruter; dekkede ruter har coveredBy = «r-c» (ankeret). Tegningen tegner ankeret som ett felt og hopper over dekkede ruter.
 *  - Trykk på en dekket rute = ankeret. Etikett/antall/lavt lager vises på ankeret. Uthevingen dekker hele feltet.
 *  - PUT /cabinets/:id/drawers/:row/:col {spanR, spanC} (1–4): slå sammen / del. 409 = overlapp (serverens forklaring vises).
 *  - POST /cabinets/:id/preset {id:'skjoldlab3d', etasjer:4|5} og POST /cabinets {name, preset:{id, etasjer}}.
 *  - Plassering i tekst: «Rad 4–5 · Skuff 1–2» (stor), «Rad 3 · Skuff 1–2» (bred), ellers som før. Kort form er ankerets «r-c».
 *  - UI: ui/Skjold81Ui.kt (spenn-valg i skuffkortet, forhåndsoppsettet i Skap-oppsett og «Ny Skjold Lab-hylla»).
 */

internal const val PRESET_ID81 = "skjoldlab3d"
internal const val PRESET_NAME81 = "Skjold Lab-hylla (3D-print)"

/** Ett felt i tegningen: anker (rad, kol) og spenn (rader, kolonner), klippet til skapet. */
data class SkjCell81(val row: Int, val col: Int, val spanR: Int, val spanC: Int) {
    fun has(r: Int, c: Int): Boolean = r in row until row + spanR && c in col until col + spanC
}

object Skjold81 {
    /** «Ny Skjold Lab-hylla»-arket (oversikten): åpent eller ikke, og valgt antall etasjer. */
    var newAsk by mutableStateOf(false)
    var etasjer by mutableStateOf(4)
    /** Forhåndsoppsett fra GET /presets: (id, navn, etasjer-valg). Tomt = standardverdiene under. */
    var presets by mutableStateOf<List<Triple<String, String, List<Int>>>>(emptyList())
    var busy by mutableStateOf(false)

    fun reset() { newAsk = false; etasjer = 4; busy = false }
}

/* ======================= Rene regler (speilet i test/p81-and.test.js) ======================= */

/** «4-1» → (4, 1); alt annet → null. */
internal fun parseShort81(s: String?): Pair<Int, Int>? {
    val p = s?.trim()?.split('-')?.mapNotNull { it.trim().toIntOrNull() } ?: return null
    return if (p.size == 2 && p[0] > 0 && p[1] > 0) p[0] to p[1] else null
}

/** «Rad 4–5 · Skuff 1–2» (stor), «Rad 3 · Skuff 1–2» (bred), ellers «Rad 4 · Skuff 2» (+ « · Rom 1»). */
internal fun spanText81(row: Int, col: Int, spanR: Int = 1, spanC: Int = 1, comp: Int? = null): String {
    val r = if (spanR > 1) "$row–${row + spanR - 1}" else "$row"
    val c = if (spanC > 1) "$col–${col + spanC - 1}" else "$col"
    return "Rad $r · Skuff $c" + (comp?.let { " · Rom $it" } ?: "")
}

/** Feltene i tegningen: ankre med spenn (klippet til skapet); dekkede ruter er ikke egne felt. Rad for rad, venstre mot høyre. */
internal fun cells81(rows: Int, cols: Int, m: SkjMap76?): List<SkjCell81> {
    val covered = HashSet<Int>()
    val out = ArrayList<SkjCell81>()
    for (r in 1..rows) for (c in 1..cols) {
        if ((r - 1) * cols + (c - 1) in covered) continue
        val d = m?.at(r, c)
        // En rute med coveredBy (og uten eget spenn) hører til et anker – det ankeret er allerede tegnet over den.
        if (d?.coveredBy != null && parseShort81(d.coveredBy) != (r to c)) continue
        val sr = (d?.spanR ?: 1).coerceIn(1, rows - r + 1)
        val sc = (d?.spanC ?: 1).coerceIn(1, cols - c + 1)
        val cell = SkjCell81(r, c, sr, sc)
        for (rr in r until r + sr) for (cc in c until c + sc) covered.add((rr - 1) * cols + (cc - 1))
        out.add(cell)
    }
    return out
}

/** Feltet (anker + spenn) som ruten (r, c) hører til. Trykk på en dekket rute gir ankeret. */
internal fun cellOf81(m: SkjMap76?, rows: Int, cols: Int, r: Int, c: Int): SkjCell81 {
    val d = m?.at(r, c)
    val a = parseShort81(d?.coveredBy)
    if (a != null && a != (r to c)) {
        val ad = m?.at(a.first, a.second)
        return SkjCell81(a.first, a.second, (ad?.spanR ?: 1).coerceIn(1, rows - a.first + 1), (ad?.spanC ?: 1).coerceIn(1, cols - a.second + 1))
    }
    if (m != null && (d?.spanR ?: 1) == 1 && (d?.spanC ?: 1) == 1) {
        // Eldre kart uten coveredBy: let etter et anker som dekker ruten.
        cells81(rows, cols, m).firstOrNull { it.has(r, c) }?.let { return it }
    }
    return SkjCell81(r, c, (d?.spanR ?: 1).coerceIn(1, maxOf(1, rows - r + 1)), (d?.spanC ?: 1).coerceIn(1, maxOf(1, cols - c + 1)))
}

/** Ankeret (rad, kol) for ruten. */
internal fun anchor81(m: SkjMap76?, r: Int, c: Int): Pair<Int, Int> {
    val rows = m?.rows ?: r; val cols = m?.cols ?: c
    return cellOf81(m, rows, cols, r, c).let { it.row to it.col }
}

/** Antall deler i feltet (ankeret + eventuelle eldre deler i dekkede ruter). */
internal fun cellCount81(m: SkjMap76?, cell: SkjCell81): Int {
    if (m == null) return 0
    var n = 0
    for (r in cell.row until cell.row + cell.spanR) for (c in cell.col until cell.col + cell.spanC) n += m.at(r, c)?.count ?: 0
    return n
}

/** Klientsjekk før PUT: innenfor skapet (1–4) og ingen overlapp med andre ankre. null = ok, ellers forklaring (serveren sjekker også). */
internal fun spanProblem81(m: SkjMap76, r: Int, c: Int, spanR: Int, spanC: Int): String? {
    if (spanR !in 1..4 || spanC !in 1..4) return "Spennet må være 1–4"
    if (r + spanR - 1 > m.rows || c + spanC - 1 > m.cols) return "Skuffen går utenfor skapet"
    val hit = (r until r + spanR).asSequence().flatMap { rr -> (c until c + spanC).asSequence().map { cc -> rr to cc } }
        .map { (rr, cc) -> cellOf81(m, m.rows, m.cols, rr, cc) }
        .firstOrNull { o -> !(o.row == r && o.col == c) && (o.spanR > 1 || o.spanC > 1) }
    return hit?.let { "Overlapper skuffen ${short76(it.row, it.col)}" }
}

/** (rader, store, brede) for Skjold Lab-hylla med 4 eller 5 etasjer (samme fasit som serveren). */
internal fun presetInfo81(etasjer: Int): Triple<Int, Int, Int> = if (etasjer >= 5) Triple(13, 10, 10) else Triple(11, 8, 10)

/** «Skapet blir 11 × 11 med 8 store og 10 brede skuffer». */
internal fun presetSummary81(etasjer: Int): String = presetInfo81(etasjer).let { (r, st, br) -> "Skapet blir $r × 11 med $st store og $br brede skuffer" }

/** Plassering i tekst for skuffen i skapet [cabId] (med spenn fra kartet): «Rad 4–5 · Skuff 1–2 · Rom 1». */
internal fun drawerText81(cabId: String?, row: Int, col: Int, comp: Int? = null): String {
    val m = cabId?.let { Skjold76.maps[it] }
    val cell = cellOf81(m, m?.rows ?: row, m?.cols ?: col, row, col)
    return spanText81(cell.row, cell.col, cell.spanR, cell.spanC, comp)
}

/** «Hovedskap · Rad 4–5 · Skuff 1–2», eller «Uten plass». */
internal fun locText81(cabId: String?, cab: String?, row: Int?, col: Int?, comp: Int?): String =
    if (cab == null || row == null || col == null) "Uten plass" else "$cab · " + drawerText81(cabId, row, col, comp)

/* ======================= Nettverk ======================= */

private suspend fun AppViewModel.get81(path: String): String = api46 { hlGet(API76 + path, 8_000) }
private suspend fun AppViewModel.post81(path: String, body: JSONObject): String = api46 { hlPost(API76 + path, body) }
private suspend fun AppViewModel.put81(path: String, body: JSONObject): String = api46 { hlPut(API76 + path, body) }

private fun AppViewModel.act81(block: suspend () -> Unit) = launch46 {
    Skjold81.busy = true
    try { block() } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 0 && e.code == null) { Skjold76.offline = true; flash("Kunne ikke lagre. $NEED_NET76") }
        else flash(if (e.status == 404) "Serveren kan ikke dette ennå – oppdater Homelab." else "Kunne ikke lagre: ${e.message ?: "feil"}")
    } finally { Skjold81.busy = false }
}

/** GET /presets (stille; uten svar brukes standardverdien «Skjold Lab-hylla (3D-print)», 4 eller 5 etasjer). */
fun AppViewModel.loadPresets81() = launch46 {
    val l = try {
        objs34(arr76(get81("/presets"), "presets")).mapNotNull { o ->
            val id = o.s43("id") ?: return@mapNotNull null
            val et = o.optJSONObject("options")?.optJSONArray("etasjer")?.let { a -> (0 until a.length()).mapNotNull { a.optInt(it, 0).takeIf { n -> n > 0 } } }.orEmpty()
            Triple(id, o.s43("name") ?: PRESET_NAME81, et.ifEmpty { listOf(4, 5) })
        }
    } catch (e: CancellationException) { throw e } catch (_: Exception) { null } ?: return@launch46
    Skjold81.presets = l
}

internal fun presetEtasjer81(): List<Int> = Skjold81.presets.firstOrNull { it.first == PRESET_ID81 }?.third ?: listOf(4, 5)

/** Etter endring av skapet: skapene, kartet og LED-oppsettet hentes på nytt. */
private fun AppViewModel.reloadCab81(cabId: String) {
    Skjold76.maps = Skjold76.maps - cabId
    loadMap76(cabId)
    loadSkjold76()
}

/** Slå sammen / del én skuff: PUT /cabinets/:id/drawers/:row/:col {spanR, spanC}. 409 → serverens forklaring. */
fun AppViewModel.putSpan81(cabId: String, row: Int, col: Int, spanR: Int, spanC: Int) {
    Skjold76.maps[cabId]?.let { m -> spanProblem81(m, row, col, spanR, spanC)?.let { flash(it); return } }
    act81 {
        put81("/cabinets/$cabId/drawers/$row/$col", JSONObject().put("spanR", spanR.coerceIn(1, 4)).put("spanC", spanC.coerceIn(1, 4)))
        Haptics.success()
        flash(if (spanR == 1 && spanC == 1) "Skuffen er delt" else "Skuffen dekker nå " + spanText81(row, col, spanR, spanC))
        Skjold76.drawer = row to col
        Skjold76.pulse++
        reloadCab81(cabId)
    }
}

/** «Bruk Skjold Lab-hylla (3D-print)» på et skap: POST /cabinets/:id/preset. 409 = deler utenfor nye grenser (ingenting endres). */
fun AppViewModel.applyPreset81(cabId: String, etasjer: Int, done: () -> Unit = {}) = act81 {
    post81("/cabinets/$cabId/preset", JSONObject().put("id", PRESET_ID81).put("etasjer", if (etasjer >= 5) 5 else 4))
    Haptics.success()
    flash("Skapet er satt opp som $PRESET_NAME81")
    Skjold76.drawer = null
    reloadCab81(cabId)
    done()
}

/** Nytt skap med forhåndsoppsettet: POST /cabinets {name, preset:{id, etasjer}}. */
fun AppViewModel.newPresetCab81(name: String, etasjer: Int) = act81 {
    val raw = post81("/cabinets", JSONObject().put("name", name.trim().ifEmpty { "Skjold Lab-hylla" })
        .put("preset", JSONObject().put("id", PRESET_ID81).put("etasjer", if (etasjer >= 5) 5 else 4)))
    val c = runCatching { JSONObject(raw).let { it.optJSONObject("cabinet") ?: it } }.getOrNull()?.let { parseCab76(it) }
    Haptics.success()
    flash("Skjold Lab-hylla er lagt til")
    Skjold81.newAsk = false
    c?.id?.let { id ->
        Skjold76.cabId = id; Skjold76.drawer = null
        push76("cab")
        reloadCab81(id)
    } ?: loadSkjold76()
}
