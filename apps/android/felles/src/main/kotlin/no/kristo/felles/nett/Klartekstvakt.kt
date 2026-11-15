package no.kristo.felles.nett

import java.net.InetAddress
import java.net.UnknownHostException

/**
 * S3 (D-android §8): «lokalt» avgjøres ikke bare av vertsnavnet når appen sender klartekst.
 *
 * [LokaltNett] klassifiserer adressen uten DNS (fasit: shared/testvektorer/serveradresse.json), så http://nas.lan regnes som
 * lokal. Men navnet kan svare hvor som helst: på et offentlig nett med falsk DNS ville tokenet gått i klartekst til en
 * fremmed maskin. Før en http-/ws-forbindelse til et *navn* åpnes, slås navnet derfor opp, og alle adressene må være lokale
 * (samme områder som [LokaltNett]). IP-adresser og «localhost» trenger ikke oppslag. https røres ikke.
 *
 * Kjent begrensning: oppslaget og tilkoblingen er to oppslag (DNS-rebinding innenfor cache-tiden). OkHttp-klientene sjekker
 * derfor også adressen de faktisk koblet til ([tillattAdresse]).
 */
object Klartekstvakt {
    /** Navneoppslaget. Kan byttes ut i tester. Kalles fra bakgrunnstråd (som tilkoblingen). */
    @Volatile
    var oppslag: (String) -> List<ByteArray> = { navn -> InetAddress.getAllByName(navn).map { it.address } }

    /** true når klartekst til [vert] er trygt nok: ikke klartekst, en lokal IP, eller et lokalt navn som peker lokalt. */
    fun tillatt(skjema: String?, vert: String?): Boolean {
        val s = skjema?.lowercase()
        if (s != "http" && s != "ws") return true
        if (!LokaltNett.lokalVert(vert)) return false
        if (LokaltNett.erIpAdresse(vert)) return true
        val navn = (vert ?: "").trim().lowercase().trimEnd('.')
        if (navn == "localhost") return true
        val adresser: List<ByteArray> = try {
            oppslag(navn)
        } catch (e: UnknownHostException) {
            // Finnes ikke: tilkoblingen feiler uansett med «Fant ikke serveren», og ingenting sendes.
            return true
        } catch (e: Exception) {
            // Annen feil (f.eks. kalt fra hovedtråden på Android): ikke send klartekst.
            return false
        }
        return adresser.isNotEmpty() && adresser.all { LokaltNett.lokalIp(it) }
    }

    /** OkHttp (nettverksinterceptor): adressen forbindelsen faktisk gikk til. null = ukjent (tillates bare for https). */
    fun tillattAdresse(https: Boolean, adresse: InetAddress?): Boolean = https || (adresse != null && LokaltNett.lokalIp(adresse.address))
}
