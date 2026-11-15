@file:JvmName("DomeneSporing")

package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject

/*
 * Sporing: kode som lå i blandingsfilene (P37.kt, P42.kt, Models11.kt, Models22.kt, Models14.kt, Mod26B.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

data class TrkKey37(val id: String, val name: String, val set: Boolean, val tail: String?, val status: String, val addedBy: String?, val updatedAt: String?)

data class TrkKeys37(val providers: List<TrkKey37>, val used: Int?, val mine: Int?, val limit: Int?, val perUserPct: Int?, val admin: Boolean,
    /** Ferdige tekster fra serveren: «Du har brukt 3 av husstandens 20 oppslag …» og «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen». */
    val quotaText: String? = null, val line: String? = null)

/* ---------- Pakker (h2): vis bare når det er pakker ---------- */

private fun AppViewModel.woptKey37() = "papir_wopt37_" + acct37()

fun AppViewModel.loadWopt37() {
    val s = p37
    val k = woptKey37()
    if (s.woptFor == k) return
    s.woptFor = k
    fun apply(o: JSONObject?) {
        val h2 = o?.optJSONObject("h2") ?: return
        s.h2Auto = h2.optBoolean("auto", true)
        s.h2N = h2.optInt("n", 1).coerceIn(1, 3)
    }
    apply(runCatching { JSONObject(prefs.str(k, "")) }.getOrNull())
    launch37 {
        val raw = runCatching { api37 { hlGet("/me/layout") } }.getOrNull() ?: return@launch37
        val w = runCatching { JSONObject(raw).optJSONObject("wopt") }.getOrNull() ?: return@launch37
        if (s.woptFor != k) return@launch37
        apply(w)
        prefs.set(k, w.toString())
    }
}

fun AppViewModel.setH2Opt37(auto: Boolean = p37.h2Auto, n: Int = p37.h2N) {
    val s = p37
    s.h2Auto = auto; s.h2N = n.coerceIn(1, 3)
    val w = JSONObject().put("h2", JSONObject().put("auto", s.h2Auto).put("n", s.h2N))
    prefs.set(woptKey37(), w.toString())
    launch37 { runCatching { api37 { hlPut("/me/layout", JSONObject().put("wopt", w)) } } }
}

/** Aktive pakker (status 1–3: registrert, på vei, klar for henting). null = ikke hentet ennå. */
fun AppViewModel.activePackages37(): Int? = if (tracking == null && homePackages == null) null else packagesOnWay

/** Med «vis bare når det er pakker» på og 0 aktive pakker skjules widgeten (utenfor redigeringsmodus). */
fun AppViewModel.h2Hidden37(): Boolean = p37.h2Auto && activePackages37() == 0

/* ======================= Sporing: husstandens nøkler ======================= */

fun AppViewModel.loadTrkKeys37() {
    val s = p37
    launch37 {
        try {
            val o = JSONObject(api37 { hlGet("/tracking/keys") })
            val q = o.optJSONObject("quota")
            s.trk = TrkKeys37(objs34(o.optJSONArray("providers")).mapNotNull { p ->
                TrkKey37(p.s37("id") ?: return@mapNotNull null, p.s37("name") ?: p.s37("id")!!, p.optBoolean("set", false), p.s37("tail"), p.s37("status") ?: "missing",
                    p.optJSONObject("addedBy")?.s37("name") ?: p.opt("addedBy").let { it as? String }, p.s37("updatedAt"))
            }, q?.let { if (it.has("used")) it.optInt("used") else null }, q?.let { if (it.has("mine")) it.optInt("mine") else null },
                q?.let { if (it.has("limit")) it.optInt("limit") else null }, q?.let { if (it.has("perUserPct")) it.optInt("perUserPct") else null }, o.optBoolean("admin", userIsAdmin),
                q?.s37("text"), q?.s37("line"))
            s.trkMissing = false
        } catch (e: ApiException) { if (e.status == 404 || e.status == 405) s.trkMissing = true } catch (e: CancellationException) { throw e } catch (_: Exception) {}
    }
}

/** Admin: ny nøkkel (key) eller fjern (null). */
fun AppViewModel.putTrkKey37(id: String, key: String?) {
    val s = p37
    s.trkBusy = true
    launch37 {
        try {
            if (key == null) api37 { hlDelete("/tracking/keys/" + URLEncoder.encode(id, "UTF-8")) }
            else api37 { hlPut("/tracking/keys/" + URLEncoder.encode(id, "UTF-8"), JSONObject().put("key", key)) }
            s.trkEdit = null
            flash(if (key == null) "Nøkkelen er fjernet" else "Nøkkelen er lagret for hele husstanden")
            loadTrkKeys37()
        } catch (e: ApiException) {
            flash(if (e.status == 403) "Bare admin kan endre sporingsnøklene" else "Fikk ikke lagret: ${e.message}")
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke lagret") } finally { s.trkBusy = false }
    }
}

/** «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen». */
fun AppViewModel.trkLine37(): String? {
    val k = p37.trk ?: return null
    k.line?.let { return it }
    val pa = k.providers.firstOrNull { it.id == "parcelsapp" && it.set } ?: k.providers.firstOrNull { it.set } ?: return null
    val left = if (k.limit != null && k.used != null) (k.limit - k.used).coerceAtLeast(0) else null
    return "Bruker husstandens ${pa.name}-nøkkel" + (left?.let { " · $it oppslag igjen" } ?: "")
}

/* ======================= Fraktselskap ======================= */

/** «POSTNORD», «PostNord AB», «PostNord Norge», «postnord_no» → «postnord». Brukes til logo-oppslag i stedet for visningsnavnet. */
fun carrierId42(raw: String?): String? {
    var k = raw?.trim()?.lowercase() ?: return null
    if (k.isEmpty()) return null
    k = k.replace(Regex("[_\\-](no|se|dk|fi)$"), "")
    k = k.replace(Regex("\\s+(ab|as|asa|norge|norway|sverige|sweden|danmark|logistics)$"), "")
    k = k.replace(Regex("[^a-z0-9æøå]"), "")
    return when (k) {
        "postnord", "postnordno", "postnordnorge" -> "postnord"
        "posten", "postennorge" -> "posten"
        "bring", "bringno" -> "bring"
        "dhl", "dhlexpress", "dhlparcel", "dhlfreight" -> "dhl"
        "helthjem" -> "helthjem"
        "instabox" -> "instabox"
        "budbee" -> "budbee"
        "ups" -> "ups"
        "fedex", "fedexexpress" -> "fedex"
        "gls" -> "gls"
        "dbschenker", "schenker" -> "schenker"
        "porterbuddy" -> "porterbuddy"
        "aliexpress", "aliexpressstandardshipping", "cainiao" -> "aliexpress"
        else -> k
    }
}

/* ---------------- Sporing ---------------- */

data class TrackEvent(val at: Instant?, val raw: String, val status: String, val location: String) {
    val whenText: String get() = at?.let { fmtTime(it, "dd.MM HH:mm") } ?: raw
}

data class Carrier(val id: String, val name: String, val ini: String, val color: Long, val fg: Long, val configured: Boolean? = null) {
    companion object {
        /** Formatene fra designet (må verifiseres mot transportørene). «other» = reservetjenesten (17TRACK/AfterShip). */
        val KNOWN = listOf(
            Carrier("posten", "Posten", "P", 0xFFE32D22, 0xFFFFFFFF), Carrier("bring", "Bring", "B", 0xFF7BC144, 0xFF0F2A05),
            Carrier("postnord", "PostNord", "PN", 0xFF00A0D6, 0xFFFFFFFF), Carrier("dhl", "DHL", "DHL", 0xFFFFCC00, 0xFFD40511),
            Carrier("ups", "UPS", "UPS", 0xFF351C15, 0xFFFFB500), Carrier("fedex", "FedEx", "FX", 0xFF4D148C, 0xFFFFFFFF),
            Carrier("gls", "GLS", "GLS", 0xFF172154, 0xFFFFD100), Carrier("schenker", "DB Schenker", "DB", 0xFFEC0016, 0xFFFFFFFF),
            Carrier("helthjem", "Helthjem", "HH", 0xFF2E2A6B, 0xFFFFFFFF), Carrier("budbee", "Budbee", "BB", 0xFF2BCE96, 0xFF05271B),
            Carrier("instabox", "Instabox", "IB", 0xFFFF4E00, 0xFFFFFFFF), Carrier("aliexpress", "AliExpress", "AE", 0xFFE62E04, 0xFFFFFFFF), // prompt 42
            Carrier("other", "Annen (17TRACK)", "17", 0xFF3A4252, 0xFFEEF0F4),
        )
        private val PATTERNS = listOf(
            "posten" to listOf("^[A-Z]{2}\\d{9}NO$", "^(LP|LZ)\\d{12,}$"),
            "bring" to listOf("^70\\d{15}$", "^\\d{17}$"),
            "postnord" to listOf("^00370\\d{15}$", "^[A-Z]{2}\\d{9}(SE|DK|FI)$", "^\\d{18,20}$"),
            "dhl" to listOf("^JJD\\d{10,}$", "^(JVGL|GM)\\w{8,}$", "^\\d{10}$"),
            "ups" to listOf("^1Z[0-9A-Z]{16}$"),
            "fedex" to listOf("^\\d{12}$", "^\\d{15}$"),
            "gls" to listOf("^\\d{11}$"),
            "schenker" to listOf("^\\d{9}$"),
            "helthjem" to listOf("^HH\\d{8,}$"),
            "budbee" to listOf("^BB[A-Z0-9]{8,}$"),
            "instabox" to listOf("^IB[A-Z0-9]{8,}$"),
        ).map { (id, l) -> id to l.map(::Regex) }
        /** Gjetter transportøren ut fra formatet. Serveren sjekker også (GET /api/tracking/detect). */
        fun detect(raw: String): String {
            val no = raw.uppercase().filter { it.isLetterOrDigit() }
            return PATTERNS.firstOrNull { (_, res) -> res.any { it.matches(no) } }?.first ?: "other"
        }
    }
}

data class Shipment(
    val id: String, val trackingNo: String, val carrier: String, val carrierName: String, val carrierIni: String, val carrierColor: Long, val carrierFg: Long,
    val name: String, val shop: String, val source: String, val sourceRef: String, val direction: String, val status: String, val statusText: String,
    val step: Int, val steps: List<String>, val eta: String, val pickupPoint: String, val archived: Boolean, val url: String, val events: List<TrackEvent>,
    /** Logoen fra serveren (/assets/carriers/<id>.svg). Appen viser initialene på merkefargen når SVG ikke kan tegnes. */
    val carrierLogo: String? = null,
    /** Prompt 21: tittel fra serveren (varenavn eller butikk, ellers «Pakke fra Bring»). Aldri sporingsnummer. */
    val title: String? = null,
    /** Butikkens domene (fra e-postavsender, Finn eller ParcelsApp), og logo-id i logoregisteret. */
    val shopDomain: String? = null,
    val logoId: String? = null,
    /** Fraktselskapets domene for den lille merkelappen (bring.no, postnord.no …). */
    val carrierDomain: String? = null,
    /** Antall pakker til (utenom denne) på Hjem-kortet. */
    val moreCount: Int? = null,
    /** Prompt 22: siste hendelse fra API-et, feil ved siste oppdatering, forventet levering, hentested og steg med tid. */
    val lastEvent: TrkLastEvent? = null,
    val updateError: TrkUpdateError? = null,
    val estimatedDelivery: String? = null,
    val pickup: TrkPickup? = null,
    val stepInfo: List<TrkStep> = emptyList(),
    /** Prompt 26: valgt transportør (null = automatisk), den gjenkjente, og teksten i underteksten («Bring · valgt»). */
    val carrierOverride: String? = null,
    val carrierDetected: String? = null,
    val carrierLabel: String? = null,
    val carrierDetectedName: String? = null,
) {
    /** Tittelen på kortet: serverens tittel, ellers varenavn/butikk, ellers «Pakke fra <fraktselskap>». */
    val cardTitle: String get() {
        title?.takeIf { it.isNotBlank() && it != trackingNo }?.let { return it }
        // Standardnavnet «Bring · 0750» (fraktselskap + slutten av sporingsnummeret) er ikke et varenavn.
        val generic = name.isBlank() || name == trackingNo || name == "$carrierName · ${trackingNo.takeLast(4)}" || (trackingNo.length >= 6 && name.contains(trackingNo))
        return listOfNotNull(shop.takeIf { it.isNotBlank() }, name.takeIf { !generic && it != shop }).joinToString(" · ").ifBlank { "Pakke fra $carrierName" }
    }
    /** Domenet logoen hentes fra: butikken først, så fraktselskapet. */
    val logoDomain: String? get() = shopDomain ?: carrierDomain ?: CARRIER_DOMAINS[carrier]
    val hasShopLogo: Boolean get() = shopDomain != null || logoId != null || shop.isNotBlank()

    val done get() = status == "delivered"
    val active get() = !archived && !done
    val ready get() = status == "ready_for_pickup" && direction != "out"
    val outgoing get() = direction == "out"
    val sourceLabel get() = when (source) { "finn" -> "Finn"; "email" -> "E-post"; else -> "Manuell" }
    /** «Coop Extra Bislett», «Ventet 18.10» eller ETA-teksten fra transportøren. */
    val etaText: String get() {
        if (ready && pickupPoint.isNotBlank()) return pickupPoint
        if (eta.isBlank()) return if (outgoing) "Utgående" else ""
        val d = runCatching { LocalDate.parse(eta.take(10)) }.getOrNull() ?: return eta
        return (if (done) "Levert " else "Ventet ") + "%02d.%02d".format(d.dayOfMonth, d.monthValue)
    }

    companion object {
        val STEPS_IN = listOf("Registrert", "Hentet", "I transport", "Klar for henting", "Levert")
        val STEPS_OUT = listOf("Registrert", "Levert inn", "I transport", "Ute for levering", "Levert")
        val STATUS = mapOf("registered" to "Registrert", "picked_up" to "Hentet", "in_transit" to "I transport", "ready_for_pickup" to "Klar for henting",
            "out_for_delivery" to "Ute for levering", "delivered" to "Levert", "delayed" to "Forsinket", "returned" to "Returnert", "unknown" to "Ukjent status")
        fun stepOf(s: String) = when (s) { "picked_up" -> 1; "in_transit", "delayed" -> 2; "ready_for_pickup", "out_for_delivery" -> 3; "delivered" -> 4; else -> 0 }
    }
}

fun parseShipment(o: JSONObject): Shipment {
    // Prompt 42: «POSTNORD», «PostNord AB», «postnord_no» … → «postnord» (carrier_id) én gang ved innlesing (P42.kt).
    val raw = o.optStr("carrierId") ?: o.optStr("carrier")
    val carrier = carrierId42(raw)?.takeIf { id -> Carrier.KNOWN.any { it.id == id } } ?: raw ?: "other"
    val def = Carrier.KNOWN.firstOrNull { it.id == carrier }
    val carrierName = o.optStr("carrierName") ?: def?.name ?: carrier.replaceFirstChar { it.uppercase() }
    val no = o.optStr("trackingNo") ?: o.optStr("no") ?: ""
    val status = o.optStr("status") ?: "unknown"
    val direction = o.optStr("direction") ?: "in"
    val stepInfo = parseTrkSteps(o.optJSONArray("steps"))
    val steps = (if (stepInfo.isNotEmpty()) stepInfo.map { it.label } else o.optJSONArray("steps").strings()).takeIf { it.size == 5 && it.none(String::isBlank) }
        ?: if (direction == "out") Shipment.STEPS_OUT else Shipment.STEPS_IN
    val (lastEvent, updateError, pickup) = parseTrkExtras(o)
    return Shipment(
        o.optStr("id") ?: no, no, carrier, carrierName, o.optStr("carrierIni") ?: def?.ini ?: carrierName.take(2).uppercase(),
        o.optStr("carrierColor")?.let(::color) ?: def?.color ?: 0xFF3A4252, o.optStr("carrierFg")?.let(::color) ?: def?.fg ?: 0xFFFFFFFF,
        o.optStr("name") ?: "$carrierName · ${no.takeLast(4)}", o.optStr("shop") ?: "", o.optStr("source") ?: "manual",
        o.optStr("sourceNote") ?: o.optStr("sourceRef") ?: "", direction, status, o.optStr("statusText") ?: Shipment.STATUS[status] ?: "Ukjent status",
        (o.optIntOrNull("step") ?: Shipment.stepOf(status)).coerceIn(0, 4), steps, o.optStr("eta") ?: "", o.optStr("pickupPoint") ?: "",
        o.optBoolean("archived"), o.optStr("url") ?: "",
        o.optJSONArray("events")?.map { e -> TrackEvent(e.timeAt("ts") ?: e.timeAt("time"), e.optStr("ts") ?: "", e.optStr("status") ?: e.optStr("text") ?: "", e.optStr("location") ?: "") } ?: emptyList(),
        o.optStr("carrierLogo") ?: o.optJSONObject("logo")?.let { l -> l.optStr("carrierLogo") ?: l.optJSONObject("carrierLogo")?.optStr("url") },
        title = o.optStr("title"),
        shopDomain = o.optStr("shop_domain") ?: o.optStr("shopDomain") ?: o.optJSONObject("logo")?.optStr("domain"),
        logoId = o.optJSONObject("logo")?.optStr("id"),
        carrierDomain = o.optJSONObject("logo")?.let { l -> l.optJSONObject("carrierLogo")?.optStr("domain") ?: l.optStr("carrierDomain") }
            ?: CARRIER_DOMAINS[carrier],
        moreCount = o.optIntOrNull("moreCount"),
        lastEvent = lastEvent, updateError = updateError, estimatedDelivery = o.optStr("estimatedDelivery"), pickup = pickup, stepInfo = stepInfo,
        carrierOverride = o.optStr("carrierOverride") ?: o.optStr("carrier_override"), carrierDetected = o.optStr("carrierDetected"), carrierLabel = o.optStr("carrierLabel"), carrierDetectedName = o.optStr("carrierDetectedName"),
    )
}

/** Fraktselskap → domene (logo og merkelapp), som i claude-code-pakke-logo.md. */
val CARRIER_DOMAINS: Map<String, String> = mapOf(
    "bring" to "bring.no", "posten" to "posten.no", "postnord" to "postnord.no", "dhl" to "dhl.com", "helthjem" to "helthjem.no",
    "instabox" to "instabox.io", "budbee" to "budbee.com", "ups" to "ups.com", "fedex" to "fedex.com", "gls" to "gls-group.com",
    "dbschenker" to "dbschenker.com", "schenker" to "dbschenker.com", "porterbuddy" to "porterbuddy.com",
)

data class TrackSource(val on: Boolean, val lastCheck: Instant?)

data class TrackNotice(val id: String, val kind: String, val text: String)

data class TrackingData(
    val items: List<Shipment>, val finn: TrackSource, val email: TrackSource, val carriers: List<Carrier>, val prefs: Map<String, Boolean>,
    val notices: List<TrackNotice>?, val lastRun: Instant?,
    /** Kilden «Arkiver leverte automatisk» (etter 7 dager). */
    val autoArchive: TrackSource = TrackSource(true, null),
) {
    val lastCheck: Instant? get() = listOfNotNull(finn.lastCheck, email.lastCheck, lastRun).maxOrNull()
    /** De viktigste: klar for henting først, så lengst kommet. */
    fun top(n: Int) = items.filter { it.active }.sortedWith(compareByDescending<Shipment> { it.ready }.thenByDescending { it.step }).take(n)

    companion object { val PREF_DEFAULT = mapOf("found" to true, "out" to true, "pickup" to true, "delivered" to true, "delayed" to false) }
}

fun parseTracking(s: String): TrackingData {
    val o = JSONObject(s)
    val src = o.optJSONObject("sources")
    fun source(k: String): TrackSource {
        val v = src?.opt(k)
        if (v is Boolean) return TrackSource(v, null)
        val x = v as? JSONObject
        return TrackSource(x?.optBoolean("on", true) ?: true, x?.timeAt("lastCheck"))
    }
    val carriers = o.optJSONArray("carriers")?.map { c ->
        val id = c.optStr("id") ?: "other"
        val def = Carrier.KNOWN.firstOrNull { it.id == id }
        Carrier(id, c.optStr("name") ?: def?.name ?: id, c.optStr("ini") ?: def?.ini ?: id.take(2).uppercase(),
            c.optStr("color")?.let(::color) ?: def?.color ?: 0xFF3A4252, c.optStr("fg")?.let(::color) ?: def?.fg ?: 0xFFFFFFFF, c.optBoolOrNull("configured"))
    }.orEmpty()
    val p = o.optJSONObject("prefs")
    return TrackingData(
        o.optJSONArray("items")?.map(::parseShipment) ?: emptyList(),
        source("finn"), source(if (src?.has("email") == true) "email" else "mail"),
        carriers.ifEmpty { Carrier.KNOWN },
        TrackingData.PREF_DEFAULT.mapValues { (k, v) -> p?.optBoolOrNull(k) ?: v },
        if (o.has("notices")) o.optJSONArray("notices")?.map { TrackNotice(it.optStr("id") ?: it.optString("ts"), it.optString("kind"), it.optString("text")) } ?: emptyList() else null,
        o.timeAt("lastRun"),
        source("autoArchive"),
    )
}

/* ---------- Sporing: siste hendelse, feil og tidslinje ---------- */

data class TrkLastEvent(val text: String, val place: String?, val time: String?)

data class TrkUpdateError(val text: String, val retryAt: String?)

data class TrkPickup(val name: String, val deadline: String?)

/** Ett steg i tidslinjen: navn, om det er nådd, og tidspunktet (ISO) når det finnes. */
data class TrkStep(val label: String, val done: Boolean, val at: String?)

internal fun parseTrkExtras(o: JSONObject): Triple<TrkLastEvent?, TrkUpdateError?, TrkPickup?> {
    val le = o.optJSONObject("lastEvent")?.let { e -> e.optStr("text")?.let { TrkLastEvent(it, e.optStr("place") ?: e.optStr("location"), e.optStr("time") ?: e.optStr("ts")) } }
    val ue = o.optJSONObject("updateError")?.let { e -> e.optStr("text")?.let { TrkUpdateError(it, e.optStr("retryAt")) } }
        ?: o.optStr("updateError")?.let { TrkUpdateError(it, null) }
    val pk = o.optJSONObject("pickup")?.let { e -> e.optStr("name")?.let { TrkPickup(it, e.optStr("deadline")) } }
    return Triple(le, ue, pk)
}

/** steps som objekter ({label|name|text, done|reached, at|time}) gir faktisk status per steg. Strenger: bare navn. */
internal fun parseTrkSteps(a: JSONArray?): List<TrkStep> {
    if (a == null) return emptyList()
    return (0 until a.length()).mapNotNull { i ->
        when (val v = a.opt(i)) {
            is JSONObject -> TrkStep(v.optStr("label") ?: v.optStr("name") ?: v.optStr("text") ?: "", v.optBoolean("done", v.optBoolean("reached", false)),
                v.optStr("at") ?: v.optStr("time") ?: v.optStr("ts"))
            else -> null
        }
    }
}

/** Sporingslenker hos transportørene: et trykk på pakkekortet åpner sporingen der. */
fun carrierTrackUrl(carrier: String, no: String): String {
    val n = java.net.URLEncoder.encode(no, "UTF-8")
    return when (carrier) {
        "postnord" -> "https://portal.postnord.com/tracking/details/$n"
        "posten" -> "https://sporing.posten.no/sporing/$n"
        "bring" -> "https://tracking.bring.com/tracking/$n"
        "dhl" -> "https://www.dhl.com/no-no/home/tracking.html?tracking-id=$n"
        "ups" -> "https://www.ups.com/track?loc=nb_NO&tracknum=$n"
        "gls" -> "https://gls-group.com/NO/nb/sporing?match=$n"
        "helthjem" -> "https://www.helthjem.no/sporing/$n"
        "budbee" -> "https://tracking.budbee.com/$n"
        "instabox" -> "https://track.instabox.io/$n"
        else -> "https://t.17track.net/no#nums=$n"
    }
}

/** Fanene i Papir → Sporing. */
val TRK_TABS: List<Pair<String, String>> = listOf(
    "active" to "Aktive", "pickup" to "Klar for henting", "way" to "På vei", "reg" to "Registrert", "done" to "Levert", "all" to "Alle", "arkiv" to "Arkiv",
)

fun trkTabMatch(tab: String, s: Shipment): Boolean = when (tab) {
    "pickup" -> !s.archived && s.ready
    "way" -> !s.archived && !s.done && (s.step == 1 || s.step == 2 || s.status == "out_for_delivery")
    "reg" -> !s.archived && !s.done && s.step == 0
    "done" -> s.done && !s.archived
    "arkiv" -> s.archived
    "all" -> !s.archived
    else -> s.active
}

/** Kortene på Sporing-siden som kan flyttes (lagres som trkOrder per bruker). */
val TRK_CARDS: List<Pair<String, String>> = listOf("add" to "Legg til og kilder", "shipments" to "Sendinger", "notify" to "Varsler", "carriers" to "Transportører")

fun normalizeTrkOrder(raw: List<String>): List<String> {
    val ids = TRK_CARDS.map { it.first }
    val known = raw.filter { it in ids }.distinct()
    return known + ids.filter { it !in known }
}

/* ---------- Sporing: overstyr transportør ---------- */

/** Valgene i «Spor via» og ved ny pakke (nøklene serveren godtar som carrierOverride). */
val TRK26_CARS: List<Pair<String, String>> = listOf(
    "posten" to "Posten", "bring" to "Bring", "postnord" to "PostNord", "dhl" to "DHL", "helthjem" to "Helthjem",
    "ups" to "UPS", "budbee" to "Budbee", "instabox" to "Instabox", "parcelsapp" to "ParcelsApp",
)

fun trkCarName26(id: String?): String? = id?.let { k -> TRK26_CARS.firstOrNull { it.first == k }?.second ?: Carrier.KNOWN.firstOrNull { it.id == k }?.name }

/** Navnet på transportøren som gjenkjennes automatisk for nummeret. */
fun trkGuessName26(no: String): String {
    val g = Carrier.detect(no.uppercase().filter { it.isLetterOrDigit() })
    return trkCarName26(g)?.takeIf { g != "other" } ?: "Bring"
}

private fun AppViewModel.ovrKey26() = "b26_trkovr_" + (account?.id ?: "")

/** Lokale overstyringer (bare når serveren ikke lagrer carrierOverride ennå). */
fun AppViewModel.trkLocalOvr26(): Map<String, String> {
    val id = account?.id ?: ""
    if (b26.trkOvrFor != id) {
        b26.trkOvrFor = id
        b26.trkOvr = runCatching {
            val o = JSONObject(prefs.str(ovrKey26(), "{}"))
            o.keys().asSequence().associateWith { o.getString(it) }
        }.getOrDefault(emptyMap())
    }
    return b26.trkOvr
}

private fun AppViewModel.setLocalOvr26(no: String, car: String?) {
    val m = trkLocalOvr26().toMutableMap()
    if (car == null) m.remove(no) else m[no] = car
    b26.trkOvr = m
    prefs.set(ovrKey26(), JSONObject(m as Map<*, *>).toString())
}

/** Valgt transportør for pakken (serverens, ellers den lokale), eller null for automatisk. */
fun AppViewModel.trkOverride26(s: Shipment): String? = s.carrierOverride ?: trkLocalOvr26()[s.trackingNo]

/** Pakken slik den vises: med lokal overstyring brukes valgt transportørs navn, merke og logo. */
fun AppViewModel.trkView26(s: Shipment): Shipment {
    if (s.carrierOverride != null) return s
    val ov = trkLocalOvr26()[s.trackingNo] ?: return s
    if (ov == s.carrier) return s
    val k = Carrier.KNOWN.firstOrNull { it.id == ov }
    val name = trkCarName26(ov) ?: ov
    return s.copy(
        carrier = ov, carrierName = name, carrierIni = k?.ini ?: "PA", carrierColor = k?.color ?: 0xFF4B5BD6, carrierFg = k?.fg ?: 0xFFFFFFFF,
        carrierLogo = null, carrierDomain = CARRIER_DOMAINS[ov] ?: if (ov == "parcelsapp") "parcelsapp.com" else null,
    )
}

/** Underteksten: «Bring · valgt» når transportøren er overstyrt, ellers navnet. */
fun AppViewModel.trkCarrierLabel26(s: Shipment): String {
    val ov = trkOverride26(s) ?: return s.carrierName
    return s.carrierLabel?.takeIf { s.carrierOverride != null } ?: "${trkCarName26(ov) ?: s.carrierName} · valgt"
}

/** Ny pakke med valgt transportør (null = automatisk, som før). */
fun AppViewModel.addTracking26(no: String, car: String?) {
    val n = no.trim().uppercase().filter { it.isLetterOrDigit() }
    if (car == null) { addTracking(n, "", Carrier.detect(n).takeIf { n.length >= 6 }, false); return }
    launch24b {
        val body = JSONObject().put("trackingNo", n).put("direction", "in").put("carrierOverride", car)
        if (car != "parcelsapp") body.put("carrier", car)
        val o = JSONObject(api24b { request("POST", "/tracking", body, prefix = Api.HOMELAB, timeout = 30_000) })
        val item = o.optJSONObject("item")
        if (item == null || !item.has("carrierOverride")) setLocalOvr26(n, car) else setLocalOvr26(n, null)
        item?.let { trkSel = parseShipment(it).id }
        loadTracking()
        trkFilter = "active"
        flash(o.optStr("message") ?: "Spores via ${trkCarName26(car) ?: car}")
    }
}

/** «Spor via»: overstyrer (eller tilbake til automatisk med null), og pakken spores med en gang. */
fun AppViewModel.trkSetOverride26(s: Shipment, car: String?) {
    val v = car
    launch24b {
        var saved = false
        var msg: String? = null
        try {
            val r = api24b { request("PATCH", "/tracking/${s.id}", JSONObject().put("carrierOverride", v ?: JSONObject.NULL), prefix = Api.HOMELAB, timeout = 45_000) }
            val o = runCatching { JSONObject(r) }.getOrNull()
            saved = (o?.optJSONObject("item") ?: o)?.has("carrierOverride") == true
            msg = o?.optStr("message")
        } catch (e: ApiException) {
            if (e.status !in setOf(400, 404, 405, 422)) throw e
        }
        setLocalOvr26(s.trackingNo, if (saved) null else v)
        if (!saved) runCatching { api24b { request("POST", "/tracking/refresh", JSONObject(), prefix = Api.HOMELAB, timeout = 30_000) } }
        loadTracking()
        flash(msg ?: "Spores nå via ${trkCarName26(v) ?: s.carrierDetected?.let(::trkCarName26) ?: trkGuessName26(s.trackingNo)}")
    }
}
