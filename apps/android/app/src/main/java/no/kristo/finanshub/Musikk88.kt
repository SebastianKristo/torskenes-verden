package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 88 (AND88), CONTRACT88APP.md: Musikk-fanen i Media (yubal: YouTube Music → musikkbiblioteket / Navidrome).
 * Fasit: public/js/media-musikk.js, server/yubal.js, docs/musikk-yubal.md, «Media Musikk.dc.html».
 *  - Last ned musikk: lenkefelt + «Lim inn» → «Forhåndsvis» (GET /info) → «Alle spor» / «Bare de første N», «Følg spillelisten»
 *    (bare spillelister) → «Last ned» (POST /jobs, eller POST /subscriptions + /sync). Ingenting starter uten trykk.
 *  - Køen (GET /jobs): omslag, tittel – artist, statuschip, fremdrift, tall fra download_stats, Manuell/Automatisk, Avbryt/Fjern, «Fjern ferdige».
 *  - Spillelister du følger (GET /subscriptions): av/på (PATCH), «Synk nå», «Slutt å følge», «Synk alle», neste automatiske sjekk;
 *    trykk på raden åpner sangene (GET /subscriptions/:id/tracks, én om gangen, huskes i 60 s).
 * Alt via Api (open86()) til Homelab-serveren under /api/media/yubal. Appen kjenner aldri adressen til yubal. Omslag via serverens
 * bildeproxy (/api/media/yubal/bilde?u=…) med samme innlogging som andre Media-bilder.
 */

data class MuInfo88(
    val title: String, val artist: String?, val year: Int?, val trackCount: Int?, val kind: String, val thumbnail: String?,
    val codec: String?, val bitrate: Int?, val url: String?,
)
data class MuJob88(
    val id: String, val url: String?, val status: String, val progress: Double, val source: String, val info: MuInfo88?,
    val ok: Int, val feilet: Int, val hoppet: Int,
)
data class MuSub88(val id: String, val name: String, val url: String?, val enabled: Boolean, val max: Int?, val thumbnail: String?, val synket: Long?)
data class MuSpor88(val title: String, val artist: String?, val duration: Int?, val status: String?)
data class MuSporSvar88(
    val tracks: List<MuSpor88>, val total: Int?, val available: Boolean, val ok: Int, val feilet: Int, val hoppet: Int, val fantes: Int,
    val synket: Boolean, val message: String?,
)
data class MuSporLast88(val d: MuSporSvar88?, val feil: String?, val laster: Boolean, val at: Long)

class Musikk88State {
    /** null = ikke hentet, false = yubal er ikke satt opp (tomtilstand). */
    var configured by mutableStateOf<Boolean?>(null)
    /** Serveren har ikke /api/media/yubal ennå (eldre Homelab). */
    var gammel by mutableStateOf(false)
    var err by mutableStateOf<String?>(null)
    var format by mutableStateOf("m4a")
    var planPaa by mutableStateOf<Boolean?>(null)
    var planNeste by mutableStateOf<Long?>(null)
    var jobs by mutableStateOf<List<MuJob88>?>(null)
    var subs by mutableStateOf<List<MuSub88>?>(null)

    /* Skjemaet (ligger her, så feltet beholder teksten når Media tegnes på nytt). */
    var url by mutableStateOf("")
    var ferr by mutableStateOf<String?>(null)
    var laster by mutableStateOf(false)
    var pv by mutableStateOf<MuInfo88?>(null)
    internal var pvKilde = ""
    var typ by mutableStateOf("alle")
    var maxN by mutableStateOf("50")
    var folg by mutableStateOf(false)
    var starter by mutableStateOf(false)

    /* Spillelister */
    var open by mutableStateOf<String?>(null)
    var spor by mutableStateOf<Map<String, MuSporLast88>>(emptyMap())
    var sy by mutableStateOf<String?>(null)
    var tog by mutableStateOf<String?>(null)
    var aerr by mutableStateOf<String?>(null)

    internal var henter = false
    internal var stAt = 0L

    /** Kontobytte/utlogging: ingenting fra forrige bruker blir stående (heller ikke lenken i feltet). */
    fun reset() {
        configured = null; gammel = false; err = null; format = "m4a"; planPaa = null; planNeste = null; jobs = null; subs = null
        url = ""; ferr = null; laster = false; pv = null; pvKilde = ""; typ = "alle"; maxN = "50"; folg = false; starter = false
        open = null; spor = emptyMap(); sy = null; tog = null; aerr = null; henter = false; stAt = 0L
    }
}

/* ======================= JSON (romslig) ======================= */

private val UUID88 = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
private fun JSONObject.s88(k: String): String? = if (!has(k) || isNull(k)) null else opt(k)?.toString()?.trim()?.takeIf { it.isNotEmpty() && it != "null" }
private fun JSONObject.i88(k: String): Int? = if (!has(k) || isNull(k)) null else when (val v = opt(k)) {
    is Number -> v.toDouble().takeIf { !it.isNaN() && !it.isInfinite() }?.let { Math.round(it).toInt() }
    is String -> v.trim().toDoubleOrNull()?.let { Math.round(it).toInt() }
    else -> null
}
private fun objs88(a: JSONArray?): List<JSONObject> = if (a == null) emptyList() else (0 until a.length()).mapNotNull { a.optJSONObject(it) }
/** ISO-tid fra serveren → millisekunder, eller null. */
internal fun muTid88(v: String?): Long? = v?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }

internal fun parseMuInfo88(o: JSONObject?): MuInfo88? {
    if (o == null) return null
    return MuInfo88(o.s88("title") ?: "Uten tittel", o.s88("artist"), o.i88("year")?.takeIf { it > 0 }, o.i88("track_count"),
        o.s88("kind")?.takeIf { it in setOf("album", "playlist", "track") } ?: "playlist", egetBilde88(o.s88("thumbnail")), o.s88("audio_codec"),
        o.i88("audio_bitrate")?.takeIf { it > 0 }, o.s88("url")?.let(::ytLenke88))
}

internal fun parseMuJob88(o: JSONObject): MuJob88? {
    val id = o.s88("id")?.takeIf { UUID88.matches(it) }?.lowercase() ?: return null
    val st = o.optJSONObject("download_stats")
    return MuJob88(id, o.s88("url")?.let(::ytLenke88), o.s88("status") ?: "pending", (o.opt("progress") as? Number)?.toDouble()?.coerceIn(0.0, 100.0) ?: 0.0,
        if (o.s88("source") == "scheduler") "scheduler" else "manual", parseMuInfo88(o.optJSONObject("content_info")),
        st?.i88("success") ?: 0, st?.i88("failed") ?: 0, st?.i88("skipped") ?: 0)
}

internal fun parseMuSub88(o: JSONObject): MuSub88? {
    val id = o.s88("id")?.takeIf { UUID88.matches(it) }?.lowercase() ?: return null
    return MuSub88(id, o.s88("name") ?: "Spilleliste", o.s88("url")?.let(::ytLenke88), o.opt("enabled") != false, o.i88("max_items")?.takeIf { it > 0 },
        egetBilde88(o.s88("thumbnail")), muTid88(o.s88("last_synced_at")))
}

internal fun parseMuSpor88(o: JSONObject): MuSporSvar88 {
    val s = o.optJSONObject("summary")
    return MuSporSvar88(
        objs88(o.optJSONArray("tracks")).take(2000).map { t -> MuSpor88(t.s88("title") ?: "Uten tittel", t.s88("artist"), t.i88("duration")?.takeIf { it > 0 }, t.s88("status")) },
        o.i88("total"), o.optBoolean("available", false), s?.i88("success") ?: 0, s?.i88("failed") ?: 0, s?.i88("skipped") ?: 0, s?.i88("existing") ?: 0,
        s?.s88("last_status") != null, o.s88("message"),
    )
}

/* ======================= Kall ======================= */

private fun AppViewModel.muErr88(e: Exception): String {
    if (e !is ApiException) return uiErr73(e, "Fikk ikke kontakt med yubal")
    val m = e.message.orEmpty().trim()
    return when {
        m.startsWith(Api.TOKEN_REFUSED) || e.status == 401 || e.status == 403 -> mediaErr44(e)
        e.status == 404 && (m.isEmpty() || m.startsWith("Feil ")) -> "Serveren har ikke Musikk ennå – oppdater Homelab."
        m.isEmpty() || m.startsWith("Feil ") -> "Fikk ikke kontakt med yubal"
        else -> m // serveren svarer med norsk tekst (også 409 «køen er full»)
    }
}

private suspend fun AppViewModel.muGet88(path: String, timeout: Int = 15_000): JSONObject {
    val raw = api43 { hlGet("/media/yubal$path", timeout = timeout) }
    return runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject()
}

/** Åpner fanen og hver runde i oppdateringen: køen, spillelistene, og status høyst hvert minutt. Ett kall om gangen. */
fun AppViewModel.loadMusikk88() {
    val m = musikk88
    if (m.henter) return
    m.henter = true
    launch43 {
        try {
            if (m.configured == null || System.currentTimeMillis() - m.stAt > 60_000L) {
                val st = muGet88("/status")
                m.stAt = System.currentTimeMillis()
                if (st.opt("configured") == false) { m.configured = false; m.jobs = emptyList(); m.subs = emptyList(); m.err = null; m.gammel = false; return@launch43 }
                m.format = st.s88("format") ?: "m4a"
                val sc = st.optJSONObject("scheduler")
                m.planPaa = sc?.let { it.optBoolean("enabled", false) }
                m.planNeste = sc?.let { muTid88(it.s88("next_run_at")) }
            }
            val j = muGet88("/jobs")
            if (j.opt("configured") == false) { m.configured = false; m.jobs = emptyList(); m.subs = emptyList(); return@launch43 }
            val s = muGet88("/subscriptions")
            m.jobs = objs88(j.optJSONArray("jobs")).mapNotNull { parseMuJob88(it) }.distinctBy { it.id } // like id-er ville krasjet lista
            m.subs = objs88(s.optJSONArray("items")).mapNotNull { parseMuSub88(it) }.distinctBy { it.id }
            m.configured = true; m.err = null; m.gammel = false
            if (m.open != null && m.subs.orEmpty().none { it.id == m.open }) m.open = null
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (e is ApiException && e.status == 404 && m.configured == null) m.gammel = true
            m.err = muErr88(e)
        } finally { m.henter = false }
    }
}

fun AppViewModel.tickMusikk88() = loadMusikk88()

/** «Forhåndsvis»: bare GET /info – ingenting lastes ned. */
fun AppViewModel.muForhandsvis88() {
    val m = musikk88
    if (m.laster) return
    val u = ytLenke88(m.url)
    if (u == null) { m.ferr = "Bare lenker fra music.youtube.com, youtube.com eller youtu.be."; m.pv = null; Haptics.error(); return }
    m.laster = true; m.ferr = null; m.pv = null
    launch43 {
        try {
            val o = muGet88("/info?url=" + URLEncoder.encode(u, "UTF-8"), timeout = 25_000)
            m.pv = parseMuInfo88(o.optJSONObject("info")) ?: run { m.ferr = "yubal fant ikke noe på lenken"; null }
            m.pvKilde = u; m.typ = "alle"; m.folg = false
        } catch (e: CancellationException) { throw e } catch (e: Exception) { m.ferr = muErr88(e); Haptics.error() } finally { m.laster = false }
    }
}

/** «Last ned» / «Følg og last ned» i forhåndsvisningen. Eneste sted en lenke blir til en jobb eller et abonnement. */
fun AppViewModel.muStart88() {
    val m = musikk88
    val p = m.pv ?: return
    if (m.starter) return
    val max = if (p.kind != "track" && m.typ == "max") muMax88(m.maxN) else null
    val url = m.pvKilde.ifBlank { p.url.orEmpty() }
    if (ytLenke88(url) == null) return
    m.starter = true; m.ferr = null
    launch43 {
        try {
            val body = JSONObject().put("url", url).apply { if (max != null) put("max_items", max) }
            if (p.kind == "playlist" && m.folg) {
                val r = runCatching { JSONObject(api43 { hlPost("/media/yubal/subscriptions", body) }) }.getOrNull()
                // Last ned med en gang, ikke vent på planleggeren.
                r?.optJSONObject("item")?.s88("id")?.takeIf { UUID88.matches(it) }?.let { id -> api43 { hlPost("/media/yubal/subscriptions/${id.lowercase()}/sync") } }
                p43.toast = "Følger spillelisten · laster ned"
            } else {
                api43 { hlPost("/media/yubal/jobs", body) }
                p43.toast = "Lagt i køen"
            }
            m.pv = null; m.url = ""; m.folg = false; m.typ = "alle"; m.pvKilde = ""
            Haptics.success()
            m.stAt = 0L
            loadMusikk88()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { m.ferr = muErr88(e); Haptics.error() } finally { m.starter = false }
    }
}

/** Handlinger i Køen og på spillelistene. Alle krever trykk. */
fun AppViewModel.muHandling88(handling: String, id: String? = null) {
    val m = musikk88
    if (handling != "rydd" && handling != "synkalle" && (id == null || !UUID88.matches(id))) return
    m.aerr = null
    launch43 {
        try {
            val i = id.orEmpty()
            when (handling) {
                "avbryt" -> api43 { hlPost("/media/yubal/jobs/$i/cancel") }
                "fjern" -> api43 { hlDelete("/media/yubal/jobs/$i") }
                "rydd" -> api43 { hlDelete("/media/yubal/jobs") }
                "tog" -> {
                    val x = m.subs.orEmpty().firstOrNull { it.id == i } ?: return@launch43
                    m.tog = i
                    // PATCH {enabled} (Api.request støtter PATCH; samme Homelab-prefiks og open86() som resten).
                    api43 { request("PATCH", "/media/yubal/subscriptions/$i", JSONObject().put("enabled", !x.enabled), prefix = Api.HOMELAB) }
                    m.spor = m.spor - i
                }
                "synk" -> { m.sy = i; api43 { hlPost("/media/yubal/subscriptions/$i/sync") }; m.spor = m.spor - i; p43.toast = "Synker spillelisten" }
                "synkalle" -> { m.sy = "alle"; api43 { hlPost("/media/yubal/subscriptions/sync") }; m.spor = emptyMap(); p43.toast = "Synker alle spillelister" }
                "slett" -> { api43 { hlDelete("/media/yubal/subscriptions/$i") }; if (m.open == i) m.open = null; m.spor = m.spor - i; p43.toast = "Følger ikke lenger" }
                else -> return@launch43
            }
            Haptics.select()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { m.aerr = muErr88(e); Haptics.error() } finally {
            m.sy = null; m.tog = null; m.stAt = 0L
        }
        loadMusikk88()
        m.open?.let { if (m.spor[it] == null) loadMuSpor88(it, false) }
    }
}

/** Trykk på en spilleliste: åpne (og hent sangene) eller lukk. Én åpen om gangen. */
fun AppViewModel.muApne88(id: String) {
    val m = musikk88
    m.open = if (m.open == id) null else id
    Haptics.select()
    m.open?.let { loadMuSpor88(it, false) }
}

/** Sangene i en spilleliste: hentes først når lista åpnes, og huskes i 60 s. */
fun AppViewModel.loadMuSpor88(id: String, tving: Boolean) {
    val m = musikk88
    if (!UUID88.matches(id)) return
    val c = m.spor[id]
    if (!tving && c != null && (c.laster || (c.d != null && System.currentTimeMillis() - c.at < 60_000L))) return
    m.spor = m.spor + (id to MuSporLast88(c?.d, null, true, c?.at ?: 0L))
    launch43 {
        val ny = try { MuSporLast88(parseMuSpor88(muGet88("/subscriptions/$id/tracks", timeout = 30_000)), null, false, System.currentTimeMillis()) } catch (e: CancellationException) { throw e } catch (e: Exception) {
            MuSporLast88(m.spor[id]?.d, muErr88(e), false, m.spor[id]?.at ?: 0L)
        }
        m.spor = m.spor + (id to ny)
    }
}
