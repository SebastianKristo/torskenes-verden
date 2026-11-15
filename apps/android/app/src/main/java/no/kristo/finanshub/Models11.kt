package no.kristo.finanshub

import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

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
