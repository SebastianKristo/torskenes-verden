package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 73 (BRIEF73): «Innhold i briefen» (claude-code-brief-velg-kort.md) og kort som vises med en gang
 * (claude-code-brief-kort-lastes-straks.md). Fasit: Glimt Brief.dc.html (mode settings → INNHOLD I BRIEFEN, BK0).
 * - Lista: GET/PUT /api/brief-cards, POST /api/brief-cards/reset ({cards:[{key, title, sub, on}]}). Caches per bruker
 *   (SharedPreferences), så briefen tegnes fra lista fra første bilde – ikke fra data.
 * - Kortene fra /api/brief52 hentes hvert for seg (?only=id), alle samtidig, 6 s hver. Siste svar per kort caches og vises
 *   straks; nytt innhold byttes inn stille. Uten cache: skjelett i full høyde. Tidsavbrudd: «Oppdatert kl. HH:MM» eller
 *   «Klarte ikke hente» + «Prøv igjen». Forhåndshenting når appen kommer i forgrunnen og når Hjem vises (maks hvert 5. min).
 * UI: ui/Brief73Ui.kt (innstillinger, skjelett, kort) og ui/Brief35.kt (BriefStack73).
 */

data class Item73(val key: String, val title: String, val sub: String, val on: Boolean)

object B73 {
    /** [key, tittel, kilde, på] – samme som server/brief73.js CATALOG73 (reserve uten server). */
    val CATALOG = listOf(
        Item73("vaer", "Vær", "Nå, i dag og varsel", true), Item73("kal", "Kalender", "Første avtale og resten av dagen", true),
        Item73("fokus", "Dagens fokus", "Det viktigste i dag, valgt av Glimt", true), Item73("gjore", "Huskeliste · 3 viktigste", "Fra Gjøremål", true),
        Item73("reise", "Min reise", "Ruter: neste avgang og når du må gå", true), Item73("regn", "Regninger denne uka", "Fra Finans", true),
        Item73("kveld", "Nytt i kveld", "Nye episoder og filmer fra Media", true), Item73("nyheter", "Nyheter", "Sammendrag fra Nyheter", true),
        Item73("pakker", "Pakker", "Sporing på vei", false), Item73("homelab", "Homelab-status", "Varsler fra serveren", false),
        Item73("domener", "Domener og SSL", "Utløper snart", false), Item73("klaer", "Klær i dag", "Hva du bør ha på deg, fra Vær", true),
        Item73("abo", "Prøveperioder", "Fra Abonnementer", true), Item73("bibel", "Bibelvers", "Dagens vers", true),
        Item73("familie", "Familie", "De som deler posisjon", true), Item73("skole", "Skole og jobb", "Prøver og frister neste 7 dager", true),
        Item73("bursdager", "Bursdager", "Neste bursdager", true), Item73("nordlys", "Nordlys i natt", "Når Kp er høy nok", true),
        Item73("aksjer", "Aksjer", "Porteføljen fra Finans", false),
    )
    /** Nøkkel → id i /api/brief52. */
    val B52 = mapOf("fokus" to "focus", "gjore" to "todo", "reise" to "trip", "regn" to "bills", "kveld" to "tonight",
        "homelab" to "homelab", "domener" to "domains", "klaer" to "clothes", "aksjer" to "stocks")
    /** Kortets høyde ferdig (dp) – skjelettet tar samme plass. */
    val HEIGHT = mapOf("vaer" to 280, "kal" to 150, "fokus" to 190, "gjore" to 230, "reise" to 180, "regn" to 250, "kveld" to 146, "nyheter" to 760,
        "pakker" to 150, "homelab" to 200, "domener" to 200, "klaer" to 150, "abo" to 160, "bibel" to 260, "familie" to 120, "skole" to 160,
        "bursdager" to 140, "nordlys" to 100, "aksjer" to 130)

    var items by mutableStateOf(CATALOG)
    var err by mutableStateOf<String?>(null)
    internal var who: String? = "-"
    internal var listAt = 0L

    /** Kortdata fra /api/brief52 per id, status ("loading", "ok", "stale", "fail") og tidspunkt. */
    val cards = mutableStateMapOf<String, Card52>()
    val state = mutableStateMapOf<String, String>()
    val at = mutableStateMapOf<String, Long>()
    internal val raw = HashMap<String, JSONObject>()
    internal var cardsFor: String? = "-"
    internal var fetchAt = 0L

    val onKeys: List<String> get() = items.filter { it.on }.map { it.key }
    val countText: String get() = "${items.count { it.on }} av ${items.size} på"
    fun title(key: String): String = items.firstOrNull { it.key == key }?.title ?: CATALOG.firstOrNull { it.key == key }?.title ?: key
    fun height(key: String): Int = HEIGHT[key] ?: 150
}

private fun sp73(ctx: Context) = ctx.getSharedPreferences("brief73", Context.MODE_PRIVATE)
private fun JSONObject.s73(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

private fun parseItems73(raw: String): List<Item73>? = runCatching {
    val a = JSONObject(raw).optJSONArray("cards") ?: JSONArray(raw)
    (0 until a.length()).mapNotNull { i ->
        val c = a.optJSONObject(i) ?: return@mapNotNull null
        val k = c.s73("key") ?: return@mapNotNull null
        Item73(k, c.s73("title") ?: k, c.s73("sub") ?: "", c.optBoolean("on", false))
    }.takeIf { it.isNotEmpty() }
}.getOrNull()

private fun itemsJson73(l: List<Item73>): JSONArray = JSONArray().apply { l.forEach { put(JSONObject().put("key", it.key).put("title", it.title).put("sub", it.sub).put("on", it.on)) } }

/** Lista og kortcachen fra disk for kontoen som er logget inn. */
fun AppViewModel.hydrateBrief73() {
    val a = account?.id
    val ctx = appCtx52b
    if (B73.who != a) {
        B73.who = a
        B73.listAt = 0L
        B73.items = sp73(ctx).getString("list_${a ?: ""}", null)?.let(::parseItems73) ?: B73.CATALOG
    }
    if (B73.cardsFor != a) {
        B73.cardsFor = a
        B73.cards.clear(); B73.state.clear(); B73.at.clear(); B73.raw.clear(); B73.fetchAt = 0L
        sp73(ctx).getString("c52_${a ?: ""}", null)?.let { s ->
            runCatching {
                val o = JSONObject(s)
                o.keys().forEach { id ->
                    val c = o.optJSONObject(id) ?: return@forEach
                    B73.raw[id] = c
                    B73.at[id] = c.optLong("_at", 0L)
                    B73.cards[id] = card73(id, c)
                }
            }
        }
    }
}

private fun card73(id: String, c: JSONObject) = Card52(id, c.s73("variant") ?: "", c.s73("title") ?: id, c.optJSONObject("data"), c.s73("error"))

private fun AppViewModel.persistCards73() {
    val o = JSONObject()
    B73.raw.forEach { (id, c) -> o.put(id, JSONObject(c.toString()).put("_at", B73.at[id] ?: 0L)) }
    sp73(appCtx52b).edit().putString("c52_${account?.id ?: ""}", o.toString()).apply()
}

private fun AppViewModel.persistList73() {
    sp73(appCtx52b).edit().putString("list_${account?.id ?: ""}", itemsJson73(B73.items).toString()).apply()
}

/** Henter lista (høyst hvert minutt uten force). */
fun AppViewModel.loadBriefCards73(force: Boolean = false) {
    hydrateBrief73()
    if (!force && System.currentTimeMillis() - B73.listAt < 60_000L) return
    B73.listAt = System.currentTimeMillis()
    launch52b {
        try {
            parseItems73(api52b { hlGet("/brief-cards", timeout = 6_000) })?.let { B73.items = it; B73.err = null; persistList73() }
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status != 404) B73.err = "Fikk ikke hentet lista. Viser den lagrede."
        } catch (_: Exception) { /* uten nett: lista fra disk gjelder */ }
    }
}

private fun AppViewModel.saveBriefCards73(l: List<Item73>) {
    B73.items = l
    persistList73()
    val body = JSONObject().put("cards", JSONArray().apply { l.forEach { put(JSONObject().put("key", it.key).put("on", it.on)) } })
    launch52b {
        try {
            parseItems73(api52b { hlPut("/brief-cards", body) })?.let { B73.items = it; persistList73() }
            B73.err = null
            loadBrief34(force = true) // Glimts oppsummering tar bare med kortene som er på
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
            B73.err = "Lagret på telefonen. Synkes når nettet er tilbake."
        }
    }
    fetchBriefCards73(force = true)
}

fun AppViewModel.toggleBriefCard73(key: String) {
    Haptics.tap()
    saveBriefCards73(B73.items.map { if (it.key == key) it.copy(on = !it.on) else it })
}

fun AppViewModel.moveBriefCard73(key: String, by: Int) {
    val l = B73.items.toMutableList()
    val i = l.indexOfFirst { it.key == key }
    val j = i + by
    if (i < 0 || j < 0 || j >= l.size) return
    Haptics.tap()
    val x = l[i]; l[i] = l[j]; l[j] = x
    saveBriefCards73(l)
}

/** Dra-for-å-flytte: legger kortet på plass `to`. */
fun AppViewModel.placeBriefCard73(key: String, to: Int) {
    val l = B73.items.toMutableList()
    val i = l.indexOfFirst { it.key == key }
    if (i < 0) return
    val j = to.coerceIn(0, l.size - 1)
    if (i == j) return
    l.add(j, l.removeAt(i))
    saveBriefCards73(l)
}

fun AppViewModel.resetBriefCards73() {
    Haptics.tap()
    launch52b {
        try {
            parseItems73(api52b { hlPost("/brief-cards/reset") })?.let { B73.items = it; persistList73() }
            B73.err = null
            fetchBriefCards73(force = true)
            loadBrief34(force = true)
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
            B73.err = "Fikk ikke tilbakestilt. Prøv igjen."
        }
    }
}

/** Alle kortene fra /api/brief52 som er på – samtidig, 6 s hver. Ett tregt kort holder ikke igjen de andre. */
fun AppViewModel.fetchBriefCards73(force: Boolean = true) {
    hydrateBrief73()
    if (!force && System.currentTimeMillis() - B73.fetchAt < 5 * 60_000L) return
    B73.fetchAt = System.currentTimeMillis()
    val ids = B73.onKeys.mapNotNull { B73.B52[it] }.filter { B73.state[it] != "loading" }
    if (ids.isEmpty()) return
    ids.forEach { B73.state[it] = "loading" }
    launch52b {
        coroutineScope {
            ids.map { id -> async { id to fetchOne73(id) } }.awaitAll()
        }.forEach { (id, res) -> applyCard73(id, res) }
        persistCards73()
    }
}

/** Ett kort på nytt («Prøv igjen»). */
fun AppViewModel.retryBriefCard73(id: String) {
    Haptics.tap()
    B73.state[id] = "loading"
    launch52b { applyCard73(id, fetchOne73(id)); persistCards73() }
}

/** Forhåndshenting (forgrunn, Hjem vises): maks hvert 5. minutt. */
fun AppViewModel.prefetchBrief73() {
    loadBriefCards73()
    fetchBriefCards73(force = false)
}

/** null = feil/tidsavbrudd; JSONObject.NULL-lignende tomt objekt = kortet finnes ikke for brukeren. */
private suspend fun AppViewModel.fetchOne73(id: String): Pair<Boolean, JSONObject?>? = try {
    withTimeoutOrNull(6_000L) {
        val raw = api52b { hlGet("/brief52?only=" + URLEncoder.encode(id, "UTF-8"), timeout = 6_000) }
        val a = JSONObject(raw).optJSONArray("cards") ?: JSONArray()
        true to (0 until a.length()).mapNotNull { a.optJSONObject(it) }.firstOrNull { it.s73("id") == id }
    }
} catch (e: CancellationException) { throw e } catch (e: ApiException) {
    if (e.status == 404) (true to null) else null
} catch (_: Exception) { null }

private fun applyCard73(id: String, res: Pair<Boolean, JSONObject?>?) {
    val c = res?.second
    when {
        res == null -> B73.state[id] = if (B73.raw[id]?.optJSONObject("data") != null) "stale" else "fail"
        c == null -> { B73.raw.remove(id); B73.cards.remove(id); B73.state[id] = "ok" }
        c.optJSONObject("data") == null && c.s73("error") != null && !c.optBoolean("empty", false) ->
            B73.state[id] = if (B73.raw[id]?.optJSONObject("data") != null) "stale" else "fail"
        else -> { B73.raw[id] = c; B73.at[id] = System.currentTimeMillis(); B73.cards[id] = card73(id, c); B73.state[id] = "ok" }
    }
}

/** Prompt 73: siste svar fra /api/brief per bruker (for Vær, Kalender, Nyheter, Pakker … fra første bilde). */
internal fun AppViewModel.saveBrief73(raw: String, kind: String) {
    sp73(appCtx52b).edit().putString("b34_${account?.id ?: ""}", raw).putString("b34kind_${account?.id ?: ""}", kind).apply()
}

internal fun AppViewModel.cachedBrief73(kind: String): Pair<Brief34, BriefX38?>? {
    val sp = sp73(appCtx52b)
    val a = account?.id ?: ""
    val raw = sp.getString("b34_$a", null) ?: return null
    val b = runCatching { parseBrief34(raw, sp.getString("b34kind_$a", null) ?: kind) }.getOrNull() ?: return null
    return b to runCatching { parseBx38(raw) }.getOrNull()
}
