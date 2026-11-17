package no.kristo.finanshub.repository

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import no.kristo.finanshub.Api
import no.kristo.finanshub.Stocks
import no.kristo.finanshub.StocksX
import no.kristo.finanshub.parseStocks
import no.kristo.finanshub.parseStocksX

/** Svaret fra /finans/api/stocks: oversikten (null når den ikke kunne leses) og detaljene på Aksjer-siden. */
class AksjerSvar(val oversikt: Stocks?, val detaljer: StocksX)

/**
 * Aksjer mot serveren (/finans/api/stocks, Trading 212): porteføljen og synk nå. Ingen tilstand her; den ligger i
 * AksjerViewModel. Nettet går på IO (Api), og JSON tolkes på Default, aldri på hovedtråden.
 *
 * [api] gir klienten for kontoen som er aktiv nå (adresse og token kan endre seg mens appen kjører).
 */
class AksjerRepository(private val api: () -> Api) {

    private suspend fun tolk(raw: String): AksjerSvar = withContext(Dispatchers.Default) {
        AksjerSvar(runCatching { parseStocks(raw) }.getOrNull(), parseStocksX(raw))
    }

    suspend fun portefolje(): AksjerSvar {
        val raw: String = api().get("/stocks")
        return tolk(raw)
    }

    /** Bare oversikten (flisa i Mer og Papir). */
    suspend fun oversikt(): Stocks {
        val raw: String = api().get("/stocks")
        return withContext(Dispatchers.Default) { parseStocks(raw) }
    }

    /** Ber serveren hente fra Trading 212 nå. */
    suspend fun synk(): AksjerSvar {
        val raw: String = api().post("/stocks/sync")
        return tolk(raw)
    }
}
