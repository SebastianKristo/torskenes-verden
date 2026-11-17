package no.kristo.finanshub.repository

import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import no.kristo.finanshub.Api
import no.kristo.finanshub.WeatherFull
import no.kristo.finanshub.WxCmp22
import no.kristo.finanshub.WxCompare
import no.kristo.finanshub.WxPlace
import no.kristo.finanshub.parseWeatherFull
import no.kristo.finanshub.parseWxCmp22
import no.kristo.finanshub.parseWxCompare
import no.kristo.finanshub.parseWxPlaces
import no.kristo.finanshub.parseWxSearch28
import org.json.JSONArray
import org.json.JSONObject

/** Svaret fra GET /api/weather/full: været, og «Yr og Pent» når serveren hadde det med (compare). */
class VaerSvar(val full: WeatherFull, val pent: WxCmp22?)

/**
 * Vær mot serveren (/api/weather): været for et sted, egne steder (liste, søk, legg til, fjern, rekkefølge) og
 * sammenligningene. Ingen tilstand her; den ligger i VaerViewModel. Nettet går på IO (Api), og JSON tolkes på Default,
 * aldri på hovedtråden. «Min posisjon», skiføret og bakgrunnsbildet ligger fortsatt i domene/Vaer.kt.
 *
 * [api] gir klienten for kontoen som er aktiv nå (adresse og token kan endre seg mens appen kjører).
 */
class VaerRepository(private val api: () -> Api) {

    private fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")

    /** «geo:lat,lon,navn» (midlertidig sted fra AI-søket eller Min posisjon) gir lat/lon/name, ellers place=<id>. */
    private fun stedQuery(sted: String): String =
        if (sted.startsWith("geo:")) sted.removePrefix("geo:").split(',', limit = 3).let { g ->
            "lat=" + g.getOrElse(0) { "" } + "&lon=" + g.getOrElse(1) { "" } + "&name=" + enc(g.getOrElse(2) { "" })
        } else "place=" + enc(sted)

    suspend fun full(sted: String): VaerSvar {
        val raw: String = api().hlGet("/weather/full?" + stedQuery(sted), timeout = 15_000)
        return withContext(Dispatchers.Default) {
            val full: WeatherFull = parseWeatherFull(raw)
            val pent: WxCmp22? = runCatching { parseWxCmp22(JSONObject(raw).optJSONObject("compare")) }.getOrNull()
            VaerSvar(full, pent)
        }
    }

    /** «Yr og Pent» for seg (GET /api/weather/compare) når /weather/full ikke hadde noe å vise. */
    suspend fun pent(sted: String): WxCmp22? {
        val raw: String = api().hlGet("/weather/compare?" + stedQuery(sted), timeout = 15_000)
        return withContext(Dispatchers.Default) { parseWxCmp22(JSONObject(raw)) }
    }

    /** «Sammenlign Yr og Storm» (Yr fra MET mot ECMWF). */
    suspend fun sammenligning(sted: String): WxCompare {
        val raw: String = api().hlGet("/weather/compare?place=" + enc(sted), timeout = 15_000)
        return withContext(Dispatchers.Default) { parseWxCompare(raw) }
    }

    /** Brukerens lagrede steder. */
    suspend fun steder(): List<WxPlace> {
        val raw: String = api().hlGet("/weather/places")
        return withContext(Dispatchers.Default) { parseWxPlaces(raw) }
    }

    /** Stedssøk (GET /api/weather/places?q=). null når svaret ikke er et søkesvar. */
    suspend fun sok(q: String): List<WxPlace>? {
        val raw: String = api().hlGet("/weather/places?q=" + enc(q), timeout = 15_000)
        return withContext(Dispatchers.Default) { parseWxSearch28(raw) }
    }

    suspend fun leggTil(p: WxPlace) {
        val body = JSONObject().put("name", p.name).put("lat", p.lat).put("lon", p.lon).put("region", p.region)
        api().hlPost("/weather/places", body)
    }

    suspend fun fjern(id: String) {
        api().hlDelete("/weather/places/" + enc(id))
    }

    suspend fun settRekkefolge(ids: List<String>) {
        api().hlPut("/weather/places/order", JSONObject().put("ids", JSONArray(ids)))
    }
}
