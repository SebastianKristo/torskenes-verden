package no.kristo.finanshub.repository

import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import no.kristo.finanshub.Analytics
import no.kristo.finanshub.Api
import no.kristo.finanshub.DomainRef
import no.kristo.finanshub.MapCountry
import no.kristo.finanshub.WORLD_ATLAS
import no.kristo.finanshub.parseAnalytics
import no.kristo.finanshub.parseDomains
import org.json.JSONObject

/**
 * Domener mot serveren (/domains/api): liste, analyse, legg til, fjern og verdenskartet. Ingen tilstand her; den ligger i
 * DomenerViewModel. Nettet går på IO (Api), og JSON tolkes på Default, aldri på hovedtråden.
 *
 * [api] gir klienten for kontoen som er aktiv nå (adresse og token kan endre seg mens appen kjører).
 */
class DomenerRepository(private val api: () -> Api) {

    private fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")

    suspend fun domener(): List<DomainRef> {
        val raw = api().domGet("/domains")
        return withContext(Dispatchers.Default) { parseDomains(raw) }
    }

    suspend fun analyse(navn: String, periode: String): Analytics {
        val raw = api().domGet("/" + enc(navn) + "/analytics?range=" + enc(periode))
        return withContext(Dispatchers.Default) { parseAnalytics(raw) }
    }

    suspend fun leggTil(navn: String, kilde: String) {
        api().domPost("/domains", JSONObject().put("name", navn).put("source", kilde))
    }

    suspend fun fjern(id: String) {
        api().domDelete("/domains/" + enc(id))
    }

    /** Landene til kartet: fra serveren, ellers world-atlas på jsDelivr (som før). Tom liste når ingen av dem svarer. */
    suspend fun verdenskart(): List<MapCountry> {
        val lokal = tolkKart(runCatching { api().bytes("/domains/api/vendor/countries-110m.json") }.getOrNull())
        if (lokal.isNotEmpty()) return lokal
        return tolkKart(runCatching { withContext(Dispatchers.IO) { URL(WORLD_ATLAS).openStream().use { it.readBytes() } } }.getOrNull())
    }

    private suspend fun tolkKart(b: ByteArray?): List<MapCountry> =
        if (b == null) emptyList() else withContext(Dispatchers.Default) { MapCountry.parse(String(b)) }
}
