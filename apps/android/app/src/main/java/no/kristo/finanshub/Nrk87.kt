package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 87 (NRKAND), CONTRACT87.md og prompt-54-pakke/claude-code-media-nrk-nedlaster.md (fasit Media NRK.dc.html):
 * NRK-fanen i Media. All trafikk går til Homelab-serveren (`/api/media/nrk/…`), som er proxy for nrk-dl.
 * Appen får aldri adressen eller tokenet til nrk-dl. Alle kall går via Api (og dermed http-regelen open86()).
 *
 *  - Last ned fra NRK (lenkefelt med «Lim inn», Type, Kvalitet, Følg serien, Komprimer, VPN-merke)
 *  - Køen (2 s mens noe er i kø eller lastes ned, ellers 10 s – styres fra ui/Nrk87Ui.kt og stopper når fanen ikke vises)
 *  - Serier du følger
 *  - Bibliotek (plakater → detalj med sesonger og episoder). Mangler bibliotek-endepunktene i nrk-dl, sier serveren
 *    `tilgjengelig:false`, og kortet viser «Biblioteket krever en nyere versjon av nrk-dl.»
 *
 * Lesingen er romslig: felt som mangler gir tomme verdier, aldri krasj. De rene reglene ligger i NrkRegel87.kt.
 */

data class NrkKomp87(val standard: Boolean, val crf: String?, val preset: String?)
data class NrkStatus87(val vpnOk: Boolean, val ip: String?, val land: String?, val komp: NrkKomp87?, val bibliotek: Boolean?)
data class NrkJobb87(
    val id: String, val url: String, val type: String, val kvalitet: String?, val status: String, val tittel: String, val melding: String?,
    val prosent: Double?, val fart: Double?, val eta: Long?, val nr: Int?, val av: Int?, val filer: List<String>, val spart: Long?,
)
data class NrkFolg87(val id: String, val url: String, val type: String?, val kvalitet: String?, val tittel: String, val sjekket: Long?, val siste: String?)
data class NrkEp87(val nr: Int, val tittel: String, val varighet: String?, val url: String?, val fil: String?, val status: String)
data class NrkSesong87(val nr: Int, val episoder: List<NrkEp87>)
data class NrkElem87(
    val id: String, val tittel: String, val type: String, val url: String, val bilde: String?, val meta: String?, val beskrivelse: String?,
    val sesonger: List<NrkSesong87>,
) {
    val antall: Int get() = sesonger.sumOf { it.episoder.size }
    val lastet: Int get() = sesonger.sumOf { s -> s.episoder.count { it.status == "lastet" } }
}

class Nrk87State {
    /** null = ikke hentet ennå, false = ikke satt opp på serveren (tomtilstand). */
    var configured by mutableStateOf<Boolean?>(null)
    var message by mutableStateOf<String?>(null)
    /** Serveren har ikke /api/media/nrk ennå (eldre Homelab). */
    var gammel by mutableStateOf(false)
    var status by mutableStateOf<NrkStatus87?>(null)
    var jobber by mutableStateOf<List<NrkJobb87>?>(null)
    var folger by mutableStateOf<List<NrkFolg87>>(emptyList())

    /* Skjemaet. Ligger her (ikke i skjermen), så feltet beholder teksten når Media tegnes på nytt eller fanen byttes. */
    var url by mutableStateOf("")
    var type by mutableStateOf("auto")
    var kval by mutableStateOf("best")
    var folg by mutableStateOf(false)
    /** null = brukeren har ikke rørt avkrysningsboksen (serverens standard gjelder, og feltet sendes ikke). */
    var komp by mutableStateOf<Boolean?>(null)
    var err by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)

    var filerOpen by mutableStateOf<Set<String>>(emptySet())
    var sjekker by mutableStateOf<String?>(null)

    /* Bibliotek */
    var lib by mutableStateOf<List<NrkElem87>?>(null)
    /** false = nrk-dl mangler bibliotek-endepunktene. */
    var libOk by mutableStateOf<Boolean?>(null)
    var libFilter by mutableStateOf("alle")
    var valgt by mutableStateOf<NrkElem87?>(null)
    var sesong by mutableStateOf<Map<String, Int>>(emptyMap())
    var detBusy by mutableStateOf(false)

    internal var henter = false
    internal var statusAt = 0L
    internal var ferdige: Set<String> = emptySet()

    /** Kontobytte/utlogging: ingenting fra forrige bruker blir stående (heller ikke lenken i feltet). */
    fun reset() {
        configured = null; message = null; gammel = false; status = null; jobber = null; folger = emptyList()
        url = ""; type = "auto"; kval = "best"; folg = false; komp = null; err = null; busy = false
        filerOpen = emptySet(); sjekker = null; lib = null; libOk = null; libFilter = "alle"; valgt = null; sesong = emptyMap(); detBusy = false
        henter = false; statusAt = 0L; ferdige = emptySet()
    }
}

/* ======================= JSON (romslig) ======================= */

private fun JSONObject.txt87(k: String): String? = if (!has(k) || isNull(k)) null else opt(k)?.toString()?.takeIf { it.isNotBlank() && it != "null" }
private fun JSONObject.num87(k: String): Double? {
    if (!has(k) || isNull(k)) return null
    val v = opt(k)
    return when (v) { is Number -> v.toDouble().takeIf { !it.isNaN() && !it.isInfinite() }; is String -> v.trim().replace(',', '.').toDoubleOrNull(); else -> null }
}
private fun JSONObject.bool87(k: String): Boolean? = if (!has(k) || isNull(k)) null else when (val v = opt(k)) { is Boolean -> v; is Number -> v.toInt() != 0; is String -> v == "true"; else -> null }
private fun objs87(a: JSONArray?): List<JSONObject> = if (a == null) emptyList() else (0 until a.length()).mapNotNull { a.optJSONObject(it) }
private fun strs87(a: JSONArray?): List<String> = if (a == null) emptyList() else (0 until a.length()).mapNotNull { i -> a.opt(i)?.takeIf { it is String }?.toString()?.takeIf { it.isNotBlank() } }

internal fun parseNrkStatus87(o: JSONObject): NrkStatus87 {
    val v = o.optJSONObject("vpn")
    val k = o.optJSONObject("komprimer")
    return NrkStatus87(
        v?.bool87("ok") == true, v?.txt87("ip"), v?.txt87("land"),
        k?.let { NrkKomp87(it.bool87("standard") == true, it.txt87("crf")?.removeSuffix(".0"), it.txt87("preset")) },
        o.bool87("bibliotek"),
    )
}

internal fun parseNrkJobb87(o: JSONObject): NrkJobb87? {
    val id = o.txt87("id") ?: return null
    val url = o.txt87("url").orEmpty()
    return NrkJobb87(
        id, url, o.txt87("type") ?: "auto", o.txt87("kvalitet"), o.txt87("status") ?: "ko", o.txt87("tittel") ?: url.ifBlank { "NRK" }, o.txt87("melding"),
        o.num87("prosent")?.coerceIn(0.0, 100.0), o.num87("fart"), o.num87("eta")?.toLong(), o.num87("nr")?.toInt(), o.num87("av")?.toInt()?.takeIf { it > 0 },
        strs87(o.optJSONArray("filer")), o.num87("spart")?.toLong(),
    )
}

internal fun parseNrkFolg87(o: JSONObject): NrkFolg87? {
    val id = o.txt87("id") ?: return null
    val url = o.txt87("url").orEmpty()
    return NrkFolg87(id, url, o.txt87("type"), o.txt87("kvalitet"), o.txt87("tittel") ?: url.ifBlank { "NRK" }, o.num87("sjekket")?.toLong(), o.txt87("siste"))
}

/** Varighet: serveren sender `varighetTekst` («42 min») ved siden av sekundene. Uten den tåles både tekst og sekunder i `varighet`. */
private fun varighet87(o: JSONObject): String? {
    o.txt87("varighetTekst")?.let { return it }
    val n = o.opt("varighet")
    if (n is Number) { val s = n.toLong(); return if (s <= 0L) null else if (s >= 3600L) "${s / 3600L} t ${(s % 3600L) / 60L} min" else "${Math.max(1L, s / 60L)} min" }
    return o.txt87("varighet")
}

internal fun parseNrkElem87(o: JSONObject): NrkElem87? {
    val url = o.txt87("url").orEmpty()
    val id = o.txt87("id") ?: url.ifBlank { return null }
    val type = when (o.txt87("type")) { "film" -> "film"; "radio" -> "radio"; else -> "tv" }
    val ses = objs87(o.optJSONArray("sesonger")).mapIndexed { i, s ->
        NrkSesong87(s.num87("nr")?.toInt() ?: (i + 1), objs87(s.optJSONArray("episoder")).mapIndexed { j, e ->
            val fil = e.txt87("fil")
            val st = when (e.txt87("status")) { "lastet" -> "lastet"; "laster" -> "laster"; "ko" -> "ko"; "mangler" -> "mangler"; else -> if (fil != null) "lastet" else "mangler" }
            NrkEp87(e.num87("nr")?.toInt() ?: (j + 1), e.txt87("tittel") ?: "Episode ${j + 1}", varighet87(e), e.txt87("url"), fil, st)
        })
    }.filter { it.episoder.isNotEmpty() }
    return NrkElem87(id, o.txt87("tittel") ?: "Uten tittel", type, url,
        // Bare bilder fra vår egen bildeproxy (relativ sti) – appen henter aldri bilder fra en adresse serveren ikke står for.
        o.txt87("bilde")?.takeIf { it.startsWith("/") && !it.startsWith("//") }, o.txt87("meta"), o.txt87("beskrivelse"), ses)
}

/* ======================= Kall ======================= */

/**
 * Feiltekst: serveren svarer med norsk tekst også ved 502 («NRK-nedlasteren avviste tokenet …», «Får ikke kontakt med NRK-nedlasteren»),
 * så den vises som den er. Bare innlogging/tilgang (401/403) går gjennom Media sin felles sjekk.
 */
private fun AppViewModel.err87(e: ApiException): String {
    val m = e.message.orEmpty().trim()
    return when {
        m.startsWith(Api.TOKEN_REFUSED) || e.status == 401 || e.status == 403 -> mediaErr44(e)
        e.status == 404 -> "NRK-nedlasteren krever en nyere versjon av Homelab-serveren."
        m.isEmpty() || m.startsWith("Feil ") -> "Fikk ikke kontakt med NRK-nedlasteren"
        else -> m
    }
}

private fun AppViewModel.run87(onErr: ((String) -> Unit)? = null, block: suspend () -> Unit) = launch43 {
    try { block() } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        val m = err87(e)
        if (onErr != null) onErr(m) else p43.error = m
    } catch (e: Exception) {
        val m = uiErr73(e, "Fikk ikke kontakt med NRK-nedlasteren")
        if (onErr != null) onErr(m) else p43.error = m
    }
}

/** GET mot /api/media/nrk. 404 = serveren har ikke NRK-rutene ennå (eldre Homelab) – vises som egen melding, ikke som feil. */
private suspend fun AppViewModel.get87(path: String, timeout: Int = 15_000): JSONObject? = try {
    val raw = api43 { hlGet("/media/nrk$path", timeout = timeout) }
    nrk87.gammel = false
    runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject()
} catch (e: ApiException) {
    if (e.status == 404) { nrk87.gammel = true; null } else throw e
}

/** Åpner fanen: status, kø og bibliotek. */
fun AppViewModel.loadNrk87() {
    loadNrkStatus87()
    loadNrkKo87()
    if (nrk87.lib == null) loadNrkLib87()
}

fun AppViewModel.loadNrkStatus87() = run87 {
    val n = nrk87
    n.statusAt = System.currentTimeMillis()
    val o = get87("/status") ?: return@run87
    if (o.optBoolean("configured", true)) { n.configured = true; n.message = null; n.status = parseNrkStatus87(o) }
    else { n.configured = false; n.message = o.optString("message").takeIf { it.isNotBlank() }; n.status = null }
}

/** Køen og seriene som følges. Ett kall om gangen – et tregt svar skal ikke hope opp kall hvert 2. sekund. */
fun AppViewModel.loadNrkKo87() {
    val n = nrk87
    if (n.henter) return
    n.henter = true
    launch43 {
        try {
            val o = get87("/jobber") ?: return@launch43
            if (!o.optBoolean("configured", true)) { n.configured = false; n.jobber = emptyList(); n.folger = emptyList(); return@launch43 }
            n.configured = true
            val jobber = objs87(o.optJSONArray("jobber")).mapNotNull { parseNrkJobb87(it) }
            n.jobber = jobber
            n.folger = objs87(o.optJSONArray("folger")).mapNotNull { parseNrkFolg87(it) }
            // En jobb som ble ferdig, har lagt nye filer i biblioteket.
            val ferdige = jobber.filter { it.status == "ferdig" }.map { it.id }.toSet()
            val nye = !n.ferdige.containsAll(ferdige)
            val forste = n.ferdige.isEmpty() && n.lib == null
            n.ferdige = ferdige
            if (nye && !forste) loadNrkLib87()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) { p43.error = err87(e) } catch (e: Exception) {
            p43.error = uiErr73(e, "Fikk ikke kontakt med NRK-nedlasteren")
        } finally { n.henter = false }
    }
}

/** Ett rundt i oppdateringen (kalles fra skjermen mens fanen vises): køen hver gang, status høyst hvert 10. sekund. */
fun AppViewModel.tickNrk87() {
    loadNrkKo87()
    if (System.currentTimeMillis() - nrk87.statusAt >= 10_000L) loadNrkStatus87()
}

fun AppViewModel.loadNrkLib87() = run87 {
    val n = nrk87
    val o = get87("/bibliotek", timeout = 30_000) ?: return@run87
    if (!o.optBoolean("configured", true)) { n.libOk = null; n.lib = emptyList(); return@run87 }
    if (o.has("tilgjengelig") && !o.optBoolean("tilgjengelig", true)) { n.libOk = false; n.lib = emptyList(); n.valgt = null; return@run87 }
    val list = objs87(o.optJSONArray("elementer")).mapNotNull { parseNrkElem87(it) }.distinctBy { it.id } // like id-er ville krasjet lista (nøkler)
    n.libOk = true
    n.lib = list
    // Åpen detalj følger med når biblioteket oppdateres (status på episodene) – men episodene fra /serie beholdes til de hentes på nytt.
    n.valgt?.let { v -> if (list.any { it.id == v.id }) loadNrkSerie87(v, stille = true) }
}

/** Trykk på en plakat: vis det biblioteket har med en gang, og hent hele serien (også episoder som mangler). */
fun AppViewModel.openNrkElem87(e: NrkElem87) {
    nrk87.valgt = e
    Haptics.select()
    loadNrkSerie87(e, stille = false)
}

private fun AppViewModel.loadNrkSerie87(e: NrkElem87, stille: Boolean) {
    val n = nrk87
    if (e.url.isBlank()) return
    if (!stille) n.detBusy = true
    // Feil her er ikke farlig: detaljen viser fortsatt det biblioteket har.
    run87({ n.detBusy = false }) {
        try {
            val o = get87("/serie?url=" + URLEncoder.encode(e.url, "UTF-8"), timeout = 30_000) ?: return@run87
            if (o.has("tilgjengelig") && !o.optBoolean("tilgjengelig", true)) return@run87
            val full = parseNrkElem87(o.optJSONObject("element") ?: o) ?: return@run87
            if (n.valgt?.id == e.id && full.sesonger.isNotEmpty()) n.valgt = full.copy(id = e.id, bilde = full.bilde ?: e.bilde, meta = full.meta ?: e.meta, beskrivelse = full.beskrivelse ?: e.beskrivelse)
        } finally { n.detBusy = false }
    }
}

private fun valg87(n: Nrk87State, url: String, type: String): JSONObject = JSONObject().put("url", url).put("type", type).put("kvalitet", n.kval)

/** «Komprimer» sendes bare når brukeren har endret den fra serverens standard. */
private fun JSONObject.komp87(n: Nrk87State): JSONObject {
    val std = n.status?.komp?.standard ?: return this
    val k = n.komp ?: return this
    return if (k != std) put("komprimer", k) else this
}

/** «Last ned» i kort 1. Eneste sted en lenke blir til en jobb – en delt lenke fyller bare ut feltet (prompt 86). */
fun AppViewModel.addNrk87() {
    val n = nrk87
    if (n.busy) return
    val u = nrkLenke87(n.url)
    if (u == null) { n.err = "Bare lenker fra nrk.no og nrksuper.no."; Haptics.error(); return }
    n.busy = true; n.err = null
    launch43 {
        try {
            api43 { hlPost("/media/nrk/jobber", valg87(n, u, n.type).put("folg", n.folg).komp87(n)) }
            n.url = ""; n.err = null
            Haptics.success()
            p43.toast = if (n.folg) "Lagt i køen · følger serien" else "Lagt i køen"
            loadNrkKo87()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            n.err = if (e.status == 409) "Lenken ligger allerede i køen." else err87(e)
            Haptics.error()
        } catch (e: Exception) { n.err = uiErr73(e, "Fikk ikke kontakt med NRK-nedlasteren"); Haptics.error() } finally { n.busy = false }
    }
}

/** Avbryt · Prøv igjen / Se etter nye (igjen) · Fjern. */
fun AppViewModel.nrkJobb87(id: String, handling: String) = run87 {
    when (handling) {
        "avbryt" -> api43 { hlPost("/media/nrk/jobber/$id/avbryt") }
        "igjen", "nye" -> api43 { hlPost("/media/nrk/jobber/$id/igjen") }
        "fjern" -> api43 { hlDelete("/media/nrk/jobber/$id") }
        else -> return@run87
    }
    Haptics.select()
    loadNrkKo87()
}

fun AppViewModel.nrkRydd87() = run87 {
    api43 { hlPost("/media/nrk/rydd") }
    loadNrkKo87()
}

fun AppViewModel.nrkSjekk87(id: String) {
    val n = nrk87
    if (n.sjekker != null) return
    n.sjekker = id
    run87 {
        try { api43 { hlPost("/media/nrk/folger/$id/sjekk") } } finally { n.sjekker = null }
        loadNrkKo87()
    }
}

fun AppViewModel.nrkSluttFolg87(id: String) = run87 {
    api43 { hlDelete("/media/nrk/folger/$id") }
    p43.toast = "Følger ikke lenger"
    loadNrkKo87()
}

/**
 * Bibliotek: last ned utvalgte episoder ([episoder] = lenkene), eller hele elementet på nytt / se etter nye (tom liste).
 * Episodene merkes «I KØ» med en gang; neste oppdatering av biblioteket gir sann status.
 */
fun AppViewModel.nrkHent87(e: NrkElem87, episoder: List<NrkEp87>, toast: String) = run87 {
    val n = nrk87
    val urls = episoder.mapNotNull { it.url?.let(::nrkLenke87) }.distinct().take(200)
    val body = valg87(n, e.url, e.type).put("folg", false).komp87(n)
    if (urls.isNotEmpty()) body.put("episoder", JSONArray(urls))
    try { api43 { hlPost("/media/nrk/jobber", body) } } catch (x: ApiException) {
        if (x.status == 409) { p43.toast = "Ligger allerede i køen"; return@run87 }
        throw x
    }
    Haptics.success()
    p43.toast = toast
    if (episoder.isNotEmpty()) {
        val merk = episoder.toSet()
        n.valgt?.takeIf { it.id == e.id }?.let { v ->
            n.valgt = v.copy(sesonger = v.sesonger.map { s -> s.copy(episoder = s.episoder.map { if (it in merk && it.status == "mangler") it.copy(status = "ko") else it }) })
        }
    }
    loadNrkKo87()
}

/** Del → Homelab med en NRK-lenke: åpner Media → NRK med lenken i feltet. Ingenting lastes ned før brukeren trykker «Last ned». */
fun AppViewModel.shareNrk87(url: String) {
    val n = nrk87
    n.url = url
    n.err = null
    n.valgt = null
    p43.tab = "nrk"
    p43.detail = null; p43.relFor = null
    openMedia43()
}
