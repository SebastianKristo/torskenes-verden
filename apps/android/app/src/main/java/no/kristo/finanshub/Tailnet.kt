package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

/*
 * Mer → Tailnet (Tailscale, prompt 57). Bare admin: modulen «tailnet» er adminOnly i modullisten, så serveren sender den bare til
 * administratorer, og /api/tailscale/* svarer 403 for andre. Serveren regner alt og sender ferdige tekster (latencyLabel,
 * statusLabel, fakta, oppetid); appen viser dem.
 *   GET  /api/tailscale/devices          → counts, filters, devices
 *   GET  /api/tailscale/stats            → tiles (stat-rutenettet), maintenance.count
 *   GET  /api/tailscale/devices/:id      → facts, history (latency.spark, uptimeLabels, stripe), canPing
 *   POST /api/tailscale/devices/:id/ping → {ok, label}
 */

data class TsEnhet(
    val id: String, val name: String, val ip: String, val dns: String, val kind: String, val online: Boolean,
    val latencyKnown: Boolean, val latencyLabel: String, val statusLabel: String, val ssh: String,
)

data class TsFilter(val id: String, val navn: String, val count: Int, val kinds: List<String>, val offline: Boolean)

data class TsStat(val id: String, val label: String, val value: String, val sub: String)

data class TsFakta(val label: String, val value: String, val mono: Boolean)

data class TsDetalj(
    val fakta: List<TsFakta>, val spark: List<Double?>, val latensTekst: String, val oppetidTekst: String, val stripe: List<String>, val canPing: Boolean,
)

object TailnetTilstand {
    var open by mutableStateOf(false)
    var loaded by mutableStateOf(false)
    var loading by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var devices by mutableStateOf<List<TsEnhet>>(emptyList())
    var filters by mutableStateOf<List<TsFilter>>(emptyList())
    var stats by mutableStateOf<List<TsStat>>(emptyList())
    var maintenance by mutableStateOf(0)
    var online by mutableStateOf(0)
    var total by mutableStateOf(0)
    var filter by mutableStateOf("alle")
    var query by mutableStateOf("")
    var showAll by mutableStateOf(false)
    var expanded by mutableStateOf<String?>(null)
    val detail = mutableStateMapOf<String, TsDetalj>()
    val ping = mutableStateMapOf<String, String>()

    /** Undertekst i Mer: «Tailscale · 12 av 16 enheter online». */
    val merSub: String get() = if (loaded) "Tailscale · $online av $total enheter online" else "Tailscale · enheter, latens og oppetid"

    /** Enhetene som passer filteret og søket, i serverens rekkefølge (online først, så navn). */
    fun shown(): List<TsEnhet> {
        val f = filters.firstOrNull { it.id == filter } ?: filters.firstOrNull()
        val q = query.trim().lowercase()
        return devices.filter { d ->
            val passer = f == null || (if (f.offline) !d.online else d.kind in f.kinds)
            passer && (q.isEmpty() || d.name.lowercase().contains(q) || d.ip.contains(q) || d.dns.lowercase().contains(q))
        }
    }
}

private fun tsEnhet(o: JSONObject) = TsEnhet(
    id = o.s43("id") ?: "", name = o.s43("name") ?: "", ip = o.s43("ip") ?: "", dns = o.s43("dns") ?: "", kind = o.s43("kind") ?: "desktop",
    online = o.b43(false, "online"), latencyKnown = o.d43("latencyMs") != null, latencyLabel = o.s43("latencyLabel") ?: "ukjent",
    statusLabel = o.s43("statusLabel") ?: "", ssh = o.s43("ssh") ?: "",
)

private fun tsFilter(o: JSONObject): TsFilter {
    val k = o.optJSONArray("kinds")
    val kinds = (0 until (k?.length() ?: 0)).mapNotNull { i -> k?.optString(i)?.takeIf { it.isNotBlank() } }
    return TsFilter(o.s43("id") ?: "alle", o.s43("navn") ?: "", o.i43("count") ?: 0, kinds, o.b43(false, "offline"))
}

private fun tsPath(id: String): String = "/tailscale/devices/" + android.net.Uri.encode(id)

fun AppViewModel.openTailnet() { TailnetTilstand.open = true; loadTailnet() }

fun AppViewModel.loadTailnet() = launch44 {
    val t = TailnetTilstand
    t.loading = true
    try {
        val raw = api44 { hlGet("/tailscale/devices", timeout = 20_000) }
        val o = JSONObject(raw)
        t.devices = arr43(raw, "devices").map(::tsEnhet)
        t.filters = arr43(raw, "filters").map(::tsFilter)
        val c = o.optJSONObject("counts")
        t.online = c?.i43("online") ?: t.devices.count { it.online }
        t.total = c?.i43("total") ?: t.devices.size
        t.loaded = true
        t.error = null
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        t.error = when (e.status) { 403 -> "Bare administratorer kan se tailnetet."; 404 -> "Serveren har ikke Tailnet ennå (oppdater Homelab)."; else -> e.message }
    } catch (e: Exception) { t.error = e.message }
    try {
        val raw = api44 { hlGet("/tailscale/stats", timeout = 20_000) }
        t.stats = arr43(raw, "tiles").map { TsStat(it.s43("id") ?: "", it.s43("label") ?: "", it.s43("value") ?: "", it.s43("sub") ?: "") }
        t.maintenance = JSONObject(raw).optJSONObject("maintenance")?.i43("count") ?: 0
    } catch (e: CancellationException) { throw e } catch (_: Exception) { /* stat-rutenettet er valgfritt */ }
    t.loading = false
}

fun AppViewModel.toggleTailnet(id: String) {
    val t = TailnetTilstand
    if (t.expanded == id) { t.expanded = null; return }
    t.expanded = id
    if (t.detail[id] == null) loadTailnetDetalj(id)
}

fun AppViewModel.loadTailnetDetalj(id: String) = launch44 {
    try {
        val o = JSONObject(api44 { hlGet(tsPath(id), timeout = 20_000) })
        val h = o.optJSONObject("history")
        val l = h?.optJSONObject("latency")
        val up = h?.optJSONObject("uptimeLabels")
        val sp = l?.optJSONArray("spark")
        val spark = (0 until (sp?.length() ?: 0)).map { i -> if (sp == null || sp.isNull(i)) null else sp.optDouble(i).takeIf { !it.isNaN() } }
        val fakta = objs34(o.optJSONArray("facts")).map { TsFakta(it.s43("label") ?: "", it.s43("value") ?: "", it.b43(false, "mono")) }
        val stripe = objs34(h?.optJSONArray("stripe")).map { it.s43("state") ?: "" }
        TailnetTilstand.detail[id] = TsDetalj(
            fakta, spark,
            "median ${l?.s43("medianLabel") ?: "ukjent"} · p95 ${l?.s43("p95Label") ?: "ukjent"}",
            "24 t ${up?.s43("24h") ?: "ukjent"} · 7 d ${up?.s43("7d") ?: "ukjent"} · 30 d ${up?.s43("30d") ?: "ukjent"}",
            stripe, o.b43(false, "canPing"),
        )
    } catch (e: CancellationException) { throw e } catch (_: Exception) { /* detaljen prøves igjen ved neste trykk */ }
}

fun AppViewModel.pingTailnet(id: String) = launch44 {
    TailnetTilstand.ping[id] = "Pinger …"
    TailnetTilstand.ping[id] = try {
        val o = JSONObject(api44 { hlPost(tsPath(id) + "/ping") })
        o.s43("label") ?: if (o.b43(false, "ok")) "Svar" else "Ingen svar"
    } catch (e: CancellationException) { throw e } catch (e: ApiException) { e.message ?: "Ingen svar" } catch (_: Exception) { "Ingen svar" }
}
