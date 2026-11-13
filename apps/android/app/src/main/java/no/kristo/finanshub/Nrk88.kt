package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 88 (AND88), CONTRACT88APP.md: søk og serieside i NRK-fanen (fasit public/js/media-nrk.js og «Media NRK.dc.html»).
 *  - Kort «NRK»: søk (GET /api/media/nrk/sok?q=) → treff med 16:9-bilde. Film/episode/radio legges i køen først når
 *    brukeren trykker «Last ned». Serie → serieside (GET /serie/:sid og /serie/:sid/sesong/:navn).
 *  - Seriesiden: sesongvelger, episoder med avkrysning, «Velg alle tilgjengelige (N)», «Følg serien» og «Last ned N episoder»
 *    (POST /jobber med episoder = lenkene, én jobb i nrk-dl).
 *  - «Serier du følger» får plakat (bilde fra GET /jobber, alltid vår egen bildeproxy).
 * All trafikk via Api (open86()) til Homelab-serveren. Ingen adresse eller token til nrk-dl i appen.
 */

data class NrkTreff88(val art: String, val id: String?, val tittel: String, val beskrivelse: String?, val bilde: String?, val url: String, val tilgjengelig: Boolean)
data class NrkSes88(val navn: String, val tittel: String?, val tilgjengelig: Boolean)
data class NrkSerie88(
    val id: String, val tittel: String, val beskrivelse: String?, val kategori: String?, val bilde: String?, val url: String,
    val sesonger: List<NrkSes88>, val folger: Boolean,
)
data class NrkSesEp88(
    val id: String, val tittel: String, val dato: String?, val varighet: String?, val bilde: String?,
    val kan: Boolean, val label: String?, val lastetNed: Boolean, val iKo: Boolean, val url: String,
)
/** En serie eller sesong som hentes: [feil] = feiltekst, ellers data (null mens den hentes). */
data class NrkLast88<T>(val data: T?, val feil: String?)

class Nrk88State {
    /* Søket */
    var q by mutableStateOf("")
    var sokQ by mutableStateOf("")
    var treff by mutableStateOf<List<NrkTreff88>?>(null)
    var sokLaster by mutableStateOf(false)
    var sokErr by mutableStateOf<String?>(null)
    /** false = nrk-dl har ikke katalogen (søk og serieside krever nyere nrk-dl). */
    var mulig by mutableStateOf(true)
    internal var sokNr = 0

    /* Seriesiden (serie-id) */
    var ser by mutableStateOf<String?>(null)
    var serTittel by mutableStateOf("")
    var serData by mutableStateOf<Map<String, NrkLast88<NrkSerie88>>>(emptyMap())
    var sesData by mutableStateOf<Map<String, NrkLast88<List<NrkSesEp88>>>>(emptyMap())
    var si by mutableStateOf<Map<String, String>>(emptyMap())
    var pick by mutableStateOf<Set<String>>(emptySet())
    var serr by mutableStateOf<String?>(null)
    var fbusy by mutableStateOf(false)
    var lbusy by mutableStateOf(false)
    /** Lenker som er lagt i køen herfra (lenke → tidspunkt), til køen og NRK sier det samme (høyst 2 min). */
    var opt by mutableStateOf<Map<String, Long>>(emptyMap())

    /** «Har du en lenke?» er åpen (åpnes av deling og når søket ikke finnes). */
    var lenkeApen by mutableStateOf(false)

    fun reset() {
        q = ""; sokQ = ""; treff = null; sokLaster = false; sokErr = null; mulig = true; sokNr++
        ser = null; serTittel = ""; serData = emptyMap(); sesData = emptyMap(); si = emptyMap(); pick = emptySet(); serr = null; fbusy = false; lbusy = false
        opt = emptyMap(); lenkeApen = false
    }
}

/* ======================= JSON (romslig) ======================= */

private fun JSONObject.s88(k: String): String? = if (!has(k) || isNull(k)) null else opt(k)?.toString()?.trim()?.takeIf { it.isNotEmpty() && it != "null" }
private fun JSONObject.b88(k: String): Boolean = when (val v = opt(k)) { is Boolean -> v; is Number -> v.toInt() != 0; is String -> v == "true"; else -> false }
private fun objs88(a: JSONArray?): List<JSONObject> = if (a == null) emptyList() else (0 until a.length()).mapNotNull { a.optJSONObject(it) }
/** Bare bilder fra vår egen bildeproxy (relativ sti). */
internal fun egetBilde88(v: String?): String? = v?.takeIf { it.startsWith("/api/") && !it.startsWith("//") }

internal fun parseTreff88(o: JSONObject): NrkTreff88? {
    val art = o.s88("art")?.takeIf { it in setOf("serie", "film", "episode", "radio") } ?: return null
    val tittel = o.s88("tittel") ?: return null
    val url = o.s88("url")?.let(::nrkLenke87) ?: return null
    return NrkTreff88(art, o.s88("id"), tittel, o.s88("beskrivelse"), egetBilde88(o.s88("bilde")), url, o.opt("tilgjengelig") != false)
}

internal fun parseSerie88(o: JSONObject, sid: String): NrkSerie88 = NrkSerie88(
    o.s88("id") ?: sid, o.s88("tittel") ?: sid, o.s88("beskrivelse"), o.s88("kategori"), egetBilde88(o.s88("bilde")) ?: egetBilde88(o.s88("plakat")),
    o.s88("url")?.let(::nrkLenke87) ?: "https://tv.nrk.no/serie/$sid",
    objs88(o.optJSONArray("sesonger")).mapNotNull { s -> s.s88("navn")?.takeIf(::nrkSesongOk88)?.let { NrkSes88(it, s.s88("tittel"), s.opt("tilgjengelig") != false) } }.distinctBy { it.navn },
    o.b88("folger"),
)

internal fun parseSesEp88(o: JSONObject): NrkSesEp88? {
    val id = o.s88("id")?.uppercase()?.takeIf { Regex("^[A-Z]{4}\\d{8}$").matches(it) } ?: return null
    val url = o.s88("url")?.let(::nrkLenke87) ?: "https://tv.nrk.no/program/$id"
    return NrkSesEp88(id, o.s88("tittel") ?: id, o.s88("dato"), o.s88("varighetTekst"), egetBilde88(o.s88("bilde")), o.b88("kan"), o.s88("label"), o.b88("lastetNed"), o.b88("iKo"), url)
}

/* ======================= Kall ======================= */

private suspend fun AppViewModel.get88(path: String, timeout: Int = 20_000): JSONObject {
    val raw = api43 { hlGet("/media/nrk$path", timeout = timeout) }
    return runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject()
}

private fun AppViewModel.feil88(e: Exception, fallback: String = "Fikk ikke kontakt med NRK-nedlasteren"): String =
    if (e is ApiException) err87(e) else uiErr73(e, fallback)

/** Lenker i køen (i kø eller lastes ned) – søketreff og episoder merkes «I KØ». */
internal fun Nrk87State.aktiv88(url: String): Boolean =
    (sok.opt[url] ?: 0L) > System.currentTimeMillis() - 120_000L || jobber.orEmpty().any { (it.status == "ko" || it.status == "kjorer") && (it.url == url || url in it.urls) }

/** Søk og serieside finnes (nrk-dl har katalogen): verken søket eller statusen har sagt noe annet. */
internal fun Nrk87State.sokMulig88(): Boolean = sok.mulig && status?.bibliotek != false

/** Følger vi serien? (følg-objektet med samme serie-id). */
internal fun Nrk87State.folgAv88(sid: String): NrkFolg87? = folger.firstOrNull { nrkSerieId88(it.url) == sid }

/** Søk med pause mens brukeren skriver (kalles fra skjermen 350 ms etter siste tastetrykk, eller med en gang ved «Søk»). */
fun AppViewModel.nrkSok88() {
    val s = nrk87.sok
    val q = s.q.trim().take(100)
    val nr = ++s.sokNr
    if (q.length < 2) { s.sokQ = ""; s.treff = null; s.sokErr = null; s.sokLaster = false; return }
    s.sokLaster = true; s.sokErr = null
    if (q != s.sokQ) { s.sokQ = q; s.treff = null }
    launch43 {
        try {
            val o = get88("/sok?q=" + URLEncoder.encode(q, "UTF-8"))
            if (nr != s.sokNr) return@launch43
            if (o.opt("tilgjengelig") == false) { s.mulig = false; s.treff = emptyList(); s.lenkeApen = true }
            else s.treff = objs88(o.optJSONArray("treff")).mapNotNull { parseTreff88(it) }.distinctBy { it.url }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (nr != s.sokNr) return@launch43
            s.sokErr = feil88(e); s.treff = emptyList()
        } finally { if (nr == s.sokNr) s.sokLaster = false }
    }
}

fun AppViewModel.nrkTomSok88() {
    val s = nrk87.sok
    s.q = ""; s.sokQ = ""; s.treff = null; s.sokErr = null; s.sokLaster = false; s.sokNr++; s.ser = null
}

/** Trykk på en serie (søketreff eller Bibliotek): vis seriesiden og hent serien og valgt sesong. Bare GET. */
fun AppViewModel.apneSerie88(sid: String, tittel: String) {
    val s = nrk87.sok
    s.ser = sid; s.serTittel = tittel; s.serr = null; s.pick = emptySet()
    nrk87.valgt = null
    Haptics.select()
    val har = s.serData[sid]
    if (har?.data == null) loadSerie88(sid)
    else nrkSesong88(har.data.sesonger.map { it.navn to it.tilgjengelig }, s.si[sid])?.let { if (s.sesData["$sid/$it"]?.data == null) loadSes88(sid, it, false) }
}

fun AppViewModel.loadSerie88(sid: String) {
    val s = nrk87.sok
    s.serData = s.serData - sid
    launch43 {
        val r: NrkLast88<NrkSerie88> = try {
            val o = get88("/serie/" + URLEncoder.encode(sid, "UTF-8"))
            if (o.opt("tilgjengelig") == false) { s.mulig = false; NrkLast88(null, "Biblioteket krever en nyere versjon av nrk-dl.") }
            else NrkLast88(parseSerie88(o, sid), null)
        } catch (e: CancellationException) { throw e } catch (e: Exception) { NrkLast88(null, feil88(e)) }
        s.serData = s.serData + (sid to r)
        val x = r.data ?: return@launch43
        nrkSesong88(x.sesonger.map { it.navn to it.tilgjengelig }, s.si[sid])?.let { if (s.sesData["$sid/$it"]?.data == null) loadSes88(sid, it, false) }
    }
}

/** Episodene i en sesong. [stille] = oppdater uten å tømme lista (etter «Last ned» og når en jobb blir ferdig). */
fun AppViewModel.loadSes88(sid: String, navn: String, stille: Boolean) {
    val s = nrk87.sok
    val k = "$sid/$navn"
    if (!nrkSesongOk88(navn)) return
    if (!stille) s.sesData = s.sesData - k
    launch43 {
        try {
            val o = get88("/serie/" + URLEncoder.encode(sid, "UTF-8") + "/sesong/" + URLEncoder.encode(navn, "UTF-8"))
            val r = if (o.opt("tilgjengelig") == false) NrkLast88<List<NrkSesEp88>>(emptyList(), "Biblioteket krever en nyere versjon av nrk-dl.")
            else NrkLast88(objs88(o.optJSONArray("episoder")).mapNotNull { parseSesEp88(it) }.distinctBy { it.id }, null) // like id-er ville krasjet lista
            s.sesData = s.sesData + (k to r)
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (!stille || s.sesData[k]?.data == null) s.sesData = s.sesData + (k to NrkLast88(emptyList(), feil88(e)))
        }
    }
}

/** Velg sesong i seriesiden. Bare visning + GET av episodene. */
fun AppViewModel.velgSesong88(navn: String) {
    val s = nrk87.sok
    val sid = s.ser ?: return
    s.si = s.si + (sid to navn); s.pick = emptySet(); s.serr = null
    if (s.sesData["$sid/$navn"]?.data.isNullOrEmpty()) loadSes88(sid, navn, false)
}

/** «Komprimer» sendes bare når brukeren har endret den fra serverens standard (som komp87 i Nrk87.kt). */
internal fun JSONObject.komp88(n: Nrk87State): JSONObject {
    val std = n.status?.komp?.standard ?: return this
    val k = n.komp ?: return this
    return if (k != std) put("komprimer", k) else this
}

private fun conflict88(e: Exception): Boolean = e is ApiException && e.status == 409 && e.message?.contains("nrk-dl") != true

/** «Last ned» på et søketreff (film, episode, radio – eller en serie uten serie-id). Eneste vei fra søket til køen. */
fun AppViewModel.nrkTreffLastNed88(t: NrkTreff88) {
    val n = nrk87
    val s = n.sok
    if (s.lbusy || !t.tilgjengelig || n.aktiv88(t.url)) return
    s.lbusy = true; s.sokErr = null
    launch43 {
        try {
            api43 { hlPost("/media/nrk/jobber", JSONObject().put("url", t.url).put("type", nrkTreffType88(t.art)).put("kvalitet", n.kval).put("folg", false).komp88(n)) }
            s.opt = s.opt + (t.url to System.currentTimeMillis())
            Haptics.success()
            p43.toast = "Lagt i køen"
            loadNrkKo87()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.sokErr = if (conflict88(e)) "Lenken ligger allerede i køen." else feil88(e)
            Haptics.error()
        } finally { s.lbusy = false }
    }
}

/** «Last ned N episoder» på seriesiden → én jobb i nrk-dl (POST /jobber med episoder → /api/episoder). */
fun AppViewModel.nrkHentValgte88() {
    val n = nrk87
    val s = n.sok
    val sid = s.ser ?: return
    val x = s.serData[sid]?.data ?: return
    val navn = nrkSesong88(x.sesonger.map { it.navn to it.tilgjengelig }, s.si[sid]) ?: return
    val ses = x.sesonger.firstOrNull { it.navn == navn }
    val valgte = s.sesData["$sid/$navn"]?.data.orEmpty().filter { nrkKanVelges88(it.kan, it.lastetNed, it.iKo || n.aktiv88(it.url)) && it.id in s.pick }.take(200)
    if (s.lbusy || valgte.isEmpty()) return
    s.lbusy = true; s.serr = null
    launch43 {
        try {
            val body = JSONObject().put("url", x.url).put("type", "tv").put("kvalitet", n.kval).put("folg", false)
                .put("tittel", nrkJobbTittel88(x.tittel, navn, ses?.tittel)).put("episoder", JSONArray(valgte.map { it.url })).komp88(n)
            api43 { hlPost("/media/nrk/jobber", body) }
            s.opt = s.opt + valgte.map { it.url to System.currentTimeMillis() }
            s.pick = s.pick - valgte.map { it.id }.toSet()
            Haptics.success()
            p43.toast = if (valgte.size == 1) "1 episode lagt i køen" else "${valgte.size} episoder lagt i køen"
            loadNrkKo87()
            loadSes88(sid, navn, true)
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.serr = if (conflict88(e)) "Lenken ligger allerede i køen." else feil88(e)
            Haptics.error()
        } finally { s.lbusy = false }
    }
}

/** «Følg serien» / «✓ Følger serien» på seriesiden. Følg henter bare nye episoder fremover. */
fun AppViewModel.nrkFolgSerie88() {
    val n = nrk87
    val s = n.sok
    val sid = s.ser ?: return
    val x = s.serData[sid]?.data ?: return
    if (s.fbusy) return
    val f = n.folgAv88(sid)
    s.fbusy = true; s.serr = null
    launch43 {
        try {
            if (f != null) api43 { hlDelete("/media/nrk/folger/${f.id}") }
            else api43 { hlPost("/media/nrk/folger", JSONObject().put("url", x.url).put("type", "tv").put("kvalitet", n.kval).put("tittel", x.tittel).komp88(n)) }
            Haptics.success()
            p43.toast = if (f != null) "Følger ikke lenger" else "Følger serien"
            loadNrkKo87()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.serr = feil88(e); Haptics.error() } finally { s.fbusy = false }
    }
}

/** Avkrysning: én episode, eller alle tilgjengelige i sesongen (trykk igjen fjerner valget). Bare lokalt. */
fun AppViewModel.nrkVelg88(id: String) { val s = nrk87.sok; s.pick = if (id in s.pick) s.pick - id else s.pick + id; Haptics.select() }
fun AppViewModel.nrkVelgAlle88(ider: List<String>) {
    val s = nrk87.sok
    s.pick = if (ider.isNotEmpty() && ider.all { it in s.pick }) s.pick - ider.toSet() else s.pick + ider
    Haptics.select()
}

/** Etter en ferdig jobb: oppdater sesongen som vises (lastet ned / i kø). Kalles fra loadNrkKo87 via skjermen. */
fun AppViewModel.nrkSerieOppdater88() {
    val s = nrk87.sok
    val sid = s.ser ?: return
    val x = s.serData[sid]?.data ?: return
    nrkSesong88(x.sesonger.map { it.navn to it.tilgjengelig }, s.si[sid])?.let { loadSes88(sid, it, true) }
}
