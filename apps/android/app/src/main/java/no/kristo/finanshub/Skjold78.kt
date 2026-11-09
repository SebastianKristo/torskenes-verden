package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.Locale

/*
 * Prompt 78 (LEDAND, CONTRACT78): LED over hver skuff i Skjold Lab – «vis meg hvor delen ligger».
 * En adresserbar stripe (WS2812B/SK6812) over hver skuffrad, styrt av en ESP32 med WLED. Appen snakker aldri med WLED selv:
 * alt går via serveren (/api/skjold, per bruker), som bare når verter i hjemmenettet.
 *  - «💡 Vis i skapet» på detaljsiden og i trefflista (POST /locate {partId} | {partIds:[…]} maks 10, fra prompt 79 maks 20), «Slå av» (POST /locate/off).
 *  - «Lys opp automatisk når jeg åpner et treff» (autoLocateOpen) og «Lys opp når Glimt svarer» (autoLocateGlimt):
 *    GET|PUT /leds/settings, med lokal lagring som reserve (404).
 *  - LED-oppsett per skap (GET|PUT /cabinets/:id/leds): vert, farge, varighet, lysstyrke, blink, skuffgeometri og rader
 *    (start, antall, retning, pitch, offset), «Fyll ut» (serpentine / samme retning), test (alle / rad / indeks).
 *  - Kalibreringsveiviser: én LED lyser (POST /cabinets/:id/leds/calibrate {index}), «trykk på skuffen som lyser»
 *    → PUT /cabinets/:id/leds/override {row,col,index}; forrige/neste LED.
 *  - Status (GET /leds/status?cabinet=<id>): merke «WLED svarer · navn · 120 LED» / «svarer ikke».
 * UI: ui/Skjold78Ui.kt.
 */

data class SkjLedRow78(val row: Int, val start: Int, val count: Int, val reverse: Boolean, val pitchMm: Double, val offsetMm: Double)

data class SkjLeds78(
    val host: String, val enabled: Boolean, val color: String, val durationS: Int, val blink: Boolean, val brightness: Int,
    val rows: List<SkjLedRow78>, val overrides: Map<String, Int>, val drawerPitchMm: Double?, val firstDrawerXmm: Double?,
    /** LED-avstand på stripa (60/m → 16,667 mm); standard for radene. */
    val ledPitchMm: Double = LED_PITCH60_78,
)

data class SkjLedStatus78(val ok: Boolean, val name: String?, val ledCount: Int?, val version: String?, val error: String?, val at: Long)

data class SkjLit78(val cabinetId: String?, val row: Int, val col: Int, val index: Int?)

/** Ett radfelt i skjemaet (tekst, så desimaler kan skrives fritt). */
class SkjLedRowDraft78(r: SkjLedRow78) {
    var row by mutableStateOf(r.row)
    var start by mutableStateOf(r.start.toString())
    var count by mutableStateOf(r.count.toString())
    var reverse by mutableStateOf(r.reverse)
    var pitch by mutableStateOf(num78(r.pitchMm))
    var offset by mutableStateOf(num78(r.offsetMm))
}

/** LED-oppsettet for ett skap mens det redigeres. */
class SkjLedDraft78(val cabId: String, l: SkjLeds78) {
    var host by mutableStateOf(l.host)
    var enabled by mutableStateOf(l.enabled)
    var color by mutableStateOf(l.color)
    var duration by mutableStateOf(l.durationS.toString())
    var blink by mutableStateOf(l.blink)
    var brightness by mutableStateOf(l.brightness)
    var drawerPitch by mutableStateOf(l.drawerPitchMm?.let { num78(it) } ?: "")
    var firstX by mutableStateOf(l.firstDrawerXmm?.let { num78(it) } ?: "")
    var ledPitch by mutableStateOf(num78(l.ledPitchMm))
    var rows by mutableStateOf(l.rows.map { SkjLedRowDraft78(it) })
    var overrides by mutableStateOf(l.overrides)
}

object Skjold78 {
    /** Lagret oppsett per skap (null i kartet = ikke hentet / finnes ikke). */
    var leds by mutableStateOf<Map<String, SkjLeds78>>(emptyMap())
    var draft by mutableStateOf<SkjLedDraft78?>(null)
    var ledsBusy by mutableStateOf(false)
    var ledsErr by mutableStateOf<String?>(null)
    var status by mutableStateOf<Map<String, SkjLedStatus78>>(emptyMap())
    var statusBusy by mutableStateOf(false)

    /* Vis i skapet */
    var lit by mutableStateOf<List<SkjLit78>>(emptyList())
    /** Når lyset slukker (epoch-ms på telefonen), 0 = av. */
    var litUntil by mutableStateOf(0L)
    var locBusy by mutableStateOf(false)
    var locErr by mutableStateOf<String?>(null)
    internal var locSeq = 0
    internal var lastAuto: String? = null

    /* Innstillinger */
    var autoOpen by mutableStateOf(false)
    var autoGlimt by mutableStateOf(false)
    var settingsLoaded by mutableStateOf(false)
    /** Serveren har ikke /leds/settings (404): lagres på telefonen. */
    internal var settingsLocal = false

    /* Test og kalibrering */
    var testRow by mutableStateOf("1")
    var testIndex by mutableStateOf("0")
    var calOn by mutableStateOf(false)
    var calIndex by mutableIntStateOf(0)
    var calBusy by mutableStateOf(false)
    /** Skuffer satt i denne økten («r-c» → indeks). */
    var calDone by mutableStateOf<Map<String, Int>>(emptyMap())
    internal var calJob: Job? = null

    fun reset() {
        leds = emptyMap(); draft = null; ledsErr = null; status = emptyMap(); lit = emptyList(); litUntil = 0L; locErr = null; locBusy = false
        calOn = false; calDone = emptyMap(); calJob?.cancel(); settingsLoaded = false; lastAuto = null
    }
}

/* ======================= Rene regler (speilet i test/p78-and.test.js) ======================= */

internal const val LED_COLOR78 = "#2F6BFF"
internal const val LED_PITCH60_78 = 16.667
/** Fargene i velgeren (blå er standard, som på bildet). */
internal val LED_COLORS78 = listOf("#2F6BFF" to "Blå", "#00C853" to "Grønn", "#FFFFFF" to "Hvit", "#FF3B30" to "Rød", "#FFB300" to "Gul", "#B04DFF" to "Lilla")

/** 16.667 → «16,667», 60.0 → «60». */
internal fun num78(v: Double): String = if (v == Math.floor(v) && !v.isInfinite()) v.toLong().toString() else String.format(Locale.ROOT, "%.3f", v).trimEnd('0').trimEnd('.').replace('.', ',')

/** «16,67» / «16.67» → 16.67. */
internal fun parseNum78(s: String): Double? = s.trim().replace(" ", "").replace(',', '.').toDoubleOrNull()?.takeIf { it.isFinite() }

/** Nøkkelen for overstyring: «4-2». */
internal fun ovKey78(row: Int, col: Int): String = "$row-$col"

/** «#2f6bff» / «2F6BFF» → «#2F6BFF»; ugyldig → null. */
internal fun normColor78(s: String?): String? {
    val t = s?.trim()?.removePrefix("#")?.uppercase(Locale.ROOT) ?: return null
    return if (Regex("^[0-9A-F]{6}$").matches(t)) "#$t" else null
}

/** Skuffavstand som standard (som serveren): 60 mm (Raaco 300 mm / 5), LED-veggen fra 3D-printeren 50 mm (3 LED à 16,667 mm). */
internal fun defPitch78(kind: String?): Double = if (kind == "3d") 50.0 else 60.0

/**
 * Indeksen til LED-en over skuffen (rad, kol 1-basert), eller null når raden ikke har LED-er (samme regel som serverens autoIndex78).
 * Midtpunktet i x: firstDrawerXmm + (kol − 1) · drawerPitchMm (mm fra skapets venstre kant; standard 30 og 60).
 * LED k (fra venstre) sitter på offsetMm + k · pitchMm; nærmeste velges og klemmes til raden.
 * reverse = stripa går fra høyre mot venstre: start + (count − 1 − k). Overstyring per skuff («r-c») går foran.
 */
internal fun ledIndex78(l: SkjLeds78, row: Int, col: Int): Int? {
    l.overrides[ovKey78(row, col)]?.let { return it }
    val r = l.rows.firstOrNull { it.row == row } ?: return null
    if (r.count <= 0) return null
    val dp = l.drawerPitchMm?.takeIf { it > 0 } ?: 60.0
    val x = (l.firstDrawerXmm ?: 30.0) + (col - 1) * dp
    val pitch = r.pitchMm.takeIf { it > 0 } ?: l.ledPitchMm.takeIf { it > 0 } ?: LED_PITCH60_78
    val k = Math.round((x - r.offsetMm) / pitch + 1e-9).toInt().coerceIn(0, r.count - 1)
    return r.start + if (r.reverse) r.count - 1 - k else k
}

/** Rader som standard (som serverens autoRows78): hver rad sin del av stripa, etter hverandre; serpentine = annenhver rad baklengs; offset = pitch/2. */
internal fun defaultRows78(rows: Int, perRow: Int, serpentine: Boolean, pitchMm: Double = LED_PITCH60_78, offsetMm: Double = Math.round(pitchMm / 2 * 1000) / 1000.0, start0: Int = 0): List<SkjLedRow78> =
    (1..rows.coerceAtLeast(0)).map { r -> SkjLedRow78(r, start0 + (r - 1) * perRow, perRow, serpentine && r % 2 == 0, pitchMm, offsetMm) }

/** LED-er per rad for skapets bredde: cols · skuffavstand / LED-avstand (Raaco: 5 · 60 / 16,67 = 18). */
internal fun perRow78(cols: Int, drawerPitchMm: Double, pitchMm: Double = LED_PITCH60_78): Int =
    if (pitchMm <= 0) 0 else Math.round(cols * drawerPitchMm / pitchMm).toInt().coerceAtLeast(1)

/** Totalt antall LED-er i oppsettet (høyeste indeks + 1). */
internal fun ledTotal78(rows: List<SkjLedRow78>): Int = rows.maxOfOrNull { it.start + it.count } ?: 0

/** Verten ser ut til å være i hjemmenettet (privat IPv4, .local/.lan, eller navn uten punktum). Serveren sjekker uansett. */
internal fun hostLocal78(h: String): Boolean {
    val t = h.trim().lowercase(Locale.ROOT).removePrefix("http://").substringBefore('/').substringBefore(':')
    if (t.isEmpty()) return false
    val ip = t.split('.').map { it.toIntOrNull() }
    if (ip.size == 4 && ip.all { it != null && it in 0..255 }) {
        val (a, b) = ip[0]!! to ip[1]!!
        return a == 10 || (a == 172 && b in 16..31) || (a == 192 && b == 168)
    }
    if (!Regex("^[a-z0-9-]+(\\.[a-z0-9-]+)*$").matches(t)) return false
    return !t.contains('.') || t.endsWith(".local") || t.endsWith(".lan")
}

/** untilMs fra serveren: epoch-ms (> 1e12) eller varighet i ms. Gir epoch-ms på telefonen. */
internal fun untilAt78(untilMs: Long, now: Long): Long = if (untilMs <= 0) 0L else if (untilMs > 1_000_000_000_000L) untilMs else now + untilMs

/** «Lyser i skapet · 24 s igjen». */
internal fun litText78(n: Int, secs: Long): String = (if (n <= 1) "Lyser i skapet" else "$n skuffer lyser") + if (secs > 0) " · $secs s igjen" else ""

/** «WLED svarer · Skap · 120 LED» / «WLED svarer ikke». */
internal fun statusText78(s: SkjLedStatus78?): String = when {
    s == null -> "Sjekker WLED …"
    s.ok -> listOfNotNull("WLED svarer", s.name?.takeIf { it.isNotBlank() }, s.ledCount?.let { "$it LED" }).joinToString(" · ")
    else -> "WLED svarer ikke" + (s.error?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")
}

/** Skapet har LED klar: på og med vert. */
internal fun ledReady78(l: SkjLeds78?): Boolean = l != null && l.enabled && l.host.isNotBlank()

/** Delene som kan lyses opp samtidig (plasserte, i skap med LED), maks 10. */
internal fun locatable78(parts: List<SkjPart76>, ready: (String) -> Boolean): List<SkjPart76> =
    parts.filter { it.loc.placed && it.loc.cabinetId?.let(ready) == true }.take(MAX_LIT79)

/* ======================= Parsing ======================= */

private fun JSONObject.d78(vararg k: String): Double? {
    for (x in k) if (has(x) && !isNull(x)) { val v = optDouble(x); if (!v.isNaN()) return v; optString(x).replace(',', '.').toDoubleOrNull()?.let { return it } }
    return null
}

internal fun parseLeds78(raw: JSONObject, top: JSONObject? = null): SkjLeds78 {
    val o = raw.optJSONObject("leds") ?: raw
    val rows = objs34(o.optJSONArray("rows")).mapNotNull { r ->
        val n = r.d78("row")?.toInt() ?: return@mapNotNull null
        SkjLedRow78(n, r.d78("start")?.toInt() ?: 0, r.d78("count")?.toInt() ?: 0, r.optBoolean("reverse", false), r.d78("pitchMm") ?: o.d78("ledPitchMm") ?: LED_PITCH60_78, r.d78("offsetMm") ?: 0.0)
    }.sortedBy { it.row }
    val ov = o.optJSONObject("overrides")?.let { j -> j.keys().asSequence().mapNotNull { k -> j.d78(k)?.toInt()?.let { k to it } }.toMap() }.orEmpty()
    return SkjLeds78(
        o.s43("host") ?: "", o.optBoolean("enabled", false), normColor78(o.s43("color")) ?: LED_COLOR78, o.d78("durationS")?.toInt() ?: 30,
        o.optBoolean("blink", false), (o.d78("brightness")?.toInt() ?: 128).coerceIn(1, 255), rows, ov,
        o.d78("drawerPitchMm") ?: top?.d78("drawerPitchMm") ?: raw.d78("drawerPitchMm"), o.d78("firstDrawerXmm") ?: top?.d78("firstDrawerXmm") ?: raw.d78("firstDrawerXmm"),
        (o.d78("ledPitchMm") ?: raw.d78("ledPitchMm"))?.takeIf { it > 0 } ?: LED_PITCH60_78,
    )
}

internal fun ledsJson78(l: SkjLeds78): JSONObject = JSONObject()
    .put("host", l.host.trim()).put("enabled", l.enabled).put("color", normColor78(l.color) ?: LED_COLOR78)
    .put("durationS", l.durationS.coerceIn(1, 600)).put("blink", l.blink).put("brightness", l.brightness.coerceIn(1, 255))
    .put("rows", JSONArray().apply { l.rows.forEach { r -> put(JSONObject().put("row", r.row).put("start", r.start).put("count", r.count).put("reverse", r.reverse).put("pitchMm", r.pitchMm).put("offsetMm", r.offsetMm)) } })
    .put("overrides", JSONObject().apply { l.overrides.forEach { (k, v) -> put(k, v) } })
    .put("ledPitchMm", l.ledPitchMm)
    // Tomme felt sendes ikke (serveren beholder da sin verdi; null ville gitt 400).
    .apply { l.drawerPitchMm?.let { put("drawerPitchMm", it) }; l.firstDrawerXmm?.let { put("firstDrawerXmm", it) } }

/** Skjemaet → oppsett (ugyldige tall faller tilbake til standard). */
internal fun draftLeds78(d: SkjLedDraft78): SkjLeds78 = SkjLeds78(
    d.host.trim(), d.enabled, normColor78(d.color) ?: LED_COLOR78, (d.duration.trim().toIntOrNull() ?: 30).coerceIn(1, 600), d.blink, d.brightness.coerceIn(1, 255),
    d.rows.map { r -> SkjLedRow78(r.row, r.start.trim().toIntOrNull()?.coerceAtLeast(0) ?: 0, r.count.trim().toIntOrNull()?.coerceAtLeast(0) ?: 0, r.reverse, parseNum78(r.pitch)?.takeIf { it > 0 } ?: LED_PITCH60_78, parseNum78(r.offset) ?: 0.0) },
    d.overrides, parseNum78(d.drawerPitch)?.takeIf { it > 0 }, parseNum78(d.firstX)?.takeIf { it >= 0 }, parseNum78(d.ledPitch)?.takeIf { it > 0 } ?: LED_PITCH60_78,
)

internal fun parseStatus78(o: JSONObject, now: Long): SkjLedStatus78 {
    val j = o.optJSONObject("status") ?: o
    return SkjLedStatus78(j.optBoolean("ok", false), j.s43("name"), j.d78("ledCount", "count")?.toInt(), j.s43("version", "ver"), j.s43("error", "message"), now)
}

internal fun parseLit78(o: JSONObject): List<SkjLit78> = objs34(o.optJSONArray("lit")).mapNotNull { l ->
    val r = l.d78("row")?.toInt() ?: return@mapNotNull null
    val c = l.d78("col")?.toInt() ?: return@mapNotNull null
    SkjLit78(l.opt("cabinetId")?.takeIf { it != JSONObject.NULL }?.toString(), r, c, l.d78("index")?.toInt())
}.distinctBy { Triple(it.cabinetId, it.row, it.col) } // prompt 79: serveren gir én oppføring per del; to deler i samme skuff er én skuff

/* ======================= Nettverk ======================= */

private fun enc78(s: String): String = URLEncoder.encode(s, "UTF-8")
private fun idJson78(id: String): Any = id.toLongOrNull() ?: id

private fun errText78(e: Exception, fallback: String): String = when {
    e is ApiException && e.status == 0 && e.code == null -> "Fikk ikke kontakt med serveren. Prøv igjen når du er på nett."
    e is ApiException && e.status == 429 -> "Vent litt – for mange lys-kall på kort tid."
    e is ApiException -> e.message?.takeIf { it.isNotBlank() } ?: fallback
    else -> uiErr73(e, fallback)
}

private suspend fun AppViewModel.get78(path: String): String = api46 { hlGet(API76 + path, 8_000) }
private suspend fun AppViewModel.post78(path: String, body: JSONObject = JSONObject()): String = api46 { hlPost(API76 + path, body) }
private suspend fun AppViewModel.put78(path: String, body: JSONObject): String = api46 { hlPut(API76 + path, body) }

/** Henter LED-oppsettet for alle skapene (stille; 404 = serveren har ikke LED ennå). */
fun AppViewModel.loadAllLeds78() = launch46 {
    for (c in Skjold76.cabinets) loadLedsNow78(c.id)
    loadLedSettings78()
}

private suspend fun AppViewModel.loadLedsNow78(cabId: String): SkjLeds78? {
    val l = try { parseLeds78(JSONObject(get78("/cabinets/${enc78(cabId)}/leds"))) } catch (e: CancellationException) { throw e } catch (_: Exception) { null } ?: return null
    Skjold78.leds = Skjold78.leds + (cabId to l)
    return l
}

/** Åpner LED-oppsettet for skapet (skjermen «leds»). */
fun AppViewModel.openLeds78(cabId: String) {
    val s = Skjold78
    val cab = Skjold76.cabinets.firstOrNull { it.id == cabId }
    s.ledsErr = null; s.calOn = false; s.calDone = emptyMap()
    s.draft = SkjLedDraft78(cabId, s.leds[cabId] ?: emptyLeds78(cab))
    Skjold76.cabId = cabId
    push76("leds")
    Haptics.tap()
    launch46 {
        s.ledsBusy = true
        try {
            val l = try { parseLeds78(JSONObject(get78("/cabinets/${enc78(cabId)}/leds"))) } catch (e: ApiException) { if (e.status == 404) null else throw e }
            if (l != null) {
                s.leds = s.leds + (cabId to l)
                if (s.draft?.cabId == cabId) s.draft = SkjLedDraft78(cabId, if (l.rows.isEmpty()) l.copy(rows = emptyLeds78(cab).rows) else l)
            }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.ledsErr = errText78(e, "Fikk ikke hentet LED-oppsettet.") } finally { s.ledsBusy = false }
    }
    refreshStatus78(cabId)
    loadLedSettings78()
}

/** Nytt oppsett: 60 LED/m, hver rad sin del av stripa i serpentine (stripa snur ved enden av hver rad). */
internal fun emptyLeds78(cab: SkjCab76?): SkjLeds78 {
    val rows = cab?.rows ?: 12; val cols = cab?.cols ?: 5
    val dp = defPitch78(cab?.kind)
    return SkjLeds78("", false, LED_COLOR78, 30, false, 128, defaultRows78(rows, perRow78(cols, dp), serpentine = true), emptyMap(), dp, dp / 2)
}

/** «Fyll ut»: rader på nytt fra skapets mål. */
fun fillRows78(d: SkjLedDraft78, cab: SkjCab76, serpentine: Boolean) {
    val dp = parseNum78(d.drawerPitch)?.takeIf { it > 0 } ?: defPitch78(cab.kind)
    val pitch = parseNum78(d.ledPitch)?.takeIf { it > 0 } ?: LED_PITCH60_78
    val start0 = d.rows.firstOrNull()?.start?.trim()?.toIntOrNull()?.coerceAtLeast(0) ?: 0
    d.rows = defaultRows78(cab.rows, perRow78(cab.cols, dp, pitch), serpentine, pitch, start0 = start0).map { SkjLedRowDraft78(it) }
    Haptics.select()
}

fun AppViewModel.saveLeds78(done: (() -> Unit)? = null) {
    val s = Skjold78
    val d = s.draft ?: return
    val l = draftLeds78(d)
    if (l.enabled && l.host.isBlank()) { flash("Skriv inn adressen til WLED først (f.eks. 192.168.1.50)"); return }
    s.ledsBusy = true; s.ledsErr = null
    launch46 {
        try {
            val raw = put78("/cabinets/${enc78(d.cabId)}/leds", ledsJson78(l))
            val saved = runCatching { parseLeds78(JSONObject(raw)) }.getOrNull()?.takeIf { it.host.isNotBlank() || it.rows.isNotEmpty() } ?: l
            s.leds = s.leds + (d.cabId to saved)
            Haptics.success()
            flash("LED-oppsettet er lagret")
            refreshStatus78(d.cabId)
            done?.invoke()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.ledsErr = errText78(e, "Kunne ikke lagre LED-oppsettet."); Haptics.error()
        } finally { s.ledsBusy = false }
    }
}

/** GET /leds/status?cabinet=<id>: pinger WLED via serveren. */
fun AppViewModel.refreshStatus78(cabId: String) {
    val s = Skjold78
    s.statusBusy = true
    launch46 {
        val now = System.currentTimeMillis()
        val st = try { parseStatus78(JSONObject(get78("/leds/status?cabinet=" + enc78(cabId))), now) } catch (e: CancellationException) { throw e } catch (e: Exception) {
            SkjLedStatus78(false, null, null, null, if (e is ApiException && e.status == 404) "LED er ikke satt opp" else errText78(e, "ingen kontakt"), now)
        }
        s.status = s.status + (cabId to st)
        s.statusBusy = false
    }
}

/** Test: alle, én rad eller én indeks (lyser i 5 s). Bruker det lagrede oppsettet på serveren. */
fun AppViewModel.testLeds78(cabId: String, mode: String, row: Int? = null, index: Int? = null) {
    val body = JSONObject().put("mode", mode)
    row?.let { body.put("row", it) }; index?.let { body.put("index", it) }
    Haptics.tap()
    launch46 {
        try {
            post78("/cabinets/${enc78(cabId)}/leds/test", body)
            flash(when (mode) { "row" -> "Rad $row lyser i 5 s"; "index" -> "LED $index lyser i 5 s"; else -> "Hele stripa lyser i 5 s" })
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Testen feilet: " + errText78(e, "feil")); Haptics.error() }
    }
}

/* ---------- Vis i skapet ---------- */

/** Tenner skuffen for delen (eller flere treff, maks 10). [auto]: stille ved feil (åpnet treff / auto-lys). */
fun AppViewModel.locateParts78(ids: List<String>, auto: Boolean = false) {
    val s = Skjold78
    val list = ids.distinct().take(MAX_LIT79) // prompt 79: maks 20 (eldre server: 10, se under)
    if (list.isEmpty()) return
    val seq = ++s.locSeq
    s.locBusy = true; s.locErr = null
    if (!auto) Haptics.tap()
    launch46 {
        try {
            val o = if (list.size == 1) JSONObject(post78("/locate", JSONObject().put("partId", idJson78(list[0]))))
            else try { JSONObject(post78("/locate", JSONObject().put("partIds", JSONArray().apply { list.forEach { put(idJson78(it)) } })))
            } catch (e: ApiException) {
                if (e.status != 400) throw e
                // prompt 79: eldre server tar maks 10 samtidig.
                val ten = if (list.size <= 10) null else try { JSONObject(post78("/locate", JSONObject().put("partIds", JSONArray().apply { list.take(10).forEach { put(idJson78(it)) } })))
                } catch (e2: ApiException) { if (e2.status != 400) throw e2; null }
                ten ?: run {
                    // Serveren tar én om gangen: tenn hver for seg, maks 5 kall i sekundet.
                    var last = JSONObject(); val all = mutableListOf<SkjLit78>()
                    for (id in list.take(10)) { last = JSONObject(post78("/locate", JSONObject().put("partId", idJson78(id)))); all += parseLit78(last); delay(220) }
                    last.put("lit", JSONArray().apply { all.forEach { l -> put(JSONObject().put("cabinetId", l.cabinetId ?: JSONObject.NULL).put("row", l.row).put("col", l.col).put("index", l.index ?: JSONObject.NULL)) } })
                }
            }
            if (seq != s.locSeq) return@launch46
            gotLit78(o)
            if (!auto) Haptics.success()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (seq == s.locSeq && !auto) { s.locErr = errText78(e, "Fikk ikke tent lyset."); Haptics.error() }
        } finally { if (seq == s.locSeq) s.locBusy = false }
    }
}

/** Tenner én skuff direkte (fra tegningen). */
fun AppViewModel.locateDrawer78(cabId: String, row: Int, col: Int) {
    val s = Skjold78
    val seq = ++s.locSeq
    s.locBusy = true; s.locErr = null
    Haptics.tap()
    launch46 {
        try {
            val o = JSONObject(post78("/locate", JSONObject().put("cabinetId", idJson78(cabId)).put("row", row).put("col", col)))
            if (seq == s.locSeq) { gotLit78(o); Haptics.success() }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (seq == s.locSeq) { s.locErr = errText78(e, "Fikk ikke tent lyset."); Haptics.error() }
        } finally { if (seq == s.locSeq) s.locBusy = false }
    }
}

private fun gotLit78(o: JSONObject) {
    val s = Skjold78
    s.lit = parseLit78(o)
    val dur = Skjold76.cabinets.firstNotNullOfOrNull { c -> s.leds[c.id]?.durationS }?.toLong() ?: 30L
    s.litUntil = untilAt78(o.optLong("untilMs", 0L), System.currentTimeMillis()).takeIf { it > 0 } ?: (System.currentTimeMillis() + dur * 1000)
    if (s.lit.isEmpty() && !o.optBoolean("ok", true)) s.locErr = o.s43("error", "message") ?: "Ingen skuff å lyse opp."
    else if (s.lit.isEmpty()) s.locErr = o.s43("message") ?: "Delen ligger ikke i et skap med LED."
}

/** «Slå av»: POST /locate/off (serveren skriver tilbake forrige tilstand). */
fun AppViewModel.locateOff78() {
    val s = Skjold78
    s.locSeq++
    s.lit = emptyList(); s.litUntil = 0L; s.locBusy = false; s.locErr = null
    Haptics.dismiss()
    launch46 { try { post78("/locate/off") } catch (e: CancellationException) { throw e } catch (_: Exception) { } }
}

/** Kalles når et treff åpnes (detaljsiden): lyser automatisk når innstillingen er på. Én gang per del på rad. */
fun AppViewModel.partOpened78(id: String) {
    val s = Skjold78
    if (!s.autoOpen || s.lastAuto == id) return
    val p = Skjold76.items?.firstOrNull { it.id == id } ?: Skjold76.part?.takeIf { it.id == id }
    if (p != null && (!p.loc.placed || !ledReady78(p.loc.cabinetId?.let { s.leds[it] }))) return
    s.lastAuto = id
    locateParts78(listOf(id), auto = true)
}

/* ---------- Innstillinger ---------- */

private fun prefs78(ctx: Context) = ctx.getSharedPreferences("skjold78", Context.MODE_PRIVATE)

fun AppViewModel.loadLedSettings78() = launch46 {
    val s = Skjold78
    val key = account?.id ?: "anon"
    try {
        val o = JSONObject(get78("/leds/settings")).let { it.optJSONObject("settings") ?: it }
        s.settingsLocal = false
        if (o.has("autoLocateOpen")) s.autoOpen = o.optBoolean("autoLocateOpen", false)
        if (o.has("autoLocateGlimt")) s.autoGlimt = o.optBoolean("autoLocateGlimt", false)
    } catch (e: CancellationException) { throw e } catch (e: Exception) {
        if (e is ApiException && e.status == 404) {
            s.settingsLocal = true
            val sp = prefs78(appCtx46)
            s.autoOpen = sp.getBoolean("open-$key", false); s.autoGlimt = sp.getBoolean("glimt-$key", false)
        }
    }
    s.settingsLoaded = true
}

fun AppViewModel.putLedSettings78(autoOpen: Boolean? = null, autoGlimt: Boolean? = null) {
    val s = Skjold78
    val oldO = s.autoOpen; val oldG = s.autoGlimt
    autoOpen?.let { s.autoOpen = it }; autoGlimt?.let { s.autoGlimt = it }
    Haptics.select()
    val key = account?.id ?: "anon"
    launch46 {
        try {
            if (s.settingsLocal) throw ApiException("lokal", 404)
            put78("/leds/settings", JSONObject().put("autoLocateOpen", s.autoOpen).put("autoLocateGlimt", s.autoGlimt))
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (e is ApiException && e.status == 404) {
                s.settingsLocal = true
                prefs78(appCtx46).edit().putBoolean("open-$key", s.autoOpen).putBoolean("glimt-$key", s.autoGlimt).apply()
            } else { s.autoOpen = oldO; s.autoGlimt = oldG; flash("Kunne ikke lagre: " + errText78(e, "feil")) }
        }
    }
}

/* ---------- Kalibrering ---------- */

/** Start veiviseren: første LED i første rad lyser. */
fun AppViewModel.startCal78() {
    val s = Skjold78
    val d = s.draft ?: return
    s.calOn = true; s.calDone = emptyMap()
    s.calIndex = d.rows.firstOrNull()?.start?.trim()?.toIntOrNull() ?: 0
    calShow78()
}

/** Forrige/neste LED. */
fun AppViewModel.calStep78(delta: Int) {
    val s = Skjold78
    s.calIndex = (s.calIndex + delta).coerceAtLeast(0)
    Haptics.select()
    calShow78()
}

private fun AppViewModel.calShow78() {
    val s = Skjold78
    val d = s.draft ?: return
    val idx = s.calIndex
    s.calJob?.cancel()
    s.calJob = launchJob46 {
        delay(150) // raske trykk på «neste» blir ett kall (serveren tar maks 5 i sekundet)
        s.calBusy = true
        try { post78("/cabinets/${enc78(d.cabId)}/leds/calibrate", JSONObject().put("index", idx)) } catch (e: CancellationException) { throw e } catch (e: Exception) {
            flash("Fikk ikke tent LED $idx: " + errText78(e, "feil"))
        } finally { s.calBusy = false }
    }
}

/** «Trykk på skuffen som lyser»: lagrer overstyringen og går videre til neste LED. */
fun AppViewModel.calPick78(row: Int, col: Int) {
    val s = Skjold78
    val d = s.draft ?: return
    val idx = s.calIndex
    Haptics.select()
    launch46 {
        try {
            put78("/cabinets/${enc78(d.cabId)}/leds/override", JSONObject().put("row", row).put("col", col).put("index", idx))
            val k = ovKey78(row, col)
            s.calDone = s.calDone + (k to idx)
            d.overrides = d.overrides + (k to idx)
            s.leds[d.cabId]?.let { l -> s.leds = s.leds + (d.cabId to l.copy(overrides = l.overrides + (k to idx))) }
            Haptics.success()
            calStep78(1)
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Kunne ikke lagre: " + errText78(e, "feil")) }
    }
}

fun AppViewModel.stopCal78() {
    val s = Skjold78
    s.calJob?.cancel()
    s.calOn = false
    locateOff78()
}

/** Fjern alle overstyringer (lagres med «Lagre»). */
fun clearOverrides78() {
    Skjold78.draft?.let { it.overrides = emptyMap() }
    Haptics.select()
}
