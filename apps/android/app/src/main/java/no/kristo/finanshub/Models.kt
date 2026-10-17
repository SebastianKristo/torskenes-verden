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

data class Boot(val settings: Settings, val categories: List<Category>, val accounts: List<Account>, val reviewCount: Int)

data class Tx(
    val id: Int, val date: String, val amount: Double, val description: String, val category: String, val categoryId: Int?,
    val color: Long, val account: String, val note: String, val receipt: String?,
    val aiShort: String? = null, val aiLong: String? = null, val domain: String? = null,
    val lines: List<Pair<String, Double>> = emptyList(), val folder: String? = null,
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

/** Innlogget bruker på serveren (GET /finans/api/me). */
data class Me(val username: String, val name: String, val role: String, val totp: Boolean?, val version: String?)

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
    )
}

private fun lines(a: JSONArray?) = a?.map { it.optString("description") to it.num("amount") } ?: emptyList()

fun parseTx(o: JSONObject) = Tx(
    o.getInt("id"), o.optString("date"), o.num("amount"), o.optString("description"), o.optString("category"), o.optIntOrNull("categoryId"),
    color(o.optString("color")), o.optString("account"), o.optString("note"), o.optStr("receipt"),
    o.optStr("aiShort"), o.optStr("aiLong"), o.optStr("domain"), lines(o.optJSONArray("lines")), o.optStr("folder"),
)

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
    val o = JSONObject(s)
    return Me(o.optString("username"), o.optString("name", o.optString("username")), o.optString("role", "bruker"),
        o.optBoolOrNull("totp") ?: o.optBoolOrNull("totpEnabled"), o.optStr("version"))
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
