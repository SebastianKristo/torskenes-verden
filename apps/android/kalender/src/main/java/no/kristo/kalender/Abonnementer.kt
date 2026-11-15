package no.kristo.kalender

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.mutableStateOf
import org.json.JSONObject
import java.time.LocalDate

/*
 * Prompt 42: Abonnementer – trekkdatoer fra Finans (Subscription OS) som egen kalender i Kalender-appen.
 * Fasit: Kalender App.dc.html → CALS {k:'ab', n:'Abonnementer', c:'#3d7f8a', tx:'#2a5c64', lt:'#8fcdd6', src:'Finans'} og AB i events().
 * Serveren sender kalenderen (source 'finans'/'builtin', badge INNEBYGD) og heldagshendelser med kind 'trekk' | 'trial', subId, amount,
 * currency, account, logo, interval … (alle valgfrie). Ikke redigerbare i Kalender – arket sier «Endres i Finans → Abonnementer».
 * Måned: «3 trekk · 627 kr» når tre eller flere trekk faller på samme dag. Varsler: Av · Dagen før · Prøveperioder og årlige (standard).
 */

/** Feltene fra Finans på én trekk-hendelse (KEv.ab). sum > 0 = sammendraget «3 trekk · 627 kr» i Måned. */
data class KAb42(
    val subId: String = "", val name: String = "", val amount: Double? = null, val currency: String = "NOK", val account: String = "",
    val logo: String = "", val interval: String = "", val intervalText: String = "", val next: String = "", val cancelUrl: String = "",
    val cancelled: String = "", val badge: String = "TREKK", val varies: Boolean = false, val sum: Int = 0,
) {
    fun toJson(): JSONObject = JSONObject().put("subId", subId).put("name", name).put("amount", amount ?: JSONObject.NULL).put("currency", currency)
        .put("account", account).put("logo", logo).put("interval", interval).put("intervalText", intervalText).put("next", next)
        .put("cancelUrl", cancelUrl).put("cancelled", cancelled).put("badge", badge).put("varies", varies)

    companion object {
        fun fromJson(o: JSONObject?): KAb42? = o?.let {
            KAb42(
                it.optString("subId"), it.optString("name"), if (it.isNull("amount") || !it.has("amount")) null else it.optDouble("amount"),
                it.optString("currency", "NOK"), it.optString("account"), it.optString("logo"), it.optString("interval"), it.optString("intervalText"),
                it.optString("next"), it.optString("cancelUrl"), it.optString("cancelled"), it.optString("badge", "TREKK"), it.optBoolean("varies", false),
            )
        }
    }
}

object Ab42 {
    const val HEX = 0xFF3D7F8A
    val CAL_IDS = setOf("ab", "abonnementer", "subscriptions", "abo", "finans-ab")

    fun isAbCal(c: KCal): Boolean = c.id.lowercase() in CAL_IDS || (c.serverId?.lowercase() ?: "") in CAL_IDS ||
        (c.p39?.source ?: c.src ?: "").lowercase().let { it == "finans" || it == "subscriptions" } || c.n.equals("Abonnementer", true) && c.src == "builtin"

    private fun JSONObject.s(vararg k: String): String = k.firstNotNullOfOrNull { optStrOrNull(it) } ?: ""

    /** Fra serverens hendelse (parseServerEvent). null = ikke et trekk. */
    fun parse(o: JSONObject, title: String, rawCal: String?): KAb42? {
        val src = JSONObject(o.toString())
        for (k in listOf("sub", "subscription", "finans", "meta")) o.optJSONObject(k)?.let { n -> n.keys().forEach { a -> if (!src.has(a)) src.put(a, n.get(a)) } }
        val kind = o.optStrOrNull("kind")?.lowercase().orEmpty()
        val source = o.optStrOrNull("source")?.lowercase().orEmpty()
        val subId = src.s("subId", "subscriptionId")
        val fromAb = (rawCal?.lowercase() ?: "") in CAL_IDS || source == "finans" || source == "subscriptions"
        val trekk = kind in setOf("trekk", "charge", "renewal", "fornyelse")
        if (!(trekk || fromAb || (kind == "trial" && subId.isNotEmpty()))) return null
        val interval = src.s("interval", "cycle").lowercase()
        val badge0 = src.s("badge").uppercase()
        val amount = if (src.has("amount") && !src.isNull("amount")) src.optDouble("amount").takeIf { !it.isNaN() } else if (src.has("price") && !src.isNull("price")) src.optDouble("price").takeIf { !it.isNaN() } else null
        val badge = when {
            kind == "trial" || badge0 == "PRØVE" -> "PRØVE"
            badge0 == "ÅRLIG" || interval in setOf("yearly", "annual", "year", "arlig", "årlig") || kind == "renewal" || kind == "fornyelse" -> "ÅRLIG"
            else -> "TREKK"
        }
        return KAb42(
            subId = subId, name = src.s("name", "subName").ifEmpty { baseName(title) }, amount = amount, currency = src.s("currency").ifEmpty { "NOK" }.uppercase(),
            account = src.s("account"), logo = src.s("logo", "logoUrl"), interval = interval, intervalText = src.s("intervalText", "intervalLabel"),
            next = src.s("nextCharge", "next").take(10), cancelUrl = src.s("cancelUrl", "cancelURL"), cancelled = src.s("cancelled", "cancelledText"),
            badge = badge, varies = src.optBoolean("varies", false) || src.optBoolean("variable", false) || title.contains("varierer") || title.contains("ca."),
        )
    }

    fun baseName(t: String): String = t.substringBefore(" · ").substringBefore(": prøveperioden").removeSuffix(" fornyes").trim()

    fun short(e: KEv): String { val x = e.ab ?: return e.t; return if (x.sum > 0) e.t else x.name.ifEmpty { baseName(e.t) } }

    /** 1486 → «1 486», 149.5 → «149,50». */
    fun num(v: Double): String {
        val a = Math.abs(v)
        var whole = a.toLong()
        var cents = Math.round((a - whole) * 100)
        if (cents == 100L) { whole += 1; cents = 0 }
        val g = whole.toString().reversed().chunked(3).joinToString(" ").reversed()
        return (if (v < 0) "−" else "") + g + if (cents > 0) "," + cents.toString().padStart(2, '0') else ""
    }

    fun money(v: Double, cur: String = "NOK"): String = if (cur.isEmpty() || cur.equals("NOK", true) || cur.equals("KR", true)) num(v) + " kr" else num(v) + " " + cur

    fun amountText(e: KEv): String {
        val x = e.ab ?: return ""
        val a = x.amount ?: return if (x.varies) "varierer" else ""
        return (if (x.varies) "ca. " else "") + money(a, x.currency)
    }

    fun intervalText(e: KEv): String {
        val x = e.ab ?: return ""
        if (x.intervalText.isNotEmpty()) return x.intervalText
        val d = e.d.dayOfMonth
        return when (x.interval) {
            "yearly", "annual", "year", "arlig", "årlig" -> "Hvert år $d. " + MN[e.d.monthValue - 1]
            "quarterly", "kvartal" -> "Hvert kvartal den $d."
            "weekly", "ukentlig" -> "Hver uke på " + WD[e.d.jsDay]
            "" -> if (e.kind == "trial") "Prøveperiode" else "Hver måned den $d."
            else -> "Hver måned den $d."
        }
    }

    /** Måned: tre eller flere trekk samme dag → én chip «3 trekk · 627 kr» (prøveperioder vises for seg). Par = (hendelse, fortsettelse). */
    fun collapse(list: List<Pair<KEv, Boolean>>, min: Int = 3): List<Pair<KEv, Boolean>> {
        val subs = list.filter { (e, cont) -> e.ab != null && e.kind != "trial" && !cont }
        if (subs.size < min) return list
        val total = subs.sumOf { it.first.ab?.amount ?: 0.0 }
        val f = subs.first().first
        val title = "${subs.size} trekk · " + money(total)
        val sum = KEv("ab42-sum-${f.d}", title, f.cal, f.d, null, null, kind = "trekk", editable = false, ab = KAb42(name = title, amount = total, sum = subs.size))
        val ids = subs.map { it.first.id }.toSet()
        val out = ArrayList<Pair<KEv, Boolean>>()
        var placed = false
        for (p in list) {
            if (p.first.id in ids && !p.second) { if (!placed) { out += sum to false; placed = true }; continue }
            out += p
        }
        return out
    }

    fun total(all: List<KEv>, from: LocalDate, to: LocalDate): Pair<Int, Double> {
        val l = all.filter { it.ab != null && it.kind != "trial" && !it.d.isBefore(from) && !it.d.isAfter(to) }
        return l.size to l.sumOf { it.ab?.amount ?: 0.0 }
    }

    /** «… Denne uka: 3 trekk på til sammen 627 kr.» */
    fun weekLine(all: List<KEv>, from: LocalDate, to: LocalDate): String {
        val (n, s) = total(all, from, to)
        return when (n) { 0 -> ""; 1 -> " Ett trekk denne uka: " + money(s) + "."; else -> " Denne uka: $n trekk på til sammen " + money(s) + "." }
    }

    private val Q = Regex("(trekk|trekkes|abonnement|abonnementer|\\babo\\b|fornyes|prøveperiode)")

    /** Hurtigvei uten LLM: «Hva trekkes denne uka?», «Når trekkes Netflix?», «Hvor mye går ut i abonnementer i november?». */
    fun answer(ql: String, all: List<KEv>, T: LocalDate, sun: Boolean = false): KAns? {
        if (!Q.containsMatchIn(ql)) return null
        val subs = all.filter { it.ab != null && !it.d.isBefore(T) }.sortedBy { it.d }
        val steps = listOf("Ser i Abonnementer", "Regner sammen trekk")
        if (subs.isEmpty()) return KAns(steps, "Jeg finner ingen kommende trekk i Abonnementer. Er kalenderen slått på i Finans?")
        if (ql.contains("når")) {
            subs.firstOrNull { e -> val n = short(e).lowercase().substringBefore(' '); n.length >= 3 && ql.contains(n) }?.let { e ->
                val a = amountText(e)
                return KAns(listOf("Ser i Abonnementer"), short(e) + " trekkes " + fd(e.d) + (if (a.isEmpty()) "" else " ($a)") + ".", listOf(e))
            }
        }
        MN.forEachIndexed { i, m ->
            if (ql.contains(m)) {
                val y = if (i + 1 < T.monthValue) T.year + 1 else T.year
                val from = LocalDate.of(y, i + 1, 1)
                val to = from.withDayOfMonth(from.lengthOfMonth())
                val (n, s) = total(all, from, to)
                val l = all.filter { it.ab != null && it.kind != "trial" && !it.d.isBefore(from) && !it.d.isAfter(to) }.sortedBy { it.d }
                return KAns(steps, if (n == 0) "Ingen trekk i $m." else "I $m går det ut " + money(s) + " i abonnementer ($n trekk).", l.take(6))
            }
        }
        var to = T.plusDays(30)
        var label = "de neste 30 dagene"
        if (ql.contains("uka") || ql.contains("uken") || ql.contains("denne uke")) { to = wkStart35(T, sun).plusDays(6); label = "denne uka" }
        if (ql.contains("i dag")) { to = T; label = "i dag" }
        if (ql.contains("i morgen")) { to = T.plusDays(1); label = "i dag og i morgen" }
        val l = subs.filter { !it.d.isAfter(to) }
        val (n, s) = total(l, T, to)
        val sb = StringBuilder()
        if (n == 0) {
            sb.append("Ingen trekk $label.")
            subs.firstOrNull { it.kind != "trial" }?.let { sb.append(" Neste er ").append(short(it)).append(" ").append(fd(it.d)).append(".") }
        } else {
            val names = l.filter { it.kind != "trial" }.take(4).map { short(it) }
            sb.append(if (n == 1) "Ett trekk " else "$n trekk ").append(label).append(" på til sammen ").append(money(s)).append(": ").append(names.joinToString(", ")).append(if (n > 4) " …" else "").append(".")
        }
        l.firstOrNull { it.kind == "trial" }?.let { sb.append(" Prøveperioden for ").append(short(it)).append(" slutter ").append(fd(it.d)).append(".") }
        return KAns(steps, sb.toString(), l.take(6))
    }

    /* ---------- Varsler ---------- */

    private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences("kalender_prefs", Context.MODE_PRIVATE)

    /** off | day | special (standard). Tilstanden er også en Compose-state, så Innstillinger tegnes på nytt. */
    val modeState = mutableStateOf<String?>(null)
    fun mode(ctx: Context): String = modeState.value ?: (p(ctx).getString("p42_nab", "special") ?: "special")
    fun setMode(ctx: Context, v: String) { p(ctx).edit().putString("p42_nab", v).apply(); modeState.value = v }

    /** Dager før trekket det skal varsles (09:00). */
    fun notifyDays(ctx: Context, e: KEv): List<Int> {
        val x = e.ab ?: return emptyList()
        if (x.sum > 0) return emptyList()
        val m = mode(ctx)
        if (m == "off") return emptyList()
        return when {
            e.kind == "trial" -> listOf(2, 1)
            x.badge == "ÅRLIG" -> if (m == "day") listOf(7, 1) else listOf(7)
            m == "day" -> listOf(1)
            else -> emptyList()
        }
    }

    fun notifyText(e: KEv, days: Int): String {
        val x = e.ab
        val whenT = if (days == 1) "i morgen" else "om $days dager"
        val a = amountText(e)
        return if (e.kind == "trial") "Prøveperioden slutter $whenT" + (if (a.isEmpty()) "" else " · deretter $a")
        else (if (x?.badge == "ÅRLIG") "Fornyes " else "Trekkes ") + whenT + (if (a.isEmpty()) "" else " · $a") + (if (x?.account.isNullOrEmpty()) "" else " · " + x?.account)
    }

    /* ---------- Lenker ---------- */

    /** finanshub://abonnement/{subId} i Homelab-appen; ellers Subscription OS på web (<server>/finans/#/sub). */
    fun openFinans(ctx: Context, e: KEv, server: String?) {
        val id = e.ab?.subId.orEmpty()
        val app = Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://abonnement" + if (id.isEmpty()) "" else "/" + Uri.encode(id))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val ok = runCatching { ctx.startActivity(app); true }.getOrDefault(false)
        if (ok || server.isNullOrBlank()) return
        runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(server.trimEnd('/') + "/finans/#/sub")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }

    fun openUrl(ctx: Context, url: String) {
        runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}
