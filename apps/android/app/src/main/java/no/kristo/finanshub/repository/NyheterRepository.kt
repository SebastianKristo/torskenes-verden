package no.kristo.finanshub.repository

import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import no.kristo.finanshub.Api
import no.kristo.finanshub.NewsData
import no.kristo.finanshub.parseNews
import org.json.JSONObject

/** Én side med saker fra GET /api/rss: tolket, og rå-svaret (tilleggene i domene/Nyheter.kt leser flere felt fra det). */
class NyheterSvar(val data: NewsData, val raw: String)

/**
 * Nyheter mot serveren (/api/rss): saker per kategori, kilder og innstillinger. Ingen tilstand her; den ligger i
 * NyheterViewModel. Nettet går på IO (Api), og JSON tolkes på Default, aldri på hovedtråden.
 *
 * [api] gir klienten for kontoen som er aktiv nå (adresse og token kan endre seg mens appen kjører).
 */
class NyheterRepository(private val api: () -> Api) {

    private fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")

    suspend fun saker(kategori: String, timeout: Int = 10_000): NyheterSvar {
        val raw: String = api().hlGet("/rss?cat=" + enc(kategori) + "&limit=40", timeout = timeout)
        val data: NewsData = withContext(Dispatchers.Default) { parseNews(raw) }
        return NyheterSvar(data, raw)
    }

    suspend fun leggTilKilde(url: String) {
        api().hlPost("/rss/feeds", JSONObject().put("url", url))
    }

    suspend fun settKildekategori(id: String, kategori: String) {
        api().request("PATCH", "/rss/feeds/" + enc(id), JSONObject().put("category", kategori), prefix = Api.HOMELAB)
    }

    suspend fun fjernKilde(id: String) {
        api().hlDelete("/rss/feeds/" + enc(id))
    }

    suspend fun settInnstilling(navn: String, verdi: Boolean) {
        api().hlPut("/rss/settings", JSONObject().put(navn, verdi))
    }

    /** Henter alle kildene på nytt på serveren (kan ta tid). */
    suspend fun hentKildene() {
        api().request("POST", "/rss/refresh", JSONObject(), prefix = Api.HOMELAB, read = 60_000)
    }
}
