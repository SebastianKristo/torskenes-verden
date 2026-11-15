package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject

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
