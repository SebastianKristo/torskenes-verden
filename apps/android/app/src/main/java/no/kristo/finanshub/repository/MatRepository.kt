package no.kristo.finanshub.repository

import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import no.kristo.finanshub.Api
import no.kristo.finanshub.MatFolder
import no.kristo.finanshub.RecipeJob
import no.kristo.finanshub.RecipePreview
import no.kristo.finanshub.Week
import no.kristo.finanshub.parseMatFolders
import no.kristo.finanshub.parseRecipeJobs
import no.kristo.finanshub.parseRecipePreview
import no.kristo.finanshub.parseWeek
import org.json.JSONObject

/** Uka fra GET /mat/api/week: tolket, mappene (ligger i samme svar) og rå-svaret (til «Endret av …», mealNote36). */
class MatUke(val uke: Week, val mapper: List<MatFolder>, val raw: String)

/**
 * Mat mot serveren (/mat/api): uka og handlelisten, planlegging, mapper, oppskrifter (import og skann), lenker og filer
 * på rettene. Ingen tilstand her; den ligger i MatViewModel. Nettet går på IO (Api), og JSON tolkes på Default, aldri på
 * hovedtråden.
 *
 * [api] gir klienten for kontoen som er aktiv nå (adresse og token kan endre seg mens appen kjører).
 */
class MatRepository(private val api: () -> Api) {

    private fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")

    /** Q19: mappene kommer alltid med i /week (Homelab 5.0); ingen ekstra kall til /folders for eldre servere. */
    suspend fun uke(): MatUke {
        val raw: String = api().matGet("/week")
        return withContext(Dispatchers.Default) {
            val mapper: List<MatFolder> = JSONObject(raw).optJSONArray("folders")?.let { parseMatFolders(it.toString()) } ?: emptyList()
            MatUke(parseWeek(raw), mapper, raw)
        }
    }

    suspend fun jobber(): List<RecipeJob> {
        val raw: String = api().matGet("/recipes/jobs")
        return withContext(Dispatchers.Default) { parseRecipeJobs(raw) }
    }

    suspend fun mapper(): List<MatFolder> {
        val raw: String = api().matGet("/folders")
        return withContext(Dispatchers.Default) { parseMatFolders(raw) }
    }

    /** Ny plan for uka, eller for én dag ([dato] = YYYY-MM-DD). */
    suspend fun planlegg(dato: String?) {
        val body = if (dato == null) JSONObject().put("scope", "week") else JSONObject().put("scope", "day").put("date", dato)
        api().matPost("/plan", body)
    }

    suspend fun settKokk(dato: String, kokk: String) {
        api().matPatch("/day/$dato", JSONObject().put("cook", kokk))
    }

    suspend fun settFast(dato: String, fast: Boolean) {
        api().matPatch("/day/$dato", JSONObject().put("fixed", fast))
    }

    suspend fun vekslHandel(id: String) {
        api().matPost("/shopping/$id/toggle")
    }

    suspend fun leggIHandlelisten(tekst: String, ukestart: String?) {
        val body = JSONObject().put("text", tekst)
        if (ukestart != null) body.put("start", ukestart)
        api().matPost("/shopping", body)
    }

    suspend fun importerOppskrift(adresse: String): RecipePreview {
        val raw: String = api().request("POST", "/recipes/import", JSONObject().put("url", adresse), prefix = Api.MAT, read = 90_000)
        return withContext(Dispatchers.Default) { parseRecipePreview(raw) }
    }

    suspend fun lagreOppskrift(forhandsvisning: RecipePreview, mappe: String?) {
        api().matPost("/recipes/import/save", JSONObject().put("preview", JSONObject(forhandsvisning.raw)).put("folderId", mappe ?: JSONObject.NULL))
    }

    /** Skann oppskrift: én fil (bilde eller PDF) leses i bakgrunnen på serveren. */
    suspend fun skannOppskrift(del: Api.Part) {
        api().upload("/recipes/scan", listOf(del), prefix = Api.MAT)
    }

    suspend fun provJobbIgjen(id: String) {
        api().matPost("/recipes/jobs/" + enc(id) + "/retry")
    }

    suspend fun fjernJobb(id: String) {
        api().request("DELETE", "/recipes/jobs/" + enc(id), prefix = Api.MAT)
    }

    suspend fun nyMappe(navn: String) {
        api().matPost("/folders", JSONObject().put("name", navn))
    }

    suspend fun endreMappe(id: String, navn: String) {
        api().matPatch("/folders/" + enc(id), JSONObject().put("name", navn))
    }

    suspend fun slettMappe(id: String) {
        api().request("DELETE", "/folders/" + enc(id), prefix = Api.MAT)
    }

    suspend fun settRettensMappe(rett: String, mappe: String?) {
        api().matPatch("/dishes/" + enc(rett), JSONObject().put("folderId", mappe ?: JSONObject.NULL))
    }

    suspend fun leggTilLenke(rett: String, tittel: String, adresse: String) {
        api().matPost("/dishes/" + enc(rett) + "/links", JSONObject().put("title", tittel).put("url", adresse))
    }

    suspend fun lastOppFil(rett: String, deler: List<Api.Part>) {
        api().upload("/dishes/" + enc(rett) + "/links", deler, prefix = Api.MAT)
    }

    suspend fun fjernLenke(rett: String, lenke: String) {
        api().request("DELETE", "/dishes/" + enc(rett) + "/links/" + enc(lenke), prefix = Api.MAT)
    }

    /** En lagret fil på en rett (krever token). */
    suspend fun fil(sti: String): ByteArray = api().bytes(if (sti.startsWith("/")) sti else "/mat/api/$sti")
}
