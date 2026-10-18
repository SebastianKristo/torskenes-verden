package no.kristo.finanshub.widget

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import no.kristo.finanshub.AppPrefs
import no.kristo.finanshub.doubles
import no.kristo.finanshub.map
import no.kristo.finanshub.num
import no.kristo.finanshub.optDoubleOrNull
import no.kristo.finanshub.optIntOrNull
import no.kristo.finanshub.optStr
import org.json.JSONObject

/*
 * Data til hjemskjerm-widgetene (GET /api/mobile/widgets). Felt som serveren ikke kan hente er null,
 * og widgeten viser da en kort tekst i stedet. Svaret caches på enheten, så widgetene har noe å vise uten nett.
 */

data class WHourW(val t: String, val symbol: String, val temp: Double?)
data class WWeather(val temp: Double?, val symbol: String, val desc: String, val hi: Double?, val lo: Double?, val feels: Double?, val place: String, val hours: List<WHourW>)
data class WPackage(val id: String, val name: String, val carrier: String, val carrierName: String, val status: String, val statusText: String, val step: Int, val eta: String, val pickupPoint: String) {
    val ready get() = status == "ready_for_pickup"
}
data class WPackages(val items: List<WPackage>, val active: Int)
data class WBudgetRow(val name: String, val spent: Double, val limit: Double, val color: String?)
data class WBudget(val month: String, val spent: Double, val limit: Double, val left: Double, val pct: Double, val daysLeft: Int?, val top: List<WBudgetRow>)
data class WTx(val id: String, val date: String, val merchant: String, val amount: Double, val category: String)
data class WFinance(val balance: Double, val currency: String, val recent: List<WTx>, val toReview: Int)
data class WCharge(val name: String, val amount: Double, val date: String, val daysLeft: Int?, val monthly: Double?)
data class WStock(val ticker: String, val name: String, val changePct: Double)
data class WStocks(val value: Double, val change: Double, val changePct: Double, val top: List<WStock>, val series: List<Double>)
data class WDomain(val name: String, val visits: Double?, val uptime: Double?, val up: Boolean)
data class WDomains(val total: Int, val up: Int, val down: Int, val expiringSoon: List<Pair<String, Int>>, val items: List<WDomain>)
data class WMat(val todayDish: String?, val todayCook: String?, val tomorrowDish: String?)
data class WFinnItem(val title: String, val step: String, val status: String, val sold: Boolean?)
data class WFinn(val active: Int, val netYear: Double, val items: List<WFinnItem>)
data class WDue(val title: String, val amount: Double, val date: String)
data class WBolig(val name: String, val month: Double?, val dueSoon: List<WDue>)

data class WidgetData(
    val updatedAt: Long, val weather: WWeather?, val packages: WPackages?, val budget: WBudget?, val finance: WFinance?,
    val nextCharge: WCharge?, val stocks: WStocks?, val domains: WDomains?, val matplan: WMat?, val finn: WFinn?, val boliger: WBolig?,
    /** Feilmelding fra siste henting (vises bare når det ikke finnes data fra før). */
    val error: String? = null, val loggedIn: Boolean = true,
) {
    companion object {
        val EMPTY = WidgetData(0, null, null, null, null, null, null, null, null, null, null)

        fun parse(s: String, fetchedAt: Long): WidgetData {
            val o = JSONObject(s)
            fun obj(k: String): JSONObject? = o.optJSONObject(k)
            return WidgetData(
                updatedAt = fetchedAt,
                weather = obj("weather")?.let { w ->
                    WWeather(w.optDoubleOrNull("temp"), w.optStr("symbol") ?: "", w.optStr("desc") ?: w.optStr("text") ?: "", w.optDoubleOrNull("hi") ?: w.optDoubleOrNull("max"),
                        w.optDoubleOrNull("lo") ?: w.optDoubleOrNull("min"), w.optDoubleOrNull("feels"), w.optStr("place") ?: "",
                        w.optJSONArray("hours")?.map { h -> WHourW(h.optStr("t") ?: h.optStr("time") ?: "", h.optStr("symbol") ?: "", h.optDoubleOrNull("temp")) } ?: emptyList())
                },
                packages = obj("packages")?.let { p ->
                    val items = p.optJSONArray("items")?.map { i ->
                        WPackage(i.optString("id"), i.optString("name", "Pakke"), i.optString("carrier"), i.optString("carrierName"), i.optString("status"),
                            i.optString("statusText"), i.optInt("step", 0), i.optString("eta"), i.optString("pickupPoint"))
                    } ?: emptyList()
                    WPackages(items, p.optIntOrNull("active") ?: items.size)
                },
                budget = obj("budget")?.let { b ->
                    WBudget(b.optString("month"), b.num("spent"), b.num("limit"), b.num("left"), b.num("pct"), b.optIntOrNull("daysLeft"),
                        b.optJSONArray("top")?.map { r -> WBudgetRow(r.optString("name"), r.num("spent"), r.num("limit"), r.optStr("color")) } ?: emptyList())
                },
                finance = obj("finance")?.let { f ->
                    WFinance(f.num("balance"), f.optString("currency", "NOK"),
                        f.optJSONArray("recent")?.map { t -> WTx(t.optString("id"), t.optString("date"), t.optString("merchant"), t.num("amount"), t.optString("category")) } ?: emptyList(),
                        f.optInt("toReview", 0))
                },
                nextCharge = obj("nextCharge")?.let { c -> WCharge(c.optString("name"), c.num("amount"), c.optString("date"), c.optIntOrNull("daysLeft"), c.optDoubleOrNull("monthly")) },
                stocks = obj("stocks")?.let { st ->
                    WStocks(st.num("value"), st.num("change"), st.num("changePct"),
                        st.optJSONArray("top")?.map { x -> WStock(x.optString("ticker"), x.optString("name"), x.num("changePct")) } ?: emptyList(),
                        st.optJSONArray("series").doubles())
                },
                domains = obj("domains")?.let { d ->
                    WDomains(d.optInt("total", 0), d.optInt("up", 0), d.optInt("down", 0),
                        d.optJSONArray("expiringSoon")?.map { e -> e.optString("name") to e.optInt("days", 0) } ?: emptyList(),
                        (d.optJSONArray("items") ?: d.optJSONArray("top"))?.map { e ->
                            WDomain(e.optString("name"), e.optDoubleOrNull("visits") ?: e.optDoubleOrNull("visits24h"), e.optDoubleOrNull("uptime"), e.optString("status", "active") != "down")
                        } ?: emptyList())
                },
                matplan = obj("matplan")?.let { m ->
                    WMat(m.optJSONObject("today")?.optStr("dish"), m.optJSONObject("today")?.optStr("cook"), m.optJSONObject("tomorrow")?.optStr("dish"))
                },
                finn = obj("finn")?.let { f ->
                    WFinn(f.optInt("active", 0), f.num("netYear"),
                        f.optJSONArray("items")?.map { i -> WFinnItem(i.optString("title"), i.optString("step"), i.optString("status"), if (i.has("sold")) i.optBoolean("sold") else null) } ?: emptyList())
                },
                boliger = obj("boliger")?.let { b ->
                    WBolig(b.optString("name", "Bolig"), b.optDoubleOrNull("month") ?: b.optDoubleOrNull("monthTotal"),
                        b.optJSONArray("dueSoon")?.map { d -> WDue(d.optString("title"), d.num("amount"), d.optString("date")) } ?: emptyList())
                },
            )
        }
    }
}

/** Utseendet på Samsung-widgetene (Innstillinger → Utseende → Widgets). */
data class WidgetStyle(val alpha: Int, val theme: String) {
    companion object {
        fun load(ctx: Context): WidgetStyle {
            val p = AppPrefs(ctx)
            return WidgetStyle(p.int(AppPrefs.W_ALPHA, 75).coerceIn(0, 100), p.str(AppPrefs.W_THEME, "system"))
        }
    }
}

/**
 * Felles tilstand for widgetene i appens prosess. Glance-øktene samler denne, så en ny henting (WorkManager)
 * eller et nytt utseende tegner widgetene på nytt uten at økten må startes om.
 */
object WidgetStore {
    private const val FILE = "finanshub_widgets"
    private val _data = MutableStateFlow<WidgetData?>(null)
    private val _style = MutableStateFlow<WidgetStyle?>(null)
    val data: StateFlow<WidgetData?> get() = _data
    val style: StateFlow<WidgetStyle?> get() = _style

    /** Siste svar fra disk (første gang i prosessen). */
    fun current(ctx: Context): WidgetData {
        _data.value?.let { return it }
        val p = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        val raw = p.getString("json", null)
        val d = raw?.let { runCatching { WidgetData.parse(it, p.getLong("at", 0)) }.getOrNull() } ?: WidgetData.EMPTY
        _data.value = d
        return d
    }

    fun currentStyle(ctx: Context): WidgetStyle = _style.value ?: WidgetStyle.load(ctx).also { _style.value = it }

    fun save(ctx: Context, json: String, at: Long) {
        val d = WidgetData.parse(json, at)
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString("json", json).putLong("at", at).remove("error").apply()
        _data.value = d
    }

    fun fail(ctx: Context, message: String, loggedIn: Boolean = true) {
        _data.value = current(ctx).copy(error = message, loggedIn = loggedIn)
    }

    fun reloadStyle(ctx: Context) { _style.value = WidgetStyle.load(ctx) }
}
