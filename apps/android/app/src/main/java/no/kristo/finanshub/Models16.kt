package no.kristo.finanshub

import org.json.JSONArray
import org.json.JSONObject

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
