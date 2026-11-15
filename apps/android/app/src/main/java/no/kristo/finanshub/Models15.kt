package no.kristo.finanshub

import org.json.JSONObject

/** Fanene Finans-linja kan ha (opptil 4, «Mer» er alltid sist). */
val FIN_TABS: List<Pair<String, String>> = listOf(
    "oversikt" to "Oversikt", "liste" to "Liste", "finn" to "Finn", "sok" to "Søk", "budsjett" to "Budsjett",
    "kvitt" to "Kvitteringer", "aksjer" to "Aksjer", "abo" to "Abonnementer", "kontoer" to "Kontoer", "boliger" to "Boliger",
    "chat" to "Chat",
)

val FIN_TABS_DEFAULT = listOf("oversikt", "liste", "finn", "sok")

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
