package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
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
 * Prompt 79 (PICKAND, CONTRACT79): plukkliste i Skjold Lab og feilsøking av WLED.
 *  - «+» på hvert treff og på detaljsiden legger delen i plukklista (✓ når den er med; nytt trykk fjerner).
 *  - Plukklistelinja nederst: «Plukkliste (3)» · «💡 Vis alle med LED» · åpne. Lyser delene: nedtelling + «Slå av».
 *  - Plukklista (skjermen «pick»): bilde, navn, plassering, fargeprikk når delen lyser, ± for antall jeg tar, «Fjern», «Tøm»,
 *    «Ta ut av lager» (POST /parts/:id/qty {delta:-n} for alle, med angre).
 *  - «Vis alle med LED»: POST /locate {partIds:[…≤20], colors:true} → hver del sin farge (lit[].color); mangler fargen,
 *    gir telefonen den fra samme palett i rekkefølgen delene ble lagt til.
 *  - Lagres lokalt per konto (overlever omstart) og synkes med GET|PUT /picklist når serveren har det (404 → bare lokalt).
 *  - «Feilsøk LED» i LED-oppsettet: POST /cabinets/:id/leds/diagnose → steg + «Lyste stripa rødt?» / «Lyste én LED blått?» → hint.
 * UI: ui/Skjold79Ui.kt.
 */

/** Én del i plukklista. [take] = antall jeg tar ut. Resten er et øyeblikksbilde av delen (vises uten nett). */
data class SkjPick79(
    val id: String, val name: String, val thumb: String?, val loc: String, val cabinetId: String?, val row: Int?, val col: Int?,
    val qty: Double?, val unit: String, val take: Int = 1,
) {
    val placed: Boolean get() = cabinetId != null && row != null && col != null
}

data class SkjDiagStep79(val name: String, val ok: Boolean, val detail: String?, val key: String? = null)

object Skjold79 {
    var items by mutableStateOf<List<SkjPick79>>(emptyList())
    /** Delens farge mens den lyser (del-id → #RRGGBB), gyldig så lenge [colorSeq] == Skjold78.locSeq. */
    var colors by mutableStateOf<Map<String, String>>(emptyMap())
    /** Skuff («skap:r-c») → farge, for deler som deler skuff (første farge vinner). */
    var drawerColors by mutableStateOf<Map<String, String>>(emptyMap())
    var colorSeq by mutableStateOf(-1)
    /** Deler som ikke ble tent (del-id → grunn). */
    var skipped by mutableStateOf<Map<String, String>>(emptyMap())
    var busy by mutableStateOf(false)
    var askClear by mutableStateOf(false)
    internal var loadedFor: String? = null
    internal var serverSync = true
    internal var syncJob: Job? = null

    /* Feilsøk LED */
    var diagOn by mutableStateOf(false)
    var diagCab by mutableStateOf<String?>(null)
    var diagBusy by mutableStateOf(false)
    var diagStarted by mutableLongStateOf(0L)
    var diagSteps by mutableStateOf<List<SkjDiagStep79>>(emptyList())
    var diagHint by mutableStateOf<String?>(null)
    /** Serverens hint per utfall: none, red, blue, both. */
    var diagHints by mutableStateOf<Map<String, String>>(emptyMap())
    /** Funn i WLED (effekt kjører, segmentet er av, lav lysstyrke …). */
    var diagWarnings by mutableStateOf<List<String>>(emptyList())
    var diagErr by mutableStateOf<String?>(null)
    var diagRed by mutableStateOf<Boolean?>(null)
    var diagBlue by mutableStateOf<Boolean?>(null)
    internal var diagSeq = 0

    fun reset() {
        items = emptyList(); colors = emptyMap(); drawerColors = emptyMap(); colorSeq = -1; skipped = emptyMap(); busy = false; askClear = false
        loadedFor = null; serverSync = true; syncJob?.cancel()
        diagOn = false; diagCab = null; diagBusy = false; diagSteps = emptyList(); diagHint = null; diagHints = emptyMap(); diagWarnings = emptyList(); diagErr = null; diagRed = null; diagBlue = null; diagSeq++
    }
}

/* ======================= Rene regler (speilet i test/p79-and.test.js) ======================= */

/** Maks skuffer som tennes samtidig (serveren: 20). */
internal const val MAX_LIT79 = 20

/** Lett skillbare farger i rekkefølge (blå, gul, grønn, rød, lilla, oransje, cyan, rosa, hvit, lime) – samme som serverens PALETTE79. */
internal val PALETTE79 = listOf("#2F6BFF", "#FFD000", "#00C853", "#FF1744", "#AA00FF", "#FF6D00", "#00E5FF", "#FF4081", "#FFFFFF", "#C6FF00")

/** Fargen til del nr. [i] (0-basert) når serveren ikke sender den: første er skapets farge, så paletten uten den. */
internal fun pickColor79(i: Int, first: String? = null): String {
    val f = normColor78(first) ?: PALETTE79[0]
    val all = listOf(f) + PALETTE79.filter { it != f }
    return all[Math.floorMod(i, all.size)]
}

/** «+» / «✓»: legger til eller fjerner delen. */
internal fun toggle79(list: List<SkjPick79>, p: SkjPick79): List<SkjPick79> =
    if (list.any { it.id == p.id }) list.filter { it.id != p.id } else list + p

/** Antall jeg tar: 1 … 999. */
internal fun setTake79(list: List<SkjPick79>, id: String, take: Int): List<SkjPick79> =
    list.map { if (it.id == id) it.copy(take = take.coerceIn(1, 999)) else it }

/** Delene som kan lyses opp (plasserte, i skap med LED), maks 20, i rekkefølgen de ble lagt til. */
internal fun locatablePick79(list: List<SkjPick79>, ready: (String) -> Boolean): List<SkjPick79> =
    list.filter { it.placed && ready(it.cabinetId!!) }.take(MAX_LIT79)

/** Grunnen til at en del ikke kan lyse (null = kan lyse). */
internal fun whyNot79(p: SkjPick79, ready: (String) -> Boolean): String? = when {
    !p.placed -> "Uten plass"
    !ready(p.cabinetId!!) -> "Skapet har ikke LED"
    else -> null
}

/** «Plukkliste (3)». */
internal fun barText79(n: Int): String = "Plukkliste ($n)"

/** Delen som SkjPick79 (beholder antallet jeg tar). */
internal fun pickOf79(p: SkjPart76, take: Int = 1): SkjPick79 = SkjPick79(
    p.id, p.name, p.thumbUrl ?: p.photos.firstOrNull(), p.loc.text, p.loc.cabinetId, p.loc.row, p.loc.col, p.qty, p.unit, take,
)

/** Slår sammen lokal og lagret liste: den lokale rekkefølgen først, så det som bare finnes på serveren. */
internal fun merge79(local: List<SkjPick79>, server: List<SkjPick79>): List<SkjPick79> =
    local + server.filter { s -> local.none { it.id == s.id } }

/** Hint ut fra svarene i veiviseren (null = ikke svart ennå). */
internal fun diagHint79(red: Boolean?, blue: Boolean?): String? = when {
    red == null || blue == null -> null
    !red && !blue -> "Ingen av dem lyste: feilen er i maskinvaren eller WLED-oppsettet. Sjekk datapinnen (GPIO) under «LED Preferences» i WLED, " +
        "LED-typen (WS2812B, fargerekkefølge GRB) og antall LED-er, felles jord mellom ESP32 og strømforsyningen, nivåskifter (3,3 → 5 V) og at stripa får strøm."
    red && !blue -> "Stripa lyste rødt, men ikke én LED blått: da er feilen hos oss (styringen av enkelt-LED-er). Rapporter dette – oppdater Homelab og prøv igjen."
    red && blue -> "Begge lyste, så WLED virker. Lyser feil skuff, er det kalibreringen eller indeksen: sjekk rader, start og retning, eller kjør kalibreringsveiviseren."
    else -> "Én LED lyste, men ikke hele stripa: strømmen strekker trolig ikke til. Sjekk strømforsyningen og strømbegrensningen (maks mA) i «LED Preferences» i WLED."
}

/** Utfallet av svarene: none, red, blue, both (null = ikke svart). */
internal fun diagOutcome79(red: Boolean?, blue: Boolean?): String? = when {
    red == null || blue == null -> null
    red && blue -> "both"
    red -> "red"
    blue -> "blue"
    else -> "none"
}

/** Hintet som vises: serverens tekst for utfallet når den finnes, ellers telefonens egen. */
internal fun diagHintText79(red: Boolean?, blue: Boolean?, hints: Map<String, String>): String? =
    diagOutcome79(red, blue)?.let { hints[it]?.takeIf { h -> h.isNotBlank() } } ?: diagHint79(red, blue)

/** Veiviseren spør bare om lysene når WLED svarte (info og tilstand gikk bra). */
internal fun diagAsk79(steps: List<SkjDiagStep79>): Boolean =
    steps.isNotEmpty() && steps.none { !it.ok && diagKey79(it.key ?: it.name) in setOf("info", "state") }

/** Stegnavn fra serveren → nøkkel (info, state, red, blue, restore) eller navnet. */
internal fun diagKey79(name: String): String {
    val n = name.lowercase(Locale.ROOT)
    return when {
        "info" in n -> "info"
        "state" in n || "tilstand" in n -> "state"
        "red" in n || "rød" in n || "rod" in n || "all" in n || "strip" in n -> "red"
        "blue" in n || "blå" in n || "bla" in n || "single" in n || "index" in n || "én" in n -> "blue"
        "restore" in n || "gjenopp" in n -> "restore"
        else -> n
    }
}

/** Norsk navn på steget. */
internal fun diagLabel79(name: String): String = when (diagKey79(name)) {
    "info" -> "WLED svarer (info, versjon, LED-er)"
    "state" -> "Segment, på/av og lysstyrke"
    "red" -> "Hele stripa rød i 3 s"
    "blue" -> "Én LED blå i 3 s"
    "restore" -> "Gjenopprettet"
    else -> name
}

/* ======================= Parsing og lagring ======================= */

internal fun pickJson79(p: SkjPick79): JSONObject = JSONObject().put("id", p.id).put("name", p.name).put("thumb", p.thumb ?: JSONObject.NULL).put("loc", p.loc)
    .put("cabinetId", p.cabinetId ?: JSONObject.NULL).put("row", p.row ?: JSONObject.NULL).put("col", p.col ?: JSONObject.NULL)
    .put("qty", p.qty ?: JSONObject.NULL).put("unit", p.unit).put("take", p.take)

private fun JSONObject.idStr79(vararg k: String): String? {
    for (x in k) if (has(x) && !isNull(x)) opt(x)?.toString()?.takeIf { it.isNotBlank() && it != "null" }?.let { return it }
    return null
}

private fun JSONObject.int79(k: String): Int? = if (has(k) && !isNull(k)) optDouble(k).takeIf { !it.isNaN() }?.toInt() else null

internal fun parsePick79(o: JSONObject): SkjPick79? {
    val id = o.idStr79("id", "partId") ?: return null
    return SkjPick79(
        id, o.s43("name") ?: "", o.s43("thumb", "thumbUrl"), o.s43("loc", "location") ?: "", o.idStr79("cabinetId"), o.int79("row"), o.int79("col"),
        if (o.has("qty") && !o.isNull("qty")) o.optDouble("qty").takeIf { !it.isNaN() } else null, o.s43("unit") ?: "stk",
        (o.int79("take") ?: o.int79("count") ?: 1).coerceIn(1, 999),
    )
}

/** GET /picklist: {items:[{partId, qty|take}]} (eller picklist / en ren liste). Her er qty antallet jeg tar, ikke lagerantallet. */
internal fun parsePickList79(raw: String): List<SkjPick79> {
    val t = raw.trim()
    val arr = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("items") ?: it.optJSONArray("picklist") ?: it.optJSONObject("picklist")?.optJSONArray("items") }
    return objs34(arr).mapNotNull { o ->
        val id = o.idStr79("partId", "id") ?: return@mapNotNull null
        SkjPick79(id, o.s43("name") ?: "", null, "", null, null, null, null, "stk", (o.int79("take") ?: o.int79("qty") ?: 1).coerceIn(1, 999))
    }.distinctBy { it.id }
}

private fun prefs79(ctx: Context) = ctx.getSharedPreferences("skjold79", Context.MODE_PRIVATE)
private fun AppViewModel.key79(): String = "pick-" + (account?.id ?: "anon")

private fun AppViewModel.saveLocal79() {
    val arr = JSONArray().apply { Skjold79.items.forEach { put(pickJson79(it)) } }
    runCatching { prefs79(appCtx46).edit().putString(key79(), arr.toString()).apply() }
}

/* ======================= Nettverk ======================= */

private fun enc79(s: String): String = URLEncoder.encode(s, "UTF-8")
private fun idJson79(id: String): Any = id.toLongOrNull() ?: id

private fun errText79(e: Exception, fallback: String): String = when {
    e is ApiException && e.status == 0 && e.code == null -> "Fikk ikke kontakt med serveren. Prøv igjen når du er på nett."
    e is ApiException && e.status == 429 -> "Vent litt – for mange lys-kall på kort tid."
    e is ApiException -> e.message?.takeIf { it.isNotBlank() } ?: fallback
    else -> uiErr73(e, fallback)
}

private suspend fun AppViewModel.get79(path: String): String = api46 { hlGet(API76 + path, 8_000) }
private suspend fun AppViewModel.post79(path: String, body: JSONObject = JSONObject()): String = api46 { hlPost(API76 + path, body) }
private suspend fun AppViewModel.put79(path: String, body: JSONObject): String = api46 { hlPut(API76 + path, body) }

/** Henter plukklista for kontoen: lokalt med en gang, så synk med serveren (404 → bare lokalt). */
fun AppViewModel.loadPick79() {
    val s = Skjold79
    val key = key79()
    if (s.loadedFor == key) { refreshPick79(); return }
    s.loadedFor = key
    s.items = runCatching { objs34(JSONArray(prefs79(appCtx46).getString(key, "[]") ?: "[]")).mapNotNull { parsePick79(it) } }.getOrDefault(emptyList())
    launch46 {
        try {
            val srv = parsePickList79(get79("/picklist"))
            if (s.loadedFor != key) return@launch46
            s.serverSync = true
            val merged = merge79(s.items, srv)
            val changed = merged.map { it.id } != srv.map { it.id } || merged.any { m -> srv.firstOrNull { it.id == m.id }?.take != m.take }
            s.items = merged
            saveLocal79()
            fillPick79()
            if (changed) syncPick79()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (e is ApiException && e.status == 404) s.serverSync = false
        }
    }
}

/** Oppdaterer navn, plassering og antall fra lista som er lastet (beholder antallet jeg tar). */
fun AppViewModel.refreshPick79() {
    val s = Skjold79
    val known = (Skjold76.items.orEmpty() + listOfNotNull(Skjold76.part)).associateBy { it.id }
    if (s.items.none { known[it.id] != null }) return
    val next = s.items.map { p -> known[p.id]?.let { pickOf79(it, p.take) } ?: p }
    if (next != s.items) { s.items = next; saveLocal79() }
}

/** Deler fra serveren uten navn (synket fra en annen enhet): hent dem. */
private suspend fun AppViewModel.fillPick79() {
    val s = Skjold79
    refreshPick79()
    for (p in s.items.filter { it.name.isBlank() }) {
        val part = try { parsePart76(JSONObject(get79("/parts/${enc79(p.id)}")).let { it.optJSONObject("part") ?: it }) } catch (e: CancellationException) { throw e } catch (_: Exception) { null } ?: continue
        s.items = s.items.map { if (it.id == p.id) pickOf79(part, p.take) else it }
    }
    saveLocal79()
}

/** Lagrer lokalt med en gang og på serveren etter 0,6 s (raske trykk blir ett kall). */
private fun AppViewModel.changed79() {
    saveLocal79()
    syncPick79()
}

/** Prompt 82: lagrer plukklista etter utsjekking til et produkt. */
internal fun AppViewModel.pickChanged79() = changed79()

private fun AppViewModel.syncPick79() {
    val s = Skjold79
    if (!s.serverSync) return
    s.syncJob?.cancel()
    s.syncJob = launchJob46 {
        delay(600)
        val body = JSONObject().put("items", JSONArray().apply { s.items.forEach { put(JSONObject().put("partId", idJson79(it.id)).put("qty", it.take).put("take", it.take)) } })
        try { put79("/picklist", body) } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (e is ApiException && e.status == 404) s.serverSync = false
        }
    }
}

/** «+» / «✓» på et treff eller på detaljsiden. */
fun AppViewModel.togglePick79(pt: SkjPart76) {
    val s = Skjold79
    val had = s.items.any { it.id == pt.id }
    s.items = toggle79(s.items, pickOf79(pt))
    if (had) Haptics.dismiss() else Haptics.tap()
    changed79()
}

fun AppViewModel.removePick79(id: String) {
    val s = Skjold79
    s.items = s.items.filter { it.id != id }
    s.colors = s.colors - id
    Haptics.dismiss()
    changed79()
}

fun AppViewModel.takePick79(id: String, delta: Int) {
    val s = Skjold79
    val cur = s.items.firstOrNull { it.id == id } ?: return
    s.items = setTake79(s.items, id, cur.take + delta)
    Haptics.select()
    changed79()
}

/** «Tøm» (med angre). */
fun AppViewModel.clearPick79() {
    val s = Skjold79
    val before = s.items
    if (before.isEmpty()) return
    s.items = emptyList(); s.skipped = emptyMap(); s.askClear = false
    Haptics.success()
    changed79()
    offerUndo76("Plukklista er tømt") { s.items = merge79(before, s.items); changed79() }
}

/** Åpner plukklista (skjermen «pick»). */
fun AppViewModel.openPick79() {
    refreshPick79()
    Skjold79.askClear = false
    push76("pick")
    Haptics.tap()
}

/** Delens farge mens den lyser (null = lyser ikke). */
internal fun colorOf79(p: SkjPick79): String? {
    val s = Skjold79
    val l = Skjold78
    if (s.colorSeq != l.locSeq || l.litUntil <= 0 || l.lit.isEmpty()) return null
    return s.colors[p.id] ?: if (p.placed) s.drawerColors["${p.cabinetId}:${p.row}-${p.col}"] else null
}

/** Fargen til en tent skuff (LitBar, trefflista). */
internal fun drawerColor79(cabId: String?, row: Int, col: Int): String? {
    val s = Skjold79
    val l = Skjold78
    if (s.colorSeq != l.locSeq || l.litUntil <= 0) return null
    return s.drawerColors["$cabId:$row-$col"]
}

/** «💡 Vis alle med LED»: alle plasserte deler i skap med LED, hver med sin farge (maks 20). */
fun AppViewModel.locatePick79() {
    val s = Skjold79
    val l78 = Skjold78
    val ready = { c: String -> ledReady78(l78.leds[c]) }
    val list = locatablePick79(s.items, ready)
    s.skipped = s.items.mapNotNull { p -> whyNot79(p, ready)?.let { p.id to it } }.toMap() +
        s.items.filter { whyNot79(it, ready) == null }.drop(MAX_LIT79).associate { it.id to "Over $MAX_LIT79 skuffer" }
    if (list.isEmpty()) {
        flash(if (s.items.isEmpty()) "Plukklista er tom" else "Ingen av delene ligger i et skap med LED")
        Haptics.error(); return
    }
    val seq = ++l78.locSeq
    l78.locBusy = true; l78.locErr = null
    Haptics.tap()
    launch46 {
        try {
            val ids = list.map { it.id }
            val o = try {
                JSONObject(post79("/locate", JSONObject().put("partIds", JSONArray().apply { ids.forEach { put(idJson79(it)) } }).put("colors", true)))
            } catch (e: ApiException) {
                // Eldre server: maks 10 samtidig.
                if (e.status != 400 || ids.size <= 10) throw e
                JSONObject(post79("/locate", JSONObject().put("partIds", JSONArray().apply { ids.take(10).forEach { put(idJson79(it)) } }).put("colors", true)))
            }
            if (seq != l78.locSeq) return@launch46
            gotPickLit79(o, list, seq)
            Haptics.success()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (seq == l78.locSeq) { l78.locErr = errText79(e, "Fikk ikke tent lyset."); flash(l78.locErr ?: "Fikk ikke tent lyset."); Haptics.error() }
        } finally { if (seq == l78.locSeq) l78.locBusy = false }
    }
}

private fun gotPickLit79(o: JSONObject, list: List<SkjPick79>, seq: Int) {
    val s = Skjold79
    val l78 = Skjold78
    val now = System.currentTimeMillis()
    val lits = objs34(o.optJSONArray("lit"))
    val colors = LinkedHashMap<String, String>()
    val drawers = LinkedHashMap<String, String>()
    lits.forEachIndexed { i, j ->
        val r = j.int79("row") ?: return@forEachIndexed
        val c = j.int79("col") ?: return@forEachIndexed
        val cab = j.idStr79("cabinetId")
        val pid = j.idStr79("partId") ?: list.firstOrNull { it.cabinetId == cab && it.row == r && it.col == c }?.id
        val order = list.indexOfFirst { it.id == pid }.takeIf { it >= 0 } ?: i
        val first = cab?.let { l78.leds[it]?.color } ?: list.firstOrNull()?.cabinetId?.let { l78.leds[it]?.color }
        val col = normColor78(j.s43("color")) ?: pickColor79(order, first)
        pid?.let { colors.putIfAbsent(it, col) }
        drawers.putIfAbsent("$cab:$r-$c", col)
    }
    // Deler i samme skuff deler LED: den første fargen vinner.
    list.forEach { p -> if (p.placed && colors[p.id] == null) drawers["${p.cabinetId}:${p.row}-${p.col}"]?.let { colors[p.id] = it } }
    s.colors = colors; s.drawerColors = drawers; s.colorSeq = seq
    objs34(o.optJSONArray("skipped")).forEach { k ->
        val pid = k.idStr79("partId", "id") ?: return@forEach
        s.skipped = s.skipped + (pid to (k.s43("reason", "error", "message") ?: "Ble ikke tent"))
    }
    l78.lit = parseLit78(o)
    val dur = list.firstNotNullOfOrNull { p -> p.cabinetId?.let { l78.leds[it]?.durationS } }?.toLong() ?: 30L
    l78.litUntil = untilAt78(o.optLong("untilMs", 0L), now).takeIf { it > 0 } ?: (now + dur * 1000)
    if (l78.lit.isEmpty()) l78.locErr = o.s43("error", "message") ?: "Ingen skuff å lyse opp."
}

/** «Ta ut av lager»: trekker fra antallet jeg tar for alle delene, tømmer lista – med angre. */
fun AppViewModel.takeOut79() {
    val s = Skjold79
    val list = s.items
    if (list.isEmpty() || s.busy) return
    if (takeOutTo82()) return // prompt 82: «Til produkt» → POST /checkout (alt eller ingenting, angre)
    s.busy = true
    launch46 {
        val done = mutableListOf<SkjPick79>()
        var err: String? = null
        try {
            for (p in list) {
                try { post79("/parts/${p.id}/qty", JSONObject().put("delta", -p.take.toDouble())); done += p } catch (e: CancellationException) { throw e } catch (e: Exception) {
                    if (err == null) err = errText79(e, "feil")
                }
            }
        } finally { s.busy = false }
        if (done.isEmpty()) { flash("Kunne ikke ta ut av lager: " + (err ?: "feil")); Haptics.error(); return@launch46 }
        val ids = done.map { it.id }.toSet()
        s.items = s.items.filter { it.id !in ids }
        changed79()
        Skjold76.part?.let { pt -> done.firstOrNull { it.id == pt.id }?.let { Skjold76.part = pt.copy(qty = (pt.qty - it.take).coerceAtLeast(0.0)) } }
        searchSkjold76(now = true)
        Haptics.success()
        if (err != null) flash("Noen deler ble ikke trukket fra: $err")
        val n = done.sumOf { it.take }
        offerUndo76("Tok ut $n ${if (n == 1) "del" else "deler"} av lager") {
            for (p in done) post79("/parts/${p.id}/qty", JSONObject().put("delta", p.take.toDouble()))
            Skjold79.items = merge79(done, Skjold79.items)
            changed79()
            searchSkjold76(now = true)
            flash("Lagret er som før")
        }
    }
}

/* ---------- Feilsøk LED ---------- */

fun AppViewModel.startDiag79(cabId: String) {
    val s = Skjold79
    s.diagOn = true; s.diagCab = cabId; s.diagSteps = emptyList(); s.diagHint = null; s.diagErr = null; s.diagRed = null; s.diagBlue = null; s.diagBusy = false
    Skjold78.calOn = false
    Haptics.tap()
}

/** Kjører diagnosen: info, tilstand, hele stripa rød 3 s, én LED blå 3 s, gjenoppretting. */
fun AppViewModel.runDiag79() {
    val s = Skjold79
    val cabId = s.diagCab ?: return
    if (s.diagBusy) return
    val seq = ++s.diagSeq
    s.diagBusy = true; s.diagErr = null; s.diagSteps = emptyList(); s.diagHint = null; s.diagHints = emptyMap(); s.diagWarnings = emptyList(); s.diagRed = null; s.diagBlue = null
    s.diagStarted = System.currentTimeMillis()
    Haptics.tap()
    launch46 {
        try {
            val o = JSONObject(post79("/cabinets/${enc79(cabId)}/leds/diagnose", JSONObject()))
            if (seq != s.diagSeq) return@launch46
            s.diagSteps = objs34(o.optJSONArray("steps")).map { j -> SkjDiagStep79(j.s43("name", "step", "key") ?: "?", j.optBoolean("ok", false), j.s43("detail", "error", "message"), j.s43("key")) }
            s.diagHint = o.s43("hint")
            s.diagHints = o.optJSONObject("hints")?.let { h -> h.keys().asSequence().mapNotNull { k -> h.s43(k)?.let { k to it } }.toMap() }.orEmpty()
            s.diagWarnings = o.optJSONArray("warnings")?.let { a -> (0 until a.length()).mapNotNull { i -> a.optString(i).takeIf { it.isNotBlank() } } }.orEmpty()
            Haptics.success()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (seq == s.diagSeq) {
                s.diagErr = if (e is ApiException && e.status == 404 && e.code == null) "Serveren har ikke feilsøking ennå. Oppdater Homelab." else errText79(e, "Feilsøkingen feilet.")
                Haptics.error()
            }
        } finally { if (seq == s.diagSeq) s.diagBusy = false }
    }
}

fun stopDiag79() {
    val s = Skjold79
    s.diagSeq++
    s.diagOn = false; s.diagBusy = false
}
