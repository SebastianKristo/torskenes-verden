package no.kristo.finanshub

import org.json.JSONObject

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
