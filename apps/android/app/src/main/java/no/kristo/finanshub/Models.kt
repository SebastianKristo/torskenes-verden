package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject

/* ---------------- FinansHub ---------------- */

data class Category(val id: Int, val name: String, val color: Long, val kind: String)
data class Account(val id: Int, val name: String, val type: String, val last4: String?, val balance: Double)

data class Settings(
    val name: String, val provider: String, val fallback: Boolean, val autoCat: Boolean,
    val n80: Boolean, val n100: Boolean, val nRc: Boolean, val minConf: Int,
)

data class Goal(val id: Int, val name: String, val saved: Double, val target: Double, val color: Long)
data class Rule(val id: Int, val pattern: String, val category: String?)

data class Boot(
    val settings: Settings, val categories: List<Category>, val accounts: List<Account>, val reviewCount: Int,
    val goals: List<Goal> = emptyList(), val rules: List<Rule> = emptyList(), val restricted: Boolean = false,
)

data class Tx(
    val id: Int, val date: String, val amount: Double, val description: String, val category: String, val categoryId: Int?,
    val color: Long, val account: String, val note: String, val receipt: String?,
    val aiShort: String? = null, val aiLong: String? = null, val domain: String? = null,
    val lines: List<Pair<String, Double>> = emptyList(), val folder: String? = null,
    val folderId: Int? = null, val accountId: Int? = null, val receiptId: String? = null, val merchant: String? = null, val source: String? = null,
)

data class Budget(
    val categoryId: Int, val category: String, val color: Long, val budget: Double, val used: Double,
    val count: Int = 0, val topMerchant: String? = null, val prevUsed: Double? = null,
)

data class Job(val id: String, val name: String, val status: String, val progress: Int, val merchant: String?, val total: Double?)

data class Receipt(
    val id: String, val status: String, val provider: String?, val seconds: Double?, val merchant: String?, val date: String?,
    val total: Double?, val categoryId: Int?, val accountId: Int?, val confidence: Double, val flag: String?, val error: String?,
    val mime: String?, val file: String?, val thumb: String?, val lines: List<Pair<String, Double>>, val match: Tx?,
    val aiShort: String? = null, val domain: String? = null,
)

data class Summary(
    val month: String, val from: String, val to: String, val daysLeft: Int, val inn: Double, val ut: Double,
    val budgetTotal: Double, val budgetUsed: Double, val left: Double, val savedYear: Double, val yearGoal: Double,
    val budgets: List<Budget>, val recent: List<Tx>, val review: List<Receipt>,
    val innMonthly: List<Double> = emptyList(),
)

/** Innlogget bruker på serveren (GET /finans/api/me eller /api/me). */
data class Me(
    val username: String, val name: String, val role: String, val totp: Boolean?, val version: String?,
    val avatarUrl: String? = null, val serverName: String? = null, val isMainAdmin: Boolean = false,
)

/* ---------------- Homelab (mobil forside) ---------------- */

data class Weather(val place: String, val temp: Double?, val text: String?, val wind: Double?, val max: Double?, val min: Double?, val code: Int?)
data class Shortcut(val name: String, val url: String, val local: Boolean)
data class Departure(val line: String, val color: Long?, val min: Int?, val time: String?)
data class RuterLine(val from: String, val to: String, val departures: List<Departure>)
data class ServerStatus(val cpu: Double?, val mem: Double?, val disk: Double?, val temp: Double?, val uptime: String?)
data class MobileHome(
    val name: String?, val serverName: String?, val avatarUrl: String?, val greeting: String?,
    val weather: Weather?, val shortcuts: List<Shortcut>, val ruter: List<RuterLine>, val serverStatus: ServerStatus?,
    val layout: HomeLayout? = null,
)

/** Oppsettet av mobilforsiden (per bruker og enhet): rekkefølge og synlighet for seksjoner og faner. */
data class HomeLayout(val sec: List<String>, val hlTabs: List<String>, val finTabs: List<String>, val hide: Map<String, Boolean>) {
    fun visible(id: String) = hide[id] != true
    fun toJson(): JSONObject = JSONObject().put("sec", JSONArray(sec)).put("hlTabs", JSONArray(hlTabs)).put("finTabs", JSONArray(finTabs))
        .put("hide", JSONObject().apply { hide.forEach { (k, v) -> put(k, v) } })

    companion object {
        val SECTIONS = listOf("clock", "search", "links", "os", "srv", "ruter")
        val HL_TABS = listOf("hl", "home", "dom", "mat")
        val FIN_TABS = listOf("home", "list", "bud", "ai", "mer")
        /** Kan ikke skjules. */
        val FIXED_HL = setOf("hl", "home")
        val FIXED_FIN = setOf("home", "mer")
        val DEFAULT = HomeLayout(SECTIONS, HL_TABS, FIN_TABS, mapOf("srv" to true, "ruter" to true))

        /** Nye ID-er som ikke finnes i lagret oppsett legges sist; ukjente fjernes. */
        private fun fix(saved: List<String>, all: List<String>) = saved.filter { it in all }.distinct() + all.filter { it !in saved }

        fun from(o: JSONObject?): HomeLayout {
            if (o == null) return DEFAULT
            val hide = DEFAULT.hide.toMutableMap()
            o.optJSONObject("hide")?.let { h -> h.keys().forEach { k -> hide[k] = h.optBoolean(k) } }
            return HomeLayout(
                fix(o.optJSONArray("sec").strings(), SECTIONS), fix(o.optJSONArray("hlTabs").strings(), HL_TABS),
                fix(o.optJSONArray("finTabs").strings(), FIN_TABS), hide,
            )
        }
    }
}

/* ---------------- Mer: sidene fra nettsiden ---------------- */

data class Recurring(val id: Int, val name: String, val amount: Double, val interval: String?, val day: Int?, val active: Boolean, val category: String?, val next: String?) {
    /** Omregnet til per måned. */
    val monthly: Double get() = kotlin.math.abs(amount) * when (interval) { "yearly", "year", "annual" -> 1.0 / 12; "weekly", "week" -> 52.0 / 12; "quarterly" -> 1.0 / 3; else -> 1.0 }
}

data class StockSummary(val total: Double, val invested: Double, val value: Double, val result: Double, val cash: Double, val realized: Double)
data class Position(val ticker: String, val symbol: String, val name: String, val quantity: Double, val avg: Double, val price: Double, val value: Double, val pl: Double, val plPct: Double, val dayPct: Double)
data class StockOrder(val symbol: String, val side: String, val quantity: Double, val value: Double, val price: Double, val date: String)
data class Dividend(val symbol: String, val amount: Double, val date: String)
data class Stocks(
    val configured: Boolean, val status: String?, val env: String?, val summary: StockSummary?, val positions: List<Position>,
    val history: List<Pair<String, Double>>, val orders: List<StockOrder>, val dividends: List<Dividend>, val mock: Boolean,
)

data class CatAmount(val category: String, val color: Long, val amount: Double)
data class MerchantAmount(val name: String, val amount: Double, val count: Int)
data class MonthInOut(val month: String, val inn: Double, val ut: Double)
data class Report(val mode: String, val total: Double, val byCategory: List<CatAmount>, val merchants: List<MerchantAmount>, val months: List<MonthInOut>)

data class ImportRow(val date: String, val description: String, val raw: String?, val amount: Double, val category: String?, val domain: String?, val aiShort: String?, val duplicate: Boolean)
data class ImportResult(val rows: List<ImportRow>, val imported: Int, val skipped: Int, val errors: List<String>)

data class SearchHit(val type: String, val txId: Int?, val receiptId: String?, val description: String, val date: String?, val amount: Double?, val source: String?, val reason: String?)
data class AiAnswer(val q: String, val answer: String, val hits: List<SearchHit>, val engine: String?, val suggestions: List<String>)

/** Original kvittering og bankrad for en transaksjon. */
data class ReceiptFile(val id: String, val mime: String?, val fileUrl: String?, val thumbUrl: String?)
data class BankRow(
    val bookingDate: String?, val valueDate: String?, val description: String?, val amount: Double?, val account: String?,
    val archiveReference: String?, val source: String?, val raw: String?, val json: String,
)
data class Original(val receipt: ReceiptFile?, val bankRow: BankRow?)

/** En rad på en Mer-side som åpner en detaljside med felt og tilhørende transaksjoner. */
data class DetailInfo(
    val title: String, val sub: String?, val value: String?, val valueSub: String?,
    val groups: List<Pair<String, List<Pair<String, String>>>>, val txQuery: String? = null,
)

/** Skjema for ny eller endret transaksjon. */
data class TxDraft(
    val id: Int?, val income: Boolean, val description: String, val amount: String, val date: String,
    val categoryId: Int?, val accountId: Int?, val folderId: Int?, val note: String, val receipt: String?,
)

/* ---------------- Moduler ---------------- */

data class Day(val date: String, val weekday: String, val name: String?, val cost: Double?, val source: String?, val cook: String?, val fixed: Boolean)
data class Shop(val id: String, val text: String, val done: Boolean)
data class Week(val start: String, val days: List<Day>, val cooks: List<String>, val shopping: List<Shop>, val weekCost: Double, val auto: Boolean)

data class Sub(
    val id: Int, val name: String, val plan: String?, val price: Double, val cycle: String, val nextDate: String?, val usageNote: String?,
    val lowUse: Boolean, val active: Boolean, val domain: String?, val aiShort: String?, val monthly: Double,
)
data class SubList(val items: List<Sub>, val monthly: Double, val yearly: Double, val lowUse: Double)

data class Member(val id: String, val name: String, val role: String)
data class Folder(val id: Int, val name: String, val type: String?, val address: String?, val members: List<Member>, val total: Double, val count: Int, val myRole: String?)
data class Balance(val name: String, val paid: Double, val balance: Double)
data class Entry(val id: Int, val description: String, val date: String, val amount: Double, val paidBy: String?, val split: String?, val domain: String?, val aiShort: String?, val category: String?)
data class Installment(val label: String, val due: String?, val amount: Double, val paid: Boolean)
data class Project(val id: Int, val name: String, val vendor: String?, val budget: Double, val spent: Double, val installments: List<Installment>)
data class Bill(val name: String, val category: String?, val freq: String?, val payer: String?, val lastPaid: String?, val nextDue: String?, val amount: Double?)
data class FolderDetail(val folder: Folder, val balances: List<Balance>, val entries: List<Entry>, val projects: List<Project>, val bills: List<Bill>, val categories: List<Pair<String, Double>>)

data class FinnStep(val t: String, val done: Boolean)
data class FinnDeal(val id: Int, val role: String, val item: String, val counterpart: String?, val date: String, val amount: Double, val steps: List<FinnStep>, val done: Boolean)
data class FinnList(val items: List<FinnDeal>, val bought: Double, val sold: Double, val ongoing: Int)

data class TokenInfo(val id: String, val name: String, val scopes: List<String>, val created: Long?, val lastUsed: Long?, val expires: Long?)

/* ---------------- Domener ---------------- */

data class DomainRef(val id: String, val name: String, val source: String)
data class Named(val name: String, val value: Double)
data class Country(val iso2: String, val name: String, val visitors: Double, val threats: Double)
data class Point(val t: String, val requests: Double, val cached: Double, val visitors: Double)
data class ThreatEvent(val time: String, val action: String, val country: String, val ip: String, val path: String)
data class DnsRecord(val type: String, val name: String, val content: String, val proxied: Boolean)

data class Analytics(
    val name: String, val status: String?, val plan: String?, val mock: Boolean,
    val requests: Double, val visitors: Double, val pageviews: Double, val cachedPct: Double, val bytes: Double, val uptimePct: Double,
    val sslExpires: String?, val renews: String?,
    val series: List<Point>, val liveVisitors: Double, val liveRequests: Double, val liveMb: Double, val liveSpark: List<Double>,
    val countries: List<Country>, val devices: List<Named>, val browsers: List<Named>,
    val status2xx: Double, val status3xx: Double, val status4xx: Double, val status5xx: Double,
    val ttfbP50: Double, val ttfbP95: Double, val originMs: Double, val errorPct: Double, val http: List<Named>, val tls: List<Named>,
    val threatsTotal: Double, val threatTypes: List<Named>, val events: List<ThreatEvent>,
    val sslMode: String?, val alwaysHttps: Boolean?, val minTls: String?, val dnssec: Boolean?, val botFight: Boolean?, val certExpires: String?,
    val topPages: List<Named>, val referrers: List<Named>, val uptime90: List<Double>, val dns: List<DnsRecord>,
)

/* ---------------- Parsing ---------------- */

fun color(hex: String?): Long = runCatching { 0xFF000000 or hex!!.removePrefix("#").toLong(16) }.getOrDefault(0xFFA0A0AA)

internal fun JSONObject.optStr(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() }
internal fun JSONObject.optIntOrNull(k: String): Int? = if (!has(k) || isNull(k)) null else optInt(k)
internal fun JSONObject.optDoubleOrNull(k: String): Double? = if (!has(k) || isNull(k)) null else optDouble(k).takeIf { !it.isNaN() }
internal fun JSONObject.optBoolOrNull(k: String): Boolean? = if (!has(k) || isNull(k)) null else optBoolean(k)
internal fun JSONObject.num(k: String): Double = optDouble(k, 0.0).let { if (it.isNaN()) 0.0 else it }
internal inline fun <T : Any> JSONArray.map(f: (JSONObject) -> T): List<T> = (0 until length()).mapNotNull { optJSONObject(it)?.let(f) }
internal fun JSONArray?.doubles(): List<Double> = if (this == null) emptyList() else (0 until length()).map { optDouble(it, 0.0) }
internal fun JSONArray?.strings(): List<String> = if (this == null) emptyList() else (0 until length()).map { optString(it) }
private fun JSONObject.named(k: String, valueKey: String = "pct"): List<Named> =
    optJSONArray(k)?.map { Named(it.optString("name", it.optString("path")), it.optDouble(valueKey, it.optDouble("count", 0.0))) } ?: emptyList()

fun parseBoot(s: String): Boot {
    val o = JSONObject(s)
    val st = o.optJSONObject("settings") ?: JSONObject()
    return Boot(
        Settings(st.optString("name", "Sebastian"), st.optString("provider", "ollama"), st.optBoolean("fallback"), st.optBoolean("autoCat"),
            st.optBoolean("n80"), st.optBoolean("n100"), st.optBoolean("nRc"), st.optInt("minConf", 85)),
        o.optJSONArray("categories")?.map { Category(it.getInt("id"), it.optString("name"), color(it.optString("color")), it.optString("kind")) } ?: emptyList(),
        o.optJSONArray("accounts")?.map { Account(it.getInt("id"), it.optString("name"), it.optString("type"), it.optStr("last4"), it.num("balance")) } ?: emptyList(),
        o.optInt("reviewCount"),
        o.optJSONArray("goals")?.map { Goal(it.optInt("id"), it.optString("name"), it.num("saved"), it.num("target"), color(it.optString("color", "#5FD3A8"))) } ?: emptyList(),
        o.optJSONArray("rules")?.map { Rule(it.optInt("id"), it.optString("pattern"), it.optStr("category")) } ?: emptyList(),
        o.optBoolean("restricted"),
    )
}

private fun lines(a: JSONArray?) = a?.map { it.optString("description") to it.num("amount") } ?: emptyList()

fun parseTx(o: JSONObject) = Tx(
    o.getInt("id"), o.optString("date"), o.num("amount"), o.optString("description"), o.optString("category"), o.optIntOrNull("categoryId"),
    color(o.optString("color")), o.optString("account"), o.optString("note"), o.optStr("receipt"),
    o.optStr("aiShort"), o.optStr("aiLong"), o.optStr("domain"), lines(o.optJSONArray("lines")), o.optStr("folder"),
    o.optIntOrNull("folderId"), o.optIntOrNull("accountId"), o.optStr("receiptId"), o.optStr("merchant"), o.optStr("source"),
)

fun parseTxOne(s: String): Tx? = runCatching { JSONObject(s).let { o -> parseTx(o.optJSONObject("tx") ?: o) } }.getOrNull()

fun parseTxList(s: String): List<Tx> = JSONObject(s).optJSONArray("items")?.map(::parseTx) ?: emptyList()

fun parseReceipt(o: JSONObject): Receipt = Receipt(
    o.getString("id"), o.optString("status"), o.optStr("provider"), o.optDoubleOrNull("seconds"), o.optStr("merchant"), o.optStr("date"),
    o.optDoubleOrNull("total"), o.optIntOrNull("categoryId"), o.optIntOrNull("accountId"), o.optDouble("confidence", 0.0),
    o.optStr("flag"), o.optStr("error"), o.optStr("mime"), o.optStr("file"), o.optStr("thumb"), lines(o.optJSONObject("extraction")?.optJSONArray("lines")),
    o.optJSONObject("match")?.let(::parseTx), o.optStr("aiShort"), o.optStr("domain"),
)

fun parseReceipts(s: String): List<Receipt> = JSONArray(s).map(::parseReceipt)

fun parseSummary(s: String): Summary {
    val o = JSONObject(s)
    return Summary(
        o.optString("month"), o.optString("from"), o.optString("to"), o.optInt("daysLeft", 1), o.num("inn"), o.num("ut"),
        o.num("budgetTotal"), o.num("budgetUsed"), o.num("left"), o.num("savedYear"), o.num("yearGoal"),
        o.optJSONArray("budgets")?.map {
            Budget(it.getInt("categoryId"), it.optString("category"), color(it.optString("color")), it.num("budget"), it.num("used"),
                it.optInt("count"), it.optStr("topMerchant"), it.optDoubleOrNull("prevUsed"))
        } ?: emptyList(),
        o.optJSONArray("recent")?.map(::parseTx) ?: emptyList(),
        o.optJSONArray("review")?.map(::parseReceipt) ?: emptyList(),
        o.optJSONArray("innMonthly").doubles(),
    )
}

fun parseJobs(s: String): List<Job> = JSONArray(s).map {
    Job(it.getString("id"), it.optString("name", "Fil"), it.optString("status"), it.optInt("progress"), it.optStr("merchant"), it.optDoubleOrNull("total"))
}

fun parseMe(s: String): Me {
    val o = JSONObject(s).let { it.optJSONObject("user") ?: it }
    return Me(o.optString("username"), o.optStr("name") ?: o.optStr("displayName") ?: o.optString("username"), o.optString("role", "bruker"),
        o.optBoolOrNull("totp") ?: o.optBoolOrNull("totpEnabled"), o.optStr("version"),
        o.optStr("avatarUrl"), o.optStr("serverName"), o.optBoolean("isMainAdmin"))
}

fun parseMobileHome(s: String): MobileHome {
    val o = JSONObject(s)
    val w = o.optJSONObject("weather")
    val st = o.optJSONObject("serverStatus")
    return MobileHome(
        o.optStr("name"), o.optStr("serverName"), o.optStr("avatarUrl"), o.optStr("greeting"),
        w?.let { Weather(it.optString("place", "Oslo"), it.optDoubleOrNull("temp"), it.optStr("text"), it.optDoubleOrNull("wind"), it.optDoubleOrNull("max"), it.optDoubleOrNull("min"), it.optIntOrNull("code")) },
        o.optJSONArray("shortcuts")?.map { Shortcut(it.optString("name"), it.optString("url"), it.optBoolean("local")) } ?: emptyList(),
        o.optJSONArray("ruter")?.map { r ->
            RuterLine(r.optString("from"), r.optString("to"), r.optJSONArray("departures")?.map {
                Departure(it.optString("line"), it.optStr("color")?.let(::color), it.optIntOrNull("min"), it.optStr("time"))
            } ?: emptyList())
        } ?: emptyList(),
        st?.let { ServerStatus(it.optDoubleOrNull("cpu"), it.optDoubleOrNull("mem"), it.optDoubleOrNull("disk"), it.optDoubleOrNull("temp"), it.optStr("uptimeText") ?: when (val u = it.opt("uptime")) { is Number -> uptimeLabel(u.toDouble()); is String -> u; else -> null }) },
        o.optJSONObject("layout")?.let { l -> (l.optJSONObject("mobile") ?: l).takeIf { it.has("sec") }?.let { HomeLayout.from(it) } },
    )
}

/** Oppetid i sekunder → «23 d 4 t». */
fun uptimeLabel(sec: Double): String {
    val d = (sec / 86400).toInt()
    val h = ((sec % 86400) / 3600).toInt()
    return if (d > 0) "$d d $h t" else "$h t ${((sec % 3600) / 60).toInt()} min"
}

/** Google-forslag: ["…"] eller {items|suggestions: […]}; historikk: ["…"] eller [{q}] eller {items: […]}. */
fun parseStrings(s: String): List<String> {
    val t = s.trim()
    val a = when {
        t.startsWith("[") -> JSONArray(t)
        else -> JSONObject(t).let { it.optJSONArray("items") ?: it.optJSONArray("suggestions") ?: it.optJSONArray("history") ?: JSONArray() }
    }
    return (0 until a.length()).mapNotNull { i ->
        when (val v = a.opt(i)) {
            is String -> v
            is JSONObject -> v.optStr("q") ?: v.optStr("query") ?: v.optStr("text")
            is JSONArray -> v.optString(0)
            else -> null
        }?.takeIf { it.isNotBlank() }
    }
}

fun parseLayout(s: String): HomeLayout? = runCatching { JSONObject(s).optJSONObject("mobile")?.let { HomeLayout.from(it) } }.getOrNull()

fun parseRecurring(s: String): List<Recurring> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONArray()
    return a.map { Recurring(it.optInt("id"), it.optString("name"), it.num("amount"), it.optStr("interval"), it.optIntOrNull("day"), it.optBoolean("active", true), it.optStr("category"), it.optStr("next")) }
}

fun parseStocks(s: String): Stocks {
    val o = JSONObject(s)
    val sm = o.optJSONObject("summary")
    return Stocks(
        o.optBoolean("configured", sm != null), o.optStr("status") ?: o.optStr("error"), o.optStr("env"),
        sm?.let { StockSummary(it.num("total"), it.num("invested"), it.num("value"), it.num("result"), it.num("cash"), it.num("realized")) },
        (o.optJSONArray("positions") ?: o.optJSONArray("portfolio"))?.map {
            Position(it.optString("ticker"), it.optStr("symbol") ?: it.optString("ticker"), it.optStr("name") ?: it.optString("ticker"), it.num("quantity"), it.num("avg"), it.num("price"),
                it.num("value"), it.num("pl"), it.num("plPct"), it.num("dayPct"))
        } ?: emptyList(),
        o.optJSONArray("history")?.map { it.optString("date") to it.num("value") } ?: emptyList(),
        o.optJSONArray("orders")?.map { StockOrder(it.optStr("symbol") ?: it.optString("ticker"), it.optString("side"), it.num("quantity"), it.num("value"), it.num("price"), it.optString("date")) } ?: emptyList(),
        o.optJSONArray("dividends")?.map { Dividend(it.optStr("symbol") ?: it.optString("ticker"), it.num("amount"), it.optString("date")) } ?: emptyList(),
        o.optBoolean("mock"),
    )
}

fun parseReport(s: String): Report {
    val o = JSONObject(s)
    return Report(
        o.optString("mode", "month"), o.num("total"),
        o.optJSONArray("byCategory")?.map { CatAmount(it.optString("category"), color(it.optString("color")), it.num("amount")) } ?: emptyList(),
        o.optJSONArray("merchants")?.map { MerchantAmount(it.optString("name"), it.num("amount"), it.optInt("count")) } ?: emptyList(),
        o.optJSONArray("months")?.map { MonthInOut(it.optString("month"), it.num("inn"), it.num("ut")) } ?: emptyList(),
    )
}

fun parseImport(s: String): ImportResult {
    val o = JSONObject(s)
    return ImportResult(
        o.optJSONArray("rows")?.map { ImportRow(it.optString("date"), it.optString("description"), it.optStr("raw"), it.num("amount"), it.optStr("category"), it.optStr("domain"), it.optStr("aiShort"), it.optBoolean("duplicate")) } ?: emptyList(),
        o.optInt("imported"), o.optInt("skipped"), o.optJSONArray("errors").strings(),
    )
}

fun parseAi(s: String, q: String): AiAnswer {
    val o = JSONObject(s)
    return AiAnswer(
        o.optStr("q") ?: q, o.optString("answer"),
        o.optJSONArray("hits")?.map {
            SearchHit(it.optString("type", "tx"), it.optIntOrNull("txId") ?: (if (it.optString("type", "tx") == "tx") it.optIntOrNull("id") else null),
                it.optStr("receiptId"), it.optString("description"), it.optStr("date"), it.optDoubleOrNull("amount"), it.optStr("source"), it.optStr("reason"))
        } ?: emptyList(),
        o.optStr("engine"), o.optJSONArray("suggestions").strings(),
    )
}

fun parseOriginal(s: String): Original {
    val o = JSONObject(s)
    val r = o.optJSONObject("receipt")
    val b = o.optJSONObject("bankRow")
    return Original(
        r?.let { ReceiptFile(it.optString("id"), it.optStr("mime"), it.optStr("fileUrl") ?: it.optStr("file"), it.optStr("thumbUrl") ?: it.optStr("thumb")) },
        b?.let {
            val raw = it.opt("raw")
            BankRow(it.optStr("bookingDate"), it.optStr("valueDate"), it.optStr("description"), it.optDoubleOrNull("amount"), it.optStr("account"),
                it.optStr("archiveReference"), it.optStr("source"),
                when (raw) { is String -> raw; is JSONObject -> raw.toString(2); is JSONArray -> raw.toString(2); else -> null }, it.toString(2))
        },
    )
}

fun parseWeek(s: String): Week {
    val o = JSONObject(s)
    return Week(
        o.optString("start"),
        o.optJSONArray("days")?.map { Day(it.getString("date"), it.optString("weekday"), it.optStr("name"), it.optDoubleOrNull("cost"), it.optStr("source"), it.optStr("cook"), it.optBoolean("fixed")) } ?: emptyList(),
        o.optJSONArray("cooks").strings(),
        o.optJSONArray("shopping")?.map { Shop(it.optString("id"), it.optString("text"), it.optBoolean("done")) } ?: emptyList(),
        o.num("weekCost"), o.optBoolean("auto"),
    )
}

fun parseSubs(s: String): SubList {
    val o = JSONObject(s)
    val items = o.optJSONArray("items")?.map {
        Sub(it.getInt("id"), it.optString("name"), it.optStr("plan"), it.num("price"), it.optString("cycle", "monthly"), it.optStr("nextDate"), it.optStr("usageNote"),
            it.optBoolean("lowUse"), it.optBoolean("active", true), it.optStr("domain"), it.optStr("aiShort"), it.num("monthly"))
    } ?: emptyList()
    return SubList(items, o.num("monthly"), o.num("yearly"), o.num("lowUse"))
}

private fun parseMembers(a: JSONArray?) = a?.map { Member(it.optString("id"), it.optString("name", it.optString("username")), it.optString("role", "member")) } ?: emptyList()

fun parseFolder(o: JSONObject) = Folder(
    o.getInt("id"), o.optString("name"), o.optStr("type"), o.optStr("address"), parseMembers(o.optJSONArray("members")),
    o.num("total"), o.optInt("count"), o.optStr("myRole") ?: o.optStr("role"),
)

fun parseFolders(s: String): List<Folder> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONArray()
    return a.map(::parseFolder)
}

fun parseFolderDetail(s: String): FolderDetail {
    val o = JSONObject(s)
    return FolderDetail(
        parseFolder(o),
        o.optJSONArray("balances")?.map { Balance(it.optString("name"), it.num("paid"), it.num("balance")) } ?: emptyList(),
        o.optJSONArray("entries")?.map {
            Entry(it.optInt("id"), it.optString("description"), it.optString("date"), it.num("amount"), it.optStr("paidBy"), it.optStr("split"), it.optStr("domain"), it.optStr("aiShort"), it.optStr("category"))
        } ?: emptyList(),
        o.optJSONArray("projects")?.map { p ->
            Project(p.optInt("id"), p.optString("name"), p.optStr("vendor"), p.num("budget"), p.num("spent"),
                p.optJSONArray("installments")?.map { Installment(it.optString("label"), it.optStr("due"), it.num("amount"), it.optBoolean("paid") || it.optStr("paidAt") != null) } ?: emptyList())
        } ?: emptyList(),
        o.optJSONArray("bills")?.map {
            Bill(it.optString("name"), it.optStr("category"), it.optStr("freq"), it.optStr("payer"), it.optStr("lastPaid"), it.optStr("nextDue"), it.optDoubleOrNull("amount"))
        } ?: emptyList(),
        o.optJSONArray("categories")?.map { (it.optString("name") to it.num("amount")) } ?: emptyList(),
    )
}

fun parseFinn(s: String): FinnList {
    val o = JSONObject(s)
    val items = o.optJSONArray("items")?.map { f ->
        FinnDeal(f.getInt("id"), f.optString("role"), f.optString("item"), f.optStr("counterpart"), f.optString("date"), f.num("amount"),
            f.optJSONArray("steps")?.map { FinnStep(it.optString("t"), it.optBoolean("done")) } ?: emptyList(), f.optBoolean("done"))
    } ?: emptyList()
    return FinnList(items, o.num("bought"), o.num("sold"), o.optInt("ongoing"))
}

private fun JSONObject.time(k: String): Long? = when {
    !has(k) || isNull(k) -> null
    else -> optLong(k).takeIf { it > 0 } ?: runCatching { java.time.Instant.parse(optString(k)).toEpochMilli() }.getOrNull()
}

fun parseTokens(s: String): List<TokenInfo> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONArray()
    return a.map {
        val sc = it.optJSONArray("scopes")?.strings() ?: it.optString("scopes").split(' ').filter(String::isNotBlank)
        TokenInfo(it.optString("id"), it.optString("name"), sc, it.time("created"), it.time("lastUsed") ?: it.time("last_used"), it.time("expires") ?: it.time("expiresAt"))
    }
}

fun parseDomains(s: String): List<DomainRef> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONArray()
    return a.map { DomainRef(it.optString("id", it.optString("name")), it.optString("name"), it.optString("source", "cloudflare")) }
}

fun parseAnalytics(s: String): Analytics {
    val o = JSONObject(s)
    val live = o.optJSONObject("live") ?: JSONObject()
    val st = o.optJSONObject("statusCodes") ?: o.optJSONObject("status") ?: JSONObject()
    val ttfb = o.optJSONObject("ttfb") ?: JSONObject()
    val th = o.optJSONObject("threats") ?: JSONObject()
    val sec = o.optJSONObject("security") ?: JSONObject()
    return Analytics(
        o.optString("name"), o.optStr("status"), o.optStr("plan"), o.optBoolean("mock"),
        o.num("requests"), o.num("visitors"), o.num("pageviews"), o.num("cachedPct"), o.num("bytes"), o.num("uptimePct"),
        o.optStr("sslExpires"), o.optStr("renews"),
        o.optJSONArray("series")?.map { Point(it.optString("t"), it.num("requests"), it.num("cached"), it.num("visitors")) } ?: emptyList(),
        live.num("visitors"), live.num("requests"), live.num("mb"), live.optJSONArray("spark").doubles(),
        o.optJSONArray("countries")?.map { Country(it.optString("iso2"), it.optString("name"), it.num("visitors"), it.num("threats")) } ?: emptyList(),
        o.named("devices"), o.named("browsers"),
        st.num("2xx"), st.num("3xx"), st.num("4xx"), st.num("5xx"),
        ttfb.num("p50"), ttfb.num("p95"), o.num("originMs"), o.num("errorPct"), o.named("http"), o.named("tls"),
        th.num("total"), th.named("types", "count"),
        th.optJSONArray("events")?.map { ThreatEvent(it.optString("time"), it.optString("action"), it.optString("country"), it.optString("ip"), it.optString("path")) } ?: emptyList(),
        sec.optStr("sslMode"), sec.optBoolOrNull("alwaysHttps"), sec.optStr("minTls"), sec.optBoolOrNull("dnssec"), sec.optBoolOrNull("botFight"), sec.optStr("certExpires"),
        o.optJSONArray("topPages")?.map { Named(it.optString("path"), it.num("count")) } ?: emptyList(),
        o.optJSONArray("referrers")?.map { Named(it.optString("name"), it.num("count")) } ?: emptyList(),
        o.optJSONArray("uptime90").doubles(),
        o.optJSONArray("dns")?.map { DnsRecord(it.optString("type"), it.optString("name"), it.optString("content"), it.optBoolean("proxied")) } ?: emptyList(),
    )
}
