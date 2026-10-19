package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/* ---------------- Felles: tidspunkt som ms, sekunder eller ISO-tekst ---------------- */

internal fun anyTime(v: Any?): Instant? = when (v) {
    is Number -> v.toDouble().let { x -> if (x > 1e11) Instant.ofEpochMilli(x.toLong()) else if (x > 1e8) Instant.ofEpochSecond(x.toLong()) else null }
    is String -> v.trim().takeIf { it.isNotEmpty() }?.let { s ->
        s.toDoubleOrNull()?.let { anyTime(it) }
            ?: runCatching { OffsetDateTime.parse(s).toInstant() }.getOrNull()
            ?: runCatching { Instant.parse(s) }.getOrNull()
            ?: runCatching { LocalDate.parse(s.take(10)).atStartOfDay(ZoneId.systemDefault()).toInstant() }.getOrNull()
    }
    else -> null
}
internal fun fmtTime(t: Instant?, pattern: String): String =
    t?.let { DateTimeFormatter.ofPattern(pattern, Locale.forLanguageTag("nb-NO")).withZone(ZoneId.systemDefault()).format(it) } ?: ""
internal fun JSONObject.timeAt(k: String): Instant? = if (!has(k) || isNull(k)) null else anyTime(opt(k))

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
            Carrier("instabox", "Instabox", "IB", 0xFFFF4E00, 0xFFFFFFFF), Carrier("other", "Annen (17TRACK)", "17", 0xFF3A4252, 0xFFEEF0F4),
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
    val carrier = o.optStr("carrier") ?: "other"
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
    val activeCount get() = items.count { it.active }
    val pickupCount get() = items.count { !it.archived && it.ready }
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

/* ---------------- Vær (MET: Locationforecast + Nowcast + Sunrise) ---------------- */

data class WHour(val label: String, val symbol: String, val temp: Double?, val mm: Double)
data class WDay(val label: String, val symbol: String, val min: Double?, val max: Double?, val mm: Double)
data class WeatherX(
    val symbol: String, val feels: Double?, val hi: Double?, val lo: Double?, val wind: Double?, val gust: Double?, val windDir: String,
    val precip24: Double?, val humidity: Double?, val uv: Double?, val pressure: Double?, val pressureTrend: String,
    val sunrise: Instant?, val sunset: Instant?, val nowcast: String, val hours: List<WHour>, val days: List<WDay>,
)

private fun compass(d: Double?): String = d?.let { listOf("N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV")[(((it % 360 + 360) % 360 + 22.5) / 45).toInt() % 8] } ?: ""

fun parseWeatherX(o: JSONObject): WeatherX {
    // Vind kan være et tall (m/s) eller et objekt {speed, gust, dir}; detaljene ligger også i windInfo og flate felt.
    val w = o.optJSONObject("wind") ?: o.optJSONObject("windInfo")
    val wind = (if (o.opt("wind") is Number) o.optDoubleOrNull("wind") else null) ?: w?.optDoubleOrNull("speed")
    return WeatherX(
        o.optStr("symbol") ?: o.optStr("code") ?: "", o.optDoubleOrNull("feels"), o.optDoubleOrNull("hi") ?: o.optDoubleOrNull("max"), o.optDoubleOrNull("lo") ?: o.optDoubleOrNull("min"),
        wind, o.optDoubleOrNull("windGust") ?: w?.optDoubleOrNull("gust"), o.optStr("windDirText") ?: w?.optStr("dirText") ?: compass(o.optDoubleOrNull("windDir") ?: w?.optDoubleOrNull("dir")),
        o.optDoubleOrNull("precip24"), o.optDoubleOrNull("humidity"), o.optDoubleOrNull("uv"), o.optDoubleOrNull("pressure"), o.optStr("pressureTrend") ?: "",
        o.timeAt("sunrise"), o.timeAt("sunset"), o.optJSONObject("nowcast")?.optStr("text") ?: (o.opt("nowcast") as? String) ?: "",
        o.optJSONArray("hours")?.map { h ->
            val l = h.optStr("label") ?: h.optStr("t") ?: ""
            WHour(if (l.contains('T')) fmtTime(anyTime(l), "HH") else l, h.optStr("symbol") ?: "", h.optDoubleOrNull("temp"), h.optDoubleOrNull("mm") ?: h.optDoubleOrNull("precip") ?: 0.0)
        } ?: emptyList(),
        o.optJSONArray("days")?.map { d ->
            val date = d.optStr("date") ?: ""
            WDay(d.optStr("label") ?: runCatching { LocalDate.parse(date).dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, Locale.forLanguageTag("nb-NO")).replaceFirstChar { it.uppercase() } }.getOrDefault(date),
                d.optStr("symbol") ?: "", d.optDoubleOrNull("min"), d.optDoubleOrNull("max"), d.optDoubleOrNull("mm") ?: 0.0)
        } ?: emptyList(),
    )
}

/* ---------------- Aksjer (Trading 212) ---------------- */

data class StockPos(
    val ticker: String, val symbol: String, val name: String, val qty: Double, val avg: Double, val price: Double, val value: Double,
    val pl: Double, val plPct: Double, val dayPct: Double?, val etf: Boolean, val series: List<Double>,
) { val ini get() = symbol.filter { it.isLetterOrDigit() }.take(2).uppercase() }
/** kind: Kjøp | Salg | Utbytte · status: Utført | Venter | Avvist */
data class StockTxn(val id: String, val ticker: String, val symbol: String, val kind: String, val status: String, val qty: Double, val amount: Double, val date: String, val time: String)
data class StocksX(
    val configured: Boolean, val mock: Boolean, val env: String, val error: String, val syncedAt: Instant?,
    val total: Double, val value: Double, val invested: Double, val result: Double, val cash: Double,
    val positions: List<StockPos>, val history: List<Double>, val txns: List<StockTxn>,
) {
    val dayChange: Double get() = positions.sumOf { p -> p.dayPct?.let { p.value * it / (100 + it) } ?: 0.0 }
    val hasDay: Boolean get() = positions.any { it.dayPct != null }
}

private val ETF_RE = Regex("ETF|UCITS|Vanguard|iShares|Xtrackers|SPDR|Amundi|Invesco|Lyxor|Index", RegexOption.IGNORE_CASE)

fun parseStocksX(s: String): StocksX {
    val o = JSONObject(s)
    val sm = o.optJSONObject("summary")
    val value = sm?.optDoubleOrNull("value") ?: 0.0
    val invested = sm?.optDoubleOrNull("invested") ?: 0.0
    val cash = sm?.optDoubleOrNull("cash") ?: 0.0
    val hist = o.optJSONArray("history")?.map { it } ?: emptyList()
    fun clock(v: String?) = if (v != null && v.length > 10) fmtTime(anyTime(v), "HH:mm") else ""
    fun sym(t: String) = t.substringBefore('_')
    val positions = o.optJSONArray("positions")?.map { p ->
        val ticker = p.optStr("ticker") ?: p.optStr("symbol") ?: "?"
        val name = p.optStr("name") ?: sym(ticker)
        val qty = p.num("quantity"); val avg = p.num("avg"); val px = p.num("price")
        val v = p.optDoubleOrNull("value") ?: qty * px
        val pl = p.optDoubleOrNull("pl") ?: (v - qty * avg)
        val type = (p.optStr("type") ?: p.optStr("kind") ?: "").lowercase()
        val arr = (p.opt("history") ?: p.opt("spark") ?: p.opt("prices")) as? JSONArray
        var series = arr?.let { a -> (0 until a.length()).mapNotNull { i -> when (val x = a.opt(i)) { is Number -> x.toDouble(); is JSONObject -> x.optDoubleOrNull("price") ?: x.optDoubleOrNull("value") ?: x.optDoubleOrNull("close"); else -> null } } } ?: emptyList()
        if (series.isEmpty()) series = hist.mapNotNull { it.optJSONObject("prices")?.optDoubleOrNull(ticker) }
        StockPos(ticker, p.optStr("symbol") ?: sym(ticker), name, qty, avg, px, v, pl, p.optDoubleOrNull("plPct") ?: if (qty * avg > 0) pl / (qty * avg) * 100 else 0.0,
            p.optDoubleOrNull("dayPct"), if (type.isEmpty()) ETF_RE.containsMatchIn(name) else "etf" in type || "fund" in type, series)
    } ?: emptyList()
    val orders = o.optJSONArray("orders")?.map { x ->
        val t = x.optStr("ticker") ?: x.optStr("symbol") ?: ""
        val st = (x.optStr("status") ?: "").uppercase()
        val date = x.optStr("date") ?: ""
        StockTxn("o" + (x.optStr("id") ?: "$t$date"), t, x.optStr("symbol") ?: sym(t), if ((x.optStr("side") ?: "").lowercase().startsWith("s")) "Salg" else "Kjøp",
            if (st.isEmpty() || "FILL" in st || "EXECUT" in st) "Utført" else if ("CANCEL" in st || "REJECT" in st) "Avvist" else "Venter",
            x.num("quantity"), x.num("value"), date.take(10), clock(x.optStr("time") ?: date))
    } ?: emptyList()
    val divs = o.optJSONArray("dividends")?.map { x ->
        val t = x.optStr("ticker") ?: x.optStr("symbol") ?: ""
        val date = x.optStr("date") ?: ""
        StockTxn("d$t$date", t, x.optStr("symbol") ?: sym(t), "Utbytte", "Utført", x.num("quantity"), x.num("amount"), date.take(10), clock(date))
    } ?: emptyList()
    return StocksX(
        o.optBoolOrNull("configured") ?: (sm != null), o.optBoolean("mock"), o.optStr("env") ?: "", o.optStr("error") ?: "", o.timeAt("syncedAt"),
        sm?.optDoubleOrNull("total") ?: (value + cash), value, invested, sm?.optDoubleOrNull("result") ?: (value - invested), cash,
        positions, hist.mapNotNull { it.optDoubleOrNull("value") }, (orders + divs).sortedByDescending { it.date + it.time },
    )
}

/* ---------------- Subscription OS ---------------- */

data class SubItem(
    val id: Int, val name: String, val plan: String, val price: Double, val monthly: Double, val cycle: String, val nextDate: String, val chargeDay: Int?,
    val category: String, val status: String, val active: Boolean, val domain: String?, val aiShort: String?,
    /** Prompt 14: faktureringsdato som dag + måned (årlige), egen logo og neste trekk fra serveren. */
    val billDay: Int? = null, val billMonth: Int? = null, val logoUrl: String? = null, val nextCharge: String? = null,
    /** Prompt 37: delte abonnementer (Starlink) – medlemmer, deling (equal | payer), hvem som betaler og min del per måned. */
    val members: List<SubMember37> = emptyList(), val split: String? = null, val payerId: String? = null, val myShare: Double? = null,
    val ownerId: String? = null,
    /** Eier eller betaler kan endre delingen; «Delt · din del 400 kr/mnd» fra serveren. */
    val canEdit: Boolean? = null, val shareLabel: String? = null, val sharedFlag: Boolean? = null,
) {
    val shared get() = sharedFlag ?: (members.size > 1)
    val cycleName get() = when (cycle) { "yearly" -> "Årlig"; "biennial" -> "Hvert 2. år"; else -> "Månedlig" }
    val flagged get() = active && (status == "low_use" || status == "price_up")
}
data class SubSuggestion(val id: String, val subId: Int?, val name: String, val text: String, val amount: Double, val domain: String?)
data class SubCharge(val id: Int?, val name: String, val date: String, val amount: Double)
data class SubMonth(val month: String, val total: Double, val byCategory: Map<String, Double>)
data class SubCandidate(val merchant: String, val amount: Double, val cycle: String, val count: Int, val lastDate: String, val domain: String?) {
    val key get() = "$merchant|$amount"
    fun toJson(): JSONObject = JSONObject().put("merchant", merchant).put("amount", amount).put("cycle", cycle).put("count", count).put("lastDate", lastDate).apply { domain?.let { put("domain", it) } }
}
data class SubsX(
    val items: List<SubItem>, val monthly: Double, val yearly: Double, val prevMonthly: Double?, val categories: List<String>, val byMonth: List<SubMonth>,
    val score: Double?, val healthLabel: String, val healthText: String, val notes: List<String>, val saveMonthly: Double,
    val suggestions: List<SubSuggestion>, val upcoming: List<SubCharge>, val thisMonth: List<SubCharge>, val monthTotal: Double?,
) { fun item(id: Int?) = items.firstOrNull { it.id == id } }

fun parseSubsX(s: String): SubsX {
    val o = JSONObject(s)
    val items = o.optJSONArray("items")?.map { x ->
        val price = x.num("price"); val cycle = x.optStr("cycle") ?: "monthly"
        val next = x.optStr("nextDate") ?: ""
        // Prompt 14: «state» (active | cancelled) skiller sagt opp fra helsestatusen i «status».
        val active = x.optStr("state")?.let { it != "cancelled" } ?: x.optBoolean("active", true)
        SubItem(x.optInt("id"), x.optStr("name") ?: "Abonnement", x.optStr("plan") ?: "", price,
            x.optDoubleOrNull("monthly") ?: when (cycle) { "yearly" -> price / 12; "biennial" -> price / 24; else -> price }, cycle, next,
            x.optIntOrNull("chargeDay") ?: next.takeIf { it.length >= 10 }?.substring(8, 10)?.toIntOrNull(), x.optStr("category") ?: "Annet",
            x.optStr("status") ?: if (!active) "cancelled" else if (x.optBoolean("lowUse")) "low_use" else "active", active, x.optStr("domain"), x.optStr("aiShort"),
            x.optIntOrNull("billDay") ?: x.optIntOrNull("bill_day"), x.optIntOrNull("billMonth") ?: x.optIntOrNull("bill_month"),
            x.optStr("logoUrl") ?: x.optStr("logo_url"), x.optJSONObject("nextCharge")?.optStr("label") ?: x.optStr("nextCharge"),
            subMembers37(x.optJSONArray("members")), x.optStr("split"), x.optStr("payerId"), x.optDoubleOrNull("myShareMonthly") ?: x.optDoubleOrNull("myShare"), x.optStr("ownerId") ?: x.optStr("userId"),
            if (x.has("canEdit") && !x.isNull("canEdit")) x.optBoolean("canEdit") else null, x.optStr("shareLabel"), if (x.has("shared") && !x.isNull("shared")) x.optBoolean("shared") else null)
    } ?: emptyList()
    val act = items.filter { it.active }
    val h = o.optJSONObject("health")
    val sv = o.optJSONObject("savings")
    var sug = sv?.optJSONArray("suggestions")?.map { x -> SubSuggestion((x.optStr("kind") ?: "s") + (x.optStr("id") ?: x.optString("text")), x.optIntOrNull("id"), x.optString("name"), x.optString("text"), x.num("amount"), x.optStr("domain")) } ?: emptyList()
    if (sug.isEmpty()) sug = act.filter { it.flagged }.map { x ->
        SubSuggestion("f${x.id}", x.id, x.name, if (x.status == "price_up") "${x.name} har økt prisen. Sjekk om en billigere plan holder." else "Si opp ${x.name}. Lite brukt i det siste.", Math.round(x.monthly).toDouble(), x.domain)
    }
    fun charges(k: String) = o.optJSONArray(k)?.map { c ->
        val id = c.optIntOrNull("id")
        SubCharge(id, c.optStr("name") ?: items.firstOrNull { it.id == id }?.name ?: "Abonnement", c.optString("date"), c.num("amount"))
    } ?: emptyList()
    return SubsX(
        items, o.optDoubleOrNull("monthly") ?: act.sumOf { it.monthly }, o.optDoubleOrNull("yearly") ?: act.sumOf { it.monthly } * 12, o.optDoubleOrNull("prevMonthly"),
        o.optJSONArray("categories").strings().filter { it.isNotBlank() },
        o.optJSONArray("byMonth")?.map { m ->
            val cats = mutableMapOf<String, Double>()
            m.optJSONObject("byCategory")?.let { b -> b.keys().forEach { k -> cats[k] = b.optDouble(k, 0.0).takeIf { !it.isNaN() } ?: 0.0 } }
                ?: m.optJSONArray("byCategory")?.map { it }?.forEach { c -> (c.optStr("category") ?: c.optStr("name"))?.let { cats[it] = c.optDoubleOrNull("amount") ?: c.num("total") } }
            SubMonth(m.optString("month"), m.optDoubleOrNull("total") ?: cats.values.sum(), cats)
        } ?: emptyList(),
        h?.optDoubleOrNull("score"), h?.optStr("label") ?: "", h?.optStr("text") ?: "", h?.optJSONArray("notes").strings(),
        sv?.optDoubleOrNull("monthly") ?: sug.sumOf { it.amount }, sug, charges("upcoming"), charges("thisMonth"), o.optDoubleOrNull("monthTotal"),
    )
}

fun parseSubCandidates(s: String): List<SubCandidate> {
    val t = s.trim()
    val arr = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONArray()
    return arr.map { c -> SubCandidate(c.optStr("merchant") ?: c.optStr("name") ?: "?", kotlin.math.abs(c.num("amount")), c.optStr("cycle") ?: "monthly", c.optInt("count"), c.optString("lastDate"), c.optStr("domain")) }
}
