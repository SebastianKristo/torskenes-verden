@file:JvmName("DomeneDomener")

package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

/*
 * Domener: kode som lå i blandingsfilene (P38.kt, Models.kt, Mod24B.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

data class DomSum38(val domain: String, val head: String, val pts: List<Pair<String, Long?>>, val meta: String?)

/* ======================= Domener ======================= */

/** Domenene og statistikken hentes i bakgrunnen (oppstart og forgrunn, maks hvert 5. min), så siden er klar når den åpnes. */
fun AppViewModel.prefetchDomains38(force: Boolean = false) {
    val s = p38
    val now = System.currentTimeMillis()
    if (!loggedIn || (!force && now - s.domPrefAt < 5 * 60_000L)) return
    s.domPrefAt = now
    launch38 {
        try { loadDomains38() } catch (e: CancellationException) { throw e } catch (_: Exception) {}
    }
}

/** Glimt-knappen på Domener: Oversikt, åpner oppsummeringen (lages hvis dagens mangler) og ruller til toppen. */
fun AppViewModel.domGlimt38() {
    Haptics.tap()
    if (domSection != "oversikt") domSection = "oversikt"
    domAll = false
    p38.domSumOpen = true
    b26.topSeq++
    loadDomSum38()
}

fun AppViewModel.loadDomSum38(fresh: Boolean = false) {
    val s = p38
    val d = domain ?: "*"
    if (!fresh && s.domSum?.domain == d) return
    if (s.domSumBusy) return
    s.domSumBusy = true
    launch38 {
        try {
            val path = "/domains/" + URLEncoder.encode(d, "UTF-8") + "/summary"
            val o = JSONObject(api38 { if (fresh) hlPost(path) else hlGet(path, timeout = 20_000) })
            val pts = objs34(o.optJSONArray("pts") ?: o.optJSONArray("points")).mapNotNull { p -> p.s37("t")?.let { it to hex37(p.s37("color")) } }
            s.domSum = DomSum38(d, o.s37("head") ?: "Ingen oppsummering ennå.", pts, o.s37("meta"))
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.domSum = DomSum38(d, if (e is ApiException && e.status == 404) "Serveren har ikke Glimt-oppsummering for domener ennå." else "Fikk ikke laget oppsummeringen nå.", emptyList(), null)
        } finally { s.domSumBusy = false }
    }
}

/* ---------------- Domener ---------------- */

data class DomainRef(val id: String, val name: String, val source: String)

data class Named(val name: String, val value: Double)

data class Country(val iso2: String, val name: String, val visitors: Double, val threats: Double, val iso3n: Int? = null)

data class Point(val t: String, val requests: Double, val cached: Double, val visitors: Double)

data class ThreatEvent(val time: String, val action: String, val country: String, val ip: String, val path: String)

data class DnsRecord(val type: String, val name: String, val content: String, val proxied: Boolean)

data class Analytics(
    val name: String, val status: String?, val plan: String?, val mock: Boolean,
    val requests: Double, val visitors: Double, val pageviews: Double, val cachedPct: Double, val bytes: Double, val uptimePct: Double,
    val sslExpires: String?, val renews: String?,
    val series: List<Point>, val liveVisitors: Double, val liveRequests: Double, val liveMb: Double, val liveSpark: List<Double>,
    val countries: List<Country>, val devices: List<Named>, val browsers: List<Named>,
    val status2xx: Double, val status3xx: Double, val status4xx: Double, val status5xx: Double,
    val ttfbP50: Double, val ttfbP95: Double, val originMs: Double, val errorPct: Double, val http: List<Named>, val tls: List<Named>,
    val threatsTotal: Double, val threatTypes: List<Named>, val events: List<ThreatEvent>,
    val sslMode: String?, val alwaysHttps: Boolean?, val minTls: String?, val dnssec: Boolean?, val botFight: Boolean?, val certExpires: String?,
    val topPages: List<Named>, val referrers: List<Named>, val uptime90: List<Double>, val dns: List<DnsRecord>,
    val registrar: String? = null, val nameServers: List<String> = emptyList(), val source: String? = null,
)

/* ---------- Domene-pillen ---------- */

data class DomSum24(val visitsToday: Long, val domains: Int, val status: String)
