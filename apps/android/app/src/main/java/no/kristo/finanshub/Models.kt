package no.kristo.finanshub

import java.time.Instant
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
    /** ISO2: om brukeren kan endre serveroppsettet (AI-motorer, modeller, tidsgrenser, SMB). null = eldre server uten feltet. */
    val canEditServer: Boolean? = null,
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

data class Job(val id: String, val name: String, val status: String, val progress: Int, val merchant: String?, val total: Double?, val statusText: String? = null)

data class Receipt(
    val id: String, val status: String, val provider: String?, val seconds: Double?, val merchant: String?, val date: String?,
    val total: Double?, val categoryId: Int?, val accountId: Int?, val confidence: Double, val flag: String?, val error: String?,
    val mime: String?, val file: String?, val thumb: String?, val lines: List<Pair<String, Double>>, val match: Tx?,
    val aiShort: String? = null, val domain: String? = null,
    /** Serveren sier at «✦ Analyser på nytt med Gemini» kan brukes (feil, lav sikkerhet eller usikker Ollama). */
    val canReanalyze: Boolean = false, val reanalyzeReason: String? = null,
    /** Prompt 51 (Receipt51.kt): kilden til butikknavnet (orgnr | known | model | user), merkelappen og OCR-radene. */
    val merchantSource: String? = null, val merchantLabel: String? = null, val ocrRaw: OcrRaw51? = null,
)

/** Én tolkning av en kvittering (forrige eller ny fra Gemini) i sammenligningen. */
data class ReExtract(val merchant: String?, val date: String?, val total: Double?, val items: List<Pair<String, Double>>, val confidence: Double?, val engine: String?)

data class Reanalysis(val receiptId: String, val previous: ReExtract, val result: ReExtract, val candidateId: String)

private fun parseReExtract(o: JSONObject?): ReExtract = ReExtract(
    o?.optStr("merchant"), o?.optStr("date"), o?.optDoubleOrNull("total"),
    (o?.optJSONArray("items") ?: o?.optJSONArray("lines"))?.map { (it.optStr("name") ?: it.optStr("description") ?: it.optString("text")) to it.num(if (it.has("amount")) "amount" else "price") } ?: emptyList(),
    o?.optDoubleOrNull("confidence"), o?.optStr("engine") ?: o?.optStr("provider"),
)

fun parseReanalysis(id: String, s: String): Reanalysis {
    val o = JSONObject(s)
    return Reanalysis(id, parseReExtract(o.optJSONObject("previous")), parseReExtract(o.optJSONObject("result")), o.optString("candidateId"))
}

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

data class StoreHit(val name: String, val count: Int, val last: String?)

/** Svar fra ✦ AI-søk (POST /search/ai) eller vanlig søk (GET /search, mode = «plain»). */
data class AiAnswer(
    val q: String, val answer: String, val hits: List<SearchHit>, val engine: String?, val suggestions: List<String>,
    val followUps: List<String> = emptyList(), val mode: String? = null, val interpreted: String? = null,
    val stores: List<StoreHit> = emptyList(), val aiUnavailable: Boolean = false,
    /** Vanlig søk ga treff for 1–2 ord, så AI ble ikke brukt («✦ Spør AI likevel» sender force). */
    val plainFirst: Boolean = false, val notice: String? = null,
)

/** Forslagsgrupper til søket (GET /search/suggestions). */
data class SuggestGroup(val title: String, val items: List<String>)

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

data class Day(
    val date: String, val weekday: String, val name: String?, val cost: Double?, val source: String?, val cook: String?, val fixed: Boolean,
    val dishId: String? = null, val today: Boolean = false, val tag: String? = null, val bestCook: String? = null, val ingredients: List<String> = emptyList(),
)

data class Dish(
    val id: String, val name: String, val src: String?, val ing: List<String>, val steps: List<String>, val cost: Double, val days: List<Int>,
    /** Mat (prompt 13): mappe, kilde-URL, bilde, lenker og filer, tid og porsjoner. */
    val folderId: String? = null, val sourceUrl: String? = null, val image: String? = null, val links: List<DishLink> = emptyList(),
    val time: String? = null, val servings: String? = null,
)

data class Shop(val id: String, val text: String, val done: Boolean)

data class Week(
    val start: String, val days: List<Day>, val cooks: List<String>, val shopping: List<Shop>, val weekCost: Double, val auto: Boolean,
    val end: String? = null, val week: Int? = null, val dishes: List<Dish> = emptyList(),
)

data class Sub(
    val id: Int, val name: String, val plan: String?, val price: Double, val cycle: String, val nextDate: String?, val usageNote: String?,
    val lowUse: Boolean, val active: Boolean, val domain: String?, val aiShort: String?, val monthly: Double,
)

data class SubList(val items: List<Sub>, val monthly: Double, val yearly: Double, val lowUse: Double)

data class Member(val id: String, val name: String, val role: String)

data class Folder(val id: Int, val name: String, val type: String?, val address: String?, val members: List<Member>, val total: Double, val count: Int, val myRole: String?)

data class Balance(val name: String, val paid: Double, val balance: Double)

data class Entry(val id: Int, val description: String, val date: String, val amount: Double, val paidBy: String?, val split: String?, val domain: String?, val aiShort: String?, val category: String?,
    val subcategory: String? = null, val aiCategory: Boolean = false) {
    /** «Kategori › Underkategori», med ✦ når AI har laget kategorien. */
    val categoryPath: String? get() = category?.let { c -> (if (aiCategory) "✦ " else "") + (subcategory?.let { "$c › $it" } ?: c) }
}

/** Boligkategori med underkategorier (GET /finans/api/boliger/categories). */
data class CategoryShare(val name: String, val amount: Double, val children: List<Pair<String, Double>>)

data class Installment(val label: String, val due: String?, val amount: Double, val paid: Boolean)

data class Project(val id: Int, val name: String, val vendor: String?, val budget: Double, val spent: Double, val installments: List<Installment>)

data class Bill(val name: String, val category: String?, val freq: String?, val payer: String?, val lastPaid: String?, val nextDue: String?, val amount: Double?)

data class FolderDetail(val folder: Folder, val balances: List<Balance>, val entries: List<Entry>, val projects: List<Project>, val bills: List<Bill>, val categories: List<CategoryShare>)

data class FinnStep(val t: String, val done: Boolean, val date: String? = null)

data class FinnDeal(
    val id: Int, val role: String, val item: String, val counterpart: String?, val date: String, val amount: Double, val steps: List<FinnStep>, val done: Boolean,
    /** Finn-koden, forsidebildet (egne bilder eller annonsens), sammendraget («5 e-poster · kvittering ✓ …») og ev. steg 1–4 fra serveren. */
    val code: String? = null, val image: String? = null, val summary: String? = null, val stage: Int? = null, val next: String? = null,
    /** Lagret finn.no-lenke til annonsen. */
    val adUrl: String? = null,
) {
    val sold get() = role == "sold"
    /** Sporingspunktene: Betalt → Sendt → Mottatt → Godkjent ved kjøp, Solgt → Sendt → Levert → Utbetalt ved salg. */
    val points get() = if (sold) listOf("Solgt", "Sendt", "Levert", "Utbetalt") else listOf("Betalt", "Sendt", "Mottatt", "Godkjent")
    /** Hvor langt handelen har kommet (1–4). Serverens «stage» brukes hvis den finnes, ellers tolkes stegene. */
    val level: Int get() {
        stage?.let { return it.coerceIn(1, 4) }
        if (done) return 4
        val ok = steps.filter { it.done }.joinToString(" ") { it.t.lowercase() }
        return when {
            Regex("godkjent|utbetalt|fullført").containsMatchIn(ok) -> 4
            Regex("levert|mottatt|hentet").containsMatchIn(ok) -> 3
            Regex("sendt|på vei").containsMatchIn(ok) -> 2
            else -> 1
        }
    }
    val finished get() = level >= 4
    val nextText: String get() = next ?: if (sold) listOf("Send pakken innen 5 dager", "Venter på levering", "Utbetaling innen 1 dag", "Fullført")[level - 1]
        else listOf("Venter på at selger sender", "Pakken er på vei til deg", "Godkjenn varen innen 24 t", "Fullført")[level - 1]
    val status get() = if (finished) "Fullført" else points[level - 1]
}

data class FinnList(val items: List<FinnDeal>, val bought: Double, val sold: Double, val ongoing: Int)

data class FinnAd(val url: String?, val title: String?, val price: Double?, val place: String?, val description: String?, val images: List<String>, val saved: String?)

data class FinnFile(val id: String, val name: String, val mime: String?, val url: String?, val thumb: String?)

data class FinnMail(val id: String, val date: String?, val from: String?, val subject: String?, val snippet: String?, val body: String?)

data class FinnLine(val label: String, val amount: Double)

data class FinnDetail(val deal: FinnDeal, val ad: FinnAd?, val receipts: List<FinnFile>, val emails: List<FinnMail>, val photos: List<FinnFile>, val summary: String?, val lines: List<FinnLine>,
    /** Kvitteringen: total og «Betalt»/«Utbetalt» fra serveren; annonselenken serveren har funnet i e-postene. */
    val total: Double? = null, val totalLabel: String? = null, val adUrlGuess: String? = null,
    /** Fiks ferdig: sendingen fra Sporing (status og hendelser vises i tidslinjen). */
    val shipment: Shipment? = null) {
    /** Bildene i karusellen: egne bilder først, så annonsens. */
    val images: List<String> get() = photos.mapNotNull { it.url ?: it.thumb } + (ad?.images ?: emptyList())
}

data class TokenInfo(val id: String, val name: String, val scopes: List<String>, val created: Long?, val lastUsed: Long?, val expires: Long?)

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
        o.optBoolOrNull("canEditServer") ?: st.optBoolOrNull("canEditServer"),
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
    o.optBoolean("canReanalyze", false), o.optStr("reanalyzeReason") ?: o.optStr("reason"),
    merchantSource = o.optStr("merchant_source"), merchantLabel = o.optStr("merchant_label"), ocrRaw = parseOcrRaw51(o.optJSONObject("ocr_raw")),
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
    Job(it.getString("id"), it.optString("name", "Fil"), it.optString("status"), it.optInt("progress"), it.optStr("merchant"), it.optDoubleOrNull("total"), it.optStr("statusText"))
}

fun parseMe(s: String): Me {
    val o = JSONObject(s).let { it.optJSONObject("user") ?: it }
    return Me(o.optString("username"), o.optStr("name") ?: o.optStr("displayName") ?: o.optString("username"), o.optString("role", "bruker"),
        o.optBoolOrNull("totp") ?: o.optBoolOrNull("totpEnabled"), o.optStr("version"),
        // Prompt 39: avatar:{url, url192, hash} (signert URL) eller avatarUrl som før.
        o.optJSONObject("avatar")?.optStr("url") ?: o.optStr("avatarUrl"), o.optStr("serverName"), o.optBoolean("isMainAdmin"))
}

fun parseMobileHome(s: String): MobileHome {
    val o = JSONObject(s)
    val w = o.optJSONObject("weather")
    val st = o.optJSONObject("serverStatus")
    return MobileHome(
        o.optStr("name"), o.optStr("serverName"), o.optStr("avatarUrl"), o.optStr("greeting"),
        w?.let { Weather(it.optString("place", "Oslo"), it.optDoubleOrNull("temp"), it.optStr("text"), it.optDoubleOrNull("wind"), it.optDoubleOrNull("max"), it.optDoubleOrNull("min"), it.optIntOrNull("code"),
            it.optDoubleOrNull("lat"), it.optDoubleOrNull("lon") ?: it.optDoubleOrNull("lng")) },
        o.optJSONArray("shortcuts")?.map { Shortcut(it.optString("name"), it.optString("url"), it.optBoolean("local")) } ?: emptyList(),
        o.optJSONArray("ruter")?.map { r ->
            RuterLine(r.optString("from"), r.optString("to"), r.optJSONArray("departures")?.map {
                Departure(it.optString("line"), it.optStr("color")?.let(::color), it.optIntOrNull("min") ?: it.optIntOrNull("minutes"), it.optStr("time"), it.optStr("to") ?: it.optStr("destination"),
                    it.optStr("textColor")?.let(::hexColor), it.optStr("mode"))
            } ?: emptyList())
        } ?: emptyList(),
        st?.let { ServerStatus(it.optDoubleOrNull("cpu"), it.optDoubleOrNull("mem"), it.optDoubleOrNull("disk"), it.optDoubleOrNull("temp"), it.optStr("uptimeText") ?: when (val u = it.opt("uptime")) { is Number -> uptimeLabel(u.toDouble()); is String -> u; else -> null }) },
        o.optJSONObject("layout")?.let { l -> (l.optJSONObject("mobile") ?: l).takeIf { it.has("sec") }?.let { HomeLayout.from(it) } },
        packages = o.optJSONArray("packages")?.map(::parseShipment),
        weatherX = w?.let(::parseWeatherX),
        packagesTotal = o.optIntOrNull("packagesTotal") ?: o.optIntOrNull("packagesActive"),
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
        o.optJSONArray("followUps").strings(), o.optStr("mode"), o.opt("interpreted") as? String,
        o.optJSONArray("stores")?.map { StoreHit(it.optString("name"), it.optInt("count"), it.optStr("last")) } ?: emptyList(),
        o.optBoolean("aiUnavailable"),
        plainFirst = o.optBoolean("plainFirst"), notice = o.optStr("notice"),
    )
}

/** Vanlig søk (GET /search): som AI-svaret, men oppsummeringen ligger i «summary». */
fun parsePlain(s: String, q: String): AiAnswer {
    val a = parseAi(s, q)
    val o = JSONObject(s)
    return a.copy(answer = a.answer.ifBlank { o.optString("summary") }, mode = a.mode ?: "plain")
}

fun parseSuggestGroups(s: String): List<SuggestGroup> =
    JSONObject(s).optJSONArray("groups")?.map { SuggestGroup(it.optString("title"), it.optJSONArray("items").strings().filter(String::isNotBlank)) }
        ?.filter { it.items.isNotEmpty() } ?: emptyList()

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
        o.optJSONArray("days")?.map {
            Day(it.getString("date"), it.optString("weekday"), it.optStr("name"), it.optDoubleOrNull("cost"), it.optStr("source"), it.optStr("cook"), it.optBoolean("fixed"),
                it.optStr("dishId"), it.optBoolean("today"), it.optStr("tag"), it.optStr("bestCook"), it.optJSONArray("ingredients").strings().filter(String::isNotBlank))
        } ?: emptyList(),
        o.optJSONArray("cooks").strings(),
        o.optJSONArray("shopping")?.map { Shop(it.optString("id"), it.optString("text"), it.optBoolean("done")) } ?: emptyList(),
        o.num("weekCost"), o.optBoolean("auto"),
        o.optStr("end"), o.optIntOrNull("week"),
        o.optJSONArray("dishes")?.map {
            Dish(it.optString("id"), it.optString("name"), it.optStr("src"), (it.optJSONArray("ing") ?: it.optJSONArray("ingredients")).strings().filter(String::isNotBlank),
                it.optJSONArray("steps").strings().filter(String::isNotBlank), it.num("cost"),
                it.optJSONArray("days")?.let { a -> (0 until a.length()).map { i -> a.optInt(i) } } ?: emptyList(),
                if (it.has("folderId") && !it.isNull("folderId")) it.opt("folderId").toString() else null,
                it.optStr("sourceUrl"), it.optStr("image"), parseDishLinks(it.optJSONArray("links")),
                if (it.has("time") && !it.isNull("time")) it.opt("time").toString() else null,
                if (it.has("servings") && !it.isNull("servings")) it.opt("servings").toString() else null)
        } ?: emptyList(),
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
    (if (o.has("total")) o.num("total") else o.num("yearTotal")), o.optInt("count"), o.optStr("myRole") ?: o.optStr("role"),
)

fun parseFolders(s: String): List<Folder> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONArray()
    return a.map(::parseFolder)
}

private fun JSONObject.sumOrAmount(): Double = if (has("sum")) num("sum") else num("amount")

fun parseFolderDetail(s: String): FolderDetail {
    val o = JSONObject(s)
    return FolderDetail(
        parseFolder(o),
        o.optJSONArray("balances")?.map { Balance(it.optString("name"), it.num("paid"), it.num("balance")) } ?: emptyList(),
        o.optJSONArray("entries")?.map {
            // «category» kan være et navn eller «Kategori › Underkategori»; «subcategory» er valgfri.
            val raw = it.optStr("categoryPath") ?: it.optStr("category") ?: it.optJSONObject("category")?.optStr("name")
            val parts = raw?.split("›")?.map { p -> p.trim() }?.filter { p -> p.isNotEmpty() } ?: emptyList()
            Entry(it.optInt("id"), it.optString("description"), it.optString("date"), it.num("amount"), it.optStr("paidBy"), it.optStr("split"), it.optStr("domain"), it.optStr("aiShort"),
                parts.firstOrNull(), it.optStr("subcategory") ?: parts.getOrNull(1), it.optBoolean("categoryAi", it.optBoolean("aiCategory")))
        } ?: emptyList(),
        o.optJSONArray("projects")?.map { p ->
            Project(p.optInt("id"), p.optString("name"), p.optStr("vendor"), p.num("budget"), p.num("spent"),
                p.optJSONArray("installments")?.map { Installment(it.optString("label"), it.optStr("due"), it.num("amount"), it.optBoolean("paid") || it.optStr("paidAt") != null) } ?: emptyList())
        } ?: emptyList(),
        o.optJSONArray("bills")?.map {
            Bill(it.optString("name"), it.optStr("category"), it.optStr("freq"), it.optStr("payer"), it.optStr("lastPaid"), it.optStr("nextDue"), it.optDoubleOrNull("amount"))
        } ?: emptyList(),
        // Kategorikortet: {name, sum, subs: [{name, sum}]} (eldre servere: amount og children).
        o.optJSONArray("categories")?.map { c ->
            CategoryShare(c.optString("name"), c.sumOrAmount(),
                (c.optJSONArray("subs") ?: c.optJSONArray("children") ?: c.optJSONArray("subcategories"))?.map { k -> k.optString("name") to k.sumOrAmount() } ?: emptyList())
        } ?: emptyList(),
    )
}

/** «summary» er {text, emails, receipts …} fra serveren, eller ren tekst. */
private fun JSONObject.summaryText(): String? = optJSONObject("summary")?.optStr("text") ?: if (optJSONObject("summary") == null) optStr("summary") else null

internal fun parseFinnDeal(f: JSONObject): FinnDeal {
    val img = f.optStr("image") ?: f.optStr("cover") ?: f.optStr("thumb")
        ?: f.optJSONArray("photos")?.optJSONObject(0)?.let { it.optStr("thumb") ?: it.optStr("url") }
        ?: f.optJSONObject("ad")?.optJSONArray("images")?.optString(0)?.takeIf { it.isNotBlank() }
    return FinnDeal(f.optInt("id"), f.optString("role"), f.optString("item", f.optString("title")), f.optStr("counterpart"), f.optString("date"), f.num("amount"),
        f.optJSONArray("steps")?.map { FinnStep(it.optString("t", it.optString("title")), it.optBoolean("done"), it.optStr("date")) } ?: emptyList(), f.optBoolean("done"),
        f.optStr("code") ?: f.optStr("finnCode") ?: f.optStr("finnkode") ?: f.optStr("order_id"), img,
        f.summaryText(), f.optIntOrNull("stage")?.takeIf { it in 1..4 }, f.optStr("next"), f.optStr("adUrl"))
}

fun parseFinn(s: String): FinnList {
    val o = JSONObject(s)
    val items = o.optJSONArray("items")?.map(::parseFinnDeal) ?: emptyList()
    return FinnList(items, o.num("bought"), o.num("sold"), o.optInt("ongoing"))
}

private fun JSONObject.finnFile(i: Int): FinnFile = FinnFile(optStr("id") ?: "$i", optStr("name") ?: optStr("filename") ?: "fil", optStr("mime"), optStr("url"), optStr("thumb"))

/** GET /finans/api/finn/:id – handelen med annonse, kvitteringer, e-poster og bilder. Ukjente felt hoppes over. */
fun parseFinnDetail(s: String): FinnDetail {
    val o = JSONObject(s)
    val d = o.optJSONObject("deal") ?: o
    val deal = parseFinnDeal(d)
    val ad = o.optJSONObject("ad")?.let { a ->
        FinnAd(a.optStr("url"), a.optStr("title"), a.optDoubleOrNull("price"), a.optStr("place") ?: a.optStr("location"), a.optStr("description"),
            a.optJSONArray("images")?.let { arr -> (0 until arr.length()).mapNotNull { i -> arr.optString(i).takeIf { it.isNotBlank() } ?: arr.optJSONObject(i)?.optStr("url") } } ?: emptyList(),
            a.optStr("saved") ?: a.optStr("fetched") ?: a.optStr("created"))
    }
    var i = 0
    val files = { k: String -> o.optJSONArray(k)?.map { it.finnFile(i++) } ?: emptyList() }
    val receipts = files("receipts")
    val photos = files("photos")
    val mails = o.optJSONArray("emails")?.map { m ->
        FinnMail(m.optStr("id") ?: "${i++}", m.optStr("date"), m.optStr("from"), m.optStr("subject"), m.optStr("snippet"), m.optStr("body") ?: m.optStr("text"))
    } ?: emptyList()
    // Kvitteringen: {receipt: {lines: [{l, v}], total, totalLabel}} (eller lines: [{label, amount}]).
    val rc = o.optJSONObject("receipt")
    val lines = (o.optJSONArray("lines") ?: rc?.optJSONArray("lines"))?.map {
        FinnLine(it.optStr("label") ?: it.optStr("l") ?: it.optStr("description") ?: "", if (it.has("amount")) it.num("amount") else it.num("v"))
    } ?: emptyList()
    return FinnDetail(deal, ad, receipts, mails, photos, o.summaryText() ?: deal.summary, lines,
        rc?.optDoubleOrNull("total"), rc?.optStr("totalLabel"), o.optStr("adUrlGuess"), o.optJSONObject("shipment")?.let(::parseShipment))
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
        o.optJSONArray("countries")?.map { Country(it.optString("iso2"), it.optString("name"), it.num("visitors"), it.num("threats"), it.optIntOrNull("iso3n") ?: it.optStr("iso3n")?.toIntOrNull()) } ?: emptyList(),
        o.named("devices"), o.named("browsers"),
        st.num("2xx"), st.num("3xx"), st.num("4xx"), st.num("5xx"),
        ttfb.num("p50"), ttfb.num("p95"), o.num("originMs"), o.num("errorPct"), o.named("http"), o.named("tls"),
        th.num("total"), th.named("types", "count"),
        th.optJSONArray("events")?.map { ThreatEvent(it.optString("time"), it.optString("action"), it.optString("country"), it.optString("ip"), it.optString("path")) } ?: emptyList(),
        sec.optStr("sslMode"), sec.optBoolOrNull("alwaysHttps"), sec.optStr("minTls"), sec.optBoolOrNull("dnssec"), sec.optBoolOrNull("botFight"), sec.optStr("certExpires"),
        o.optJSONArray("topPages")?.map { Named(it.optString("path"), it.num("count")) } ?: emptyList(),
        o.optJSONArray("referrers")?.map { Named(it.optString("name"), it.num("count")) } ?: emptyList(),
        // null = ingen målinger den dagen → -1
        o.optJSONArray("uptime90")?.let { u -> (0 until u.length()).map { if (u.isNull(it)) -1.0 else u.optDouble(it, -1.0) } } ?: emptyList(),
        o.optJSONArray("dns")?.map { DnsRecord(it.optString("type"), it.optString("name"), it.optString("content"), it.optBoolean("proxied")) } ?: emptyList(),
        o.optStr("registrar"), o.optJSONArray("nameServers").strings().filter(String::isNotBlank), o.optStr("source"),
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

/* ---------------- Prompt 14: hjelpere for Papir (farger, transportører, Finn og Sporing) ---------------- */

/** Filtrene i Papir → Finn. */
val FINN_SEGS: List<Pair<String, String>> = listOf("all" to "Alle", "way" to "På vei", "bought" to "Kjøpt", "sold" to "Solgt", "done" to "Fullført")

fun finnSegMatch(seg: String, d: FinnDeal): Boolean = when (seg) {
    "way" -> d.level in 2..3
    "bought" -> !d.sold
    "sold" -> d.sold
    "done" -> d.finished
    else -> true
}

/**
 * Fanene Økonomi-linja kan ha (opptil 4, «Mer» er alltid sist). Fase 6 (Q3, Q4): samme navn som på web, Transaksjoner (ikke
 * «Liste»), Glimt (ikke «Søk») og Faste betalinger. Nøklene er de samme som før, så lagrede oppsett virker.
 */
val FIN_TABS: List<Pair<String, String>> = listOf(
    "oversikt" to "Oversikt", "liste" to "Transaksjoner", "budsjett" to "Budsjett", "abo" to "Faste betalinger",
    "finn" to "Finn", "sok" to "Glimt", "kvitt" to "Kvitteringer", "aksjer" to "Aksjer", "kontoer" to "Kontoer",
    "boliger" to "Boliger", "chat" to "Chat",
)

/** Standard: Oversikt, Transaksjoner, Budsjett og Faste betalinger (+ Mer), som på web. */
val FIN_TABS_DEFAULT = listOf("oversikt", "liste", "budsjett", "abo")

/** Standarden før Fase 6. Et lagret oppsett som er lik den, er ikke valgt av brukeren og følger den nye standarden. */
val FIN_TABS_GAMMEL = listOf("oversikt", "liste", "finn", "sok")

/** Lagret Økonomi-linje → det som vises: serverens nøkler (abonnementer, kvitteringer) løses opp, og den gamle standarden flyttes. */
fun normFinTabs(l: List<String>): List<String> {
    val v = l.map { finKey24(it) }.filter { k -> FIN_TABS.any { it.first == k } }.distinct().take(5)
    return if (v == FIN_TABS_GAMMEL) FIN_TABS_DEFAULT else v
}

/* ---------------- Transaksjonsdetaljer (GET /transactions/:id) ---------------- */

data class TxReceipt(val id: String?, val status: String, val fileUrl: String?, val mime: String?, val lines: List<Pair<String, Double>>, val total: Double?, val aiSummary: String?)

data class TxBank(val bookingDate: String?, val valueDate: String?, val description: String?, val message: String?, val amount: Double?, val account: String?, val archiveReference: String?)

data class TxDetail(val tx: Tx, val aiSummary: String?, val receipt: TxReceipt?, val bank: TxBank?)

fun parseTxDetail(s: String): TxDetail {
    val o = JSONObject(s)
    val t = parseTx(o.optJSONObject("tx") ?: o)
    val r = o.optJSONObject("receipt")?.let { r ->
        val lines = r.optJSONArray("lines")?.map { (it.optStr("name") ?: it.optString("description")) to it.num("price").let { p -> if (p == 0.0) it.num("amount") else p } } ?: emptyList()
        TxReceipt(r.optStr("id"), r.optStr("status") ?: "attached", r.optStr("fileUrl"), r.optStr("mime"), lines, r.optDoubleOrNull("total"), r.optStr("aiSummary"))
    }
    val b = o.optJSONObject("bank")?.let { b ->
        TxBank(b.optStr("bookingDate"), b.optStr("valueDate"), b.optStr("description"), b.optStr("message"), b.optDoubleOrNull("amount"), b.optStr("account"), b.optStr("archiveReference"))
    }
    return TxDetail(t, o.optStr("aiSummary") ?: t.aiLong ?: t.aiShort, r, b)
}

/** Skjermene Finans-fanene kan åpne. Tilbake fra en av dem går til Homelab (Mer går til Finans → Mer). */
val PAPER_FIN_SCREENS = setOf(Screen.Home, Screen.List, Screen.Finn, Screen.Budget, Screen.Scan, Screen.Stocks, Screen.Sub, Screen.Accounts, Screen.Folders)

fun finTabScreen(k: String): Screen? = when (k) {
    "oversikt" -> Screen.Home; "liste" -> Screen.List; "finn" -> Screen.Finn; "budsjett" -> Screen.Budget; "kvitt" -> Screen.Scan
    "aksjer" -> Screen.Stocks; "abo" -> Screen.Sub; "kontoer" -> Screen.Accounts; "boliger" -> Screen.Folders
    else -> null
}

/* ---------- Boliger: kommende forfall og kvitteringer (GET /folders/:id, nyere server) ---------- */

data class FolderUpcoming(val kind: String, val title: String, val sub: String?, val amount: Double?, val date: String?, val days: Int?, val color: Long?)

data class FolderReceipt(val entryId: Int?, val receiptId: Int?, val description: String, val date: String, val amount: Double, val pending: Boolean, val category: String?, val thumbUrl: String?, val fileUrl: String?)

data class FolderExtra(val upcoming: List<FolderUpcoming>, val receipts: List<FolderReceipt>)

fun parseFolderExtra(s: String): FolderExtra {
    val o = JSONObject(s)
    val up = o.optJSONArray("upcoming") ?: JSONArray()
    val rc = o.optJSONArray("receipts") ?: JSONArray()
    return FolderExtra(
        (0 until up.length()).mapNotNull { i ->
            val u = up.optJSONObject(i) ?: return@mapNotNull null
            FolderUpcoming(u.optStr("kind") ?: "bill", u.optStr("title") ?: "", u.optStr("sub"), u.optDoubleOrNull("amount"), u.optStr("date"), u.optIntOrNull("days"), u.optStr("color")?.let(::color))
        },
        (0 until rc.length()).mapNotNull { i ->
            val r = rc.optJSONObject(i) ?: return@mapNotNull null
            FolderReceipt(r.optIntOrNull("entryId"), r.optIntOrNull("receiptId"), r.optStr("description") ?: "Kvittering", r.optStr("date") ?: "", r.num("amount"),
                r.optBoolean("pending", false), r.optStr("category"), r.optStr("thumbUrl"), r.optStr("fileUrl"))
        },
    )
}

/* ---------- Bolig-widget på Hjem ---------- */

data class HomeBolig(val id: String, val name: String, val spent: Double, val budget: Double?, val review: Int, val nextTitle: String?, val nextAmount: Double?, val nextDate: String?)

/* ---------- Finans-flisene: farge per flis og rekkefølge ---------- */

/** Ikonfarge per flis (tonet bakgrunn = samme farge med lav alfa). */
val FM_COLORS: Map<String, Long> = mapOf(
    // Prompt 21 (designet, fmtiles): Budsjett, Kvitteringer, Faste, Kontoer, Aksjer, Rapporter, Subscription OS, Boliger,
    // Import, Finn, Søk og Innstillinger.
    "budsjett" to 0xFFC0562A, "kvitt" to 0xFFB23A2A, "faste" to 0xFF7A5AD6, "kontoer" to 0xFF2B5D8A,
    "aksjer" to 0xFF2F7D4F, "rapp" to 0xFFA8661A, "abo" to 0xFFC2417A, "boliger" to 0xFF3F7A6E,
    "fimport" to 0xFF4A5BBF, "finn" to 0xFF2B6CB0, "sok" to 0xFF7A3B6B, "innst" to 0xFF6B6558, "liste" to 0xFF5A5246,
    "plan" to 0xFF2F7A4F, // prompt 51 (ANDFEAT51): Planlegging
)

val FM_DEFAULT_ORDER = listOf("sok", "liste", "finn", "budsjett", "kvitt", "faste", "kontoer", "plan", "aksjer", "rapp", "abo", "boliger", "fimport", "innst")

/** Lagret rekkefølge + nye fliser bakerst; ukjente nøkler fjernes. */
fun normalizeFmOrder(saved: List<String>): List<String> = saved.filter { it in FM_DEFAULT_ORDER }.distinct() + FM_DEFAULT_ORDER.filter { it !in saved }

/* ---------- Logoregisteret ---------- */

data class LogoRegItem(val id: String, val name: String, val domain: String?, val alias: List<String>, val category: String?, val color: Long?, val hasFile: Boolean)

fun parseLogoRegistry(s: String): List<LogoRegItem> {
    val o = JSONObject(s)
    val a = o.optJSONArray("items") ?: JSONArray()
    return (0 until a.length()).mapNotNull { i ->
        val x = a.optJSONObject(i) ?: return@mapNotNull null
        val id = x.optStr("id") ?: return@mapNotNull null
        LogoRegItem(id, x.optStr("navn") ?: id, x.optStr("domene"), x.optJSONArray("alias").strings().filter { it.isNotBlank() },
            x.optStr("kategori"), x.optStr("farge")?.let(::color), x.optBoolean("hasFile", false))
    }
}

/** Normalisert nøkkel for oppslag på navn: små bokstaver, æøå/ü forenklet, bare bokstaver og tall. */
fun logoKey(s: String): String = s.lowercase()
    .replace("æ", "ae").replace("ø", "o").replace("å", "a").replace("ü", "u").replace("ö", "o").replace("ä", "a").replace("é", "e")
    .replace(Regex("^(vipps\\*|klarna\\*|iz \\*|sumup \\*|paypal \\*|zettle_\\*|varekjop |visa |kortkjop )"), "")
    .replace(Regex("[^a-z0-9]"), "")

/** Oppslag: domene først, deretter navn/alias (eksakt, så prefiks). */
class LogoIndex(items: List<LogoRegItem>) {
    private val byDomain = HashMap<String, LogoRegItem>()
    private val byKey = HashMap<String, LogoRegItem>()
    private val keys: List<Pair<String, LogoRegItem>>

    init {
        for (it in items) {
            it.domain?.lowercase()?.removePrefix("www.")?.let { d -> byDomain.putIfAbsent(d, it) }
            (listOf(it.name, it.id) + it.alias).map(::logoKey).filter { k -> k.length >= 2 }.forEach { k -> byKey.putIfAbsent(k, it) }
        }
        keys = byKey.entries.map { it.key to it.value }.filter { it.first.length >= 3 }.sortedByDescending { it.first.length }
    }

    fun find(domain: String?, name: String?): LogoRegItem? {
        domain?.trim()?.lowercase()?.removePrefix("www.")?.takeIf { it.isNotBlank() }?.let { d -> byDomain[d]?.let { return it } }
        val k = name?.let(::logoKey)?.takeIf { it.length >= 2 } ?: return null
        byKey[k]?.let { return it }
        return keys.firstOrNull { (key, _) -> k.startsWith(key) }?.second
    }
}

/** Lokal nøkkel for rekkefølgen på Finans-flisene (samme navn som i PWA-en). */
const val FM_ORDER_KEY = "papir_fm_order"
