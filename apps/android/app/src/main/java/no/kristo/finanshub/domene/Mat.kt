@file:JvmName("DomeneMat")

package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.time.Instant
import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject

/*
 * Mat: kode som lå i blandingsfilene (P36.kt, Models13.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/* ======================= Matplan (felles) ======================= */

private fun hm36(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    val inst = runCatching { Instant.parse(raw) }.getOrNull() ?: raw.toLongOrNull()?.let { Instant.ofEpochMilli(it) } ?: return null
    val t = inst.atZone(OSLO36)
    val today = LocalDate.now(OSLO36)
    val hm = "%02d.%02d".format(t.hour, t.minute)
    return when (t.toLocalDate()) {
        today -> hm
        today.minusDays(1) -> "i går $hm"
        else -> "%d.%d. %s".format(t.dayOfMonth, t.monthValue, hm)
    }
}

/** «Felles for husstanden · Endret av Nina 18.42» fra /week (sharedNote, eller updatedBy + updatedAt). */
fun mealNote36(raw: String): String {
    val o = runCatching { JSONObject(raw) }.getOrNull() ?: return "Felles for husstanden"
    o.s36("sharedNote")?.let { return it }
    val by = o.s36("updatedByName") ?: o.optJSONObject("updatedBy")?.let { it.s36("name") ?: it.s36("username") } ?: o.s36("updatedBy")
    val at = hm36(o.s36("updatedAt"))
    return listOfNotNull("Felles for husstanden", by?.let { "Endret av $it" + (at?.let { a -> " $a" } ?: "") }).joinToString(" · ")
}

/** Sanntid: «meal:changed» → uka lastes på nytt, og «Oppdatert av Nina» hvis det var en annen. */
fun AppViewModel.onMealChanged36(msg: JSONObject) {
    val by = msg.s36("byName") ?: msg.optJSONObject("by")?.s36("name") ?: msg.s36("updatedBy") ?: msg.s36("by")
    val mine = by != null && (by.equals(me?.username, true) || by.equals(displayName, true) || by == account?.id)
    launch36 {
        runCatching { loadWeek() }
        if (!mine && by != null) flash(msg.s36("text") ?: "Oppdatert av $by")
    }
}

/* ---------------- Mat: mapper, oppskrifter og lenker (/mat/api) ---------------- */

data class MatFolder(val id: String, val name: String, val sort: Int, val count: Int)

data class DishLink(val id: String, val title: String, val url: String?, val fileUrl: String?, val kind: String) {
    /** Etiketten som vises ved ikonet. */
    val kindLabel: String get() = when (kind) {
        "sheet" -> "Regneark"; "pdf" -> "PDF"; "video" -> "Video"; "doc" -> "Dokument"; "image" -> "Bilde"; else -> "Lenke"
    }
}

data class RecipePreview(
    val name: String, val image: String?, val time: String?, val servings: String?, val ingredients: List<String>, val steps: List<String>,
    val sourceUrl: String?, val folderSuggestion: String?, val method: String?, val raw: String,
)

data class RecipeJob(val id: String, val status: String, val error: String?, val dishId: String?, val name: String?) {
    val active: Boolean get() = status == "queued" || status == "reading"
}

fun parseMatFolders(s: String): List<MatFolder> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONObject(t).optJSONArray("folders") ?: JSONArray()
    return a.map { MatFolder(it.idStr(), it.optString("name"), it.optInt("sort"), it.optInt("count")) }.sortedBy { it.sort }
}

fun parseDishLinks(a: JSONArray?): List<DishLink> = a?.map {
    DishLink(it.idStr(), it.optString("title").ifBlank { it.optString("url") }, it.optStr("url"), it.optStr("fileUrl") ?: it.optStr("file_url"), it.optStr("kind") ?: "link")
} ?: emptyList()

fun parseRecipePreview(s: String): RecipePreview {
    val root = JSONObject(s)
    val o = root.optJSONObject("preview") ?: root
    fun lines(k: String): List<String> = o.optJSONArray(k)?.let { a ->
        (0 until a.length()).mapNotNull { i ->
            when (val v = a.opt(i)) { is String -> v; is JSONObject -> v.optStr("text") ?: v.optStr("name"); else -> v?.toString() }?.trim()?.takeIf { it.isNotBlank() }
        }
    } ?: emptyList()
    fun any(k: String): String? = if (!o.has(k) || o.isNull(k)) null else o.opt(k).toString().takeIf { it.isNotBlank() }
    return RecipePreview(
        o.optString("name"), o.optStr("image"), any("time"), any("servings"), lines("ingredients"), lines("steps"),
        o.optStr("sourceUrl"), o.optStr("folderSuggestion"), o.optStr("method"), o.toString(),
    )
}

fun parseRecipeJobs(s: String): List<RecipeJob> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONObject(t).optJSONArray("jobs") ?: JSONArray()
    return a.map { RecipeJob(it.idStr(), it.optString("status"), it.optStr("error"), it.optStr("dishId"), it.optStr("name")) }
}
