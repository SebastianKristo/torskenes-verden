package no.kristo.finanshub.repository

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import no.kristo.finanshub.Api
import no.kristo.finanshub.Shipment
import no.kristo.finanshub.TrackingData
import no.kristo.finanshub.optStr
import no.kristo.finanshub.parseShipment
import no.kristo.finanshub.parseTracking
import org.json.JSONArray
import org.json.JSONObject

/** Svaret på «Spor ny sending»: id-en til sendingen (åpnes) og serverens melding. */
class NySending(val id: String?, val melding: String?)

/**
 * Sporing mot serveren (/api/tracking): sendingene, arkivet, ny sending, varselvalg, kilder og massehandlinger. Ingen
 * tilstand her; den ligger i SporingViewModel. Nettet går på IO (Api), og JSON tolkes på Default, aldri på hovedtråden.
 *
 * [api] gir klienten for kontoen som er aktiv nå (adresse og token kan endre seg mens appen kjører).
 */
class SporingRepository(private val api: () -> Api) {

    suspend fun sendinger(timeout: Int = 10_000): TrackingData {
        val raw: String = api().hlGet("/tracking", timeout = timeout)
        return withContext(Dispatchers.Default) { parseTracking(raw) }
    }

    /** Arkiverte sendinger (GET /api/tracking?archived=1). */
    suspend fun arkiv(): List<Shipment> {
        val raw: String = api().hlGet("/tracking?archived=1", timeout = 15_000)
        return withContext(Dispatchers.Default) { parseTracking(raw).items.filter { it.archived } }
    }

    suspend fun leggTil(nummer: String, navn: String?, transportor: String?, ut: Boolean): NySending {
        val body = JSONObject().put("trackingNo", nummer).put("direction", if (ut) "out" else "in")
        if (navn != null) body.put("name", navn)
        if (transportor != null) body.put("carrier", transportor)
        val raw: String = api().request("POST", "/tracking", body, prefix = Api.HOMELAB, timeout = 30_000)
        return withContext(Dispatchers.Default) {
            val o = JSONObject(raw)
            NySending(o.optJSONObject("item")?.let { parseShipment(it).id }, o.optStr("message"))
        }
    }

    suspend fun settVarsel(navn: String, verdi: Boolean) {
        api().hlPut("/tracking/prefs", JSONObject().put(navn, verdi))
    }

    /** finn | email | autoArchive */
    suspend fun settKilde(navn: String, verdi: Boolean) {
        api().hlPut("/tracking/sources", JSONObject().put(navn, verdi))
    }

    /** archive | unarchive | delete */
    suspend fun masse(ids: List<String>, handling: String) {
        api().hlPost("/tracking/bulk", JSONObject().put("ids", JSONArray(ids)).put("action", handling))
    }

    /** Ber serveren sjekke status hos fraktselskapene nå. */
    suspend fun sjekkHosFrakt() {
        api().request("POST", "/tracking/refresh", JSONObject(), prefix = Api.HOMELAB, timeout = 30_000)
    }
}
