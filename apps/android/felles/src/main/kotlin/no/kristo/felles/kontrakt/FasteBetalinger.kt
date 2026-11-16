package no.kristo.felles.kontrakt

import org.json.JSONArray
import org.json.JSONObject

/*
 * Faste betalinger i Økonomi (Q4): GET /finans/api/faste-betalinger (finans-faste-betalinger.schema.json). Serveren regner
 * neste trekk (Oslo), dager igjen, månedssum, årssum, teksten og trekkdagene; appen viser dem og regner ikke selv.
 */

/** Ett av filtrene: Abonnementer, Faste utgifter eller Planlagte trekk, med antall og sum fra serveren. */
data class Betalingsfilter(
    /** «abonnementer», «faste» eller «planlagte». */
    val id: String,
    val navn: String,
    val antall: Int,
    val aktive: Int?,
    val maned: Double?,
    val ar: Double?,
    /** Planlagte trekk: summen for perioden og antall dager. */
    val sum: Double?,
    val dager: Int?,
    /** Faste utgifter som også er abonnement (telles under Abonnementer). */
    val dubletter: Int?,
)

/** Et abonnement eller en fast utgift. */
data class Betaling(
    val key: String,
    /** «abonnement» eller «fast». */
    val kind: String,
    val id: Int,
    val navn: String,
    val plan: String?,
    val belop: Double,
    val maned: Double,
    val ar: Double,
    val syklus: String,
    val syklusnavn: String,
    val perTekst: String,
    val nesteDato: String?,
    val nesteTekst: String?,
    val dagerIgjen: Int?,
    /** Ferdig tekst fra serveren, f.eks. «Månedlig · neste trekk 20. nov.». */
    val label: String,
    val aktiv: Boolean,
    val kategori: String?,
    val kilde: String,
    /** Satt når en fast utgift er samme tjeneste som et abonnement (telles ikke i summene). */
    val dublettAv: String?,
) {
    /** Filteret betalingen hører til. */
    val filter: String get() = if (kind == "abonnement") "abonnementer" else "faste"
}

/** Et planlagt trekk de neste dagene. */
data class PlanlagtTrekk(val dato: String, val label: String, val kind: String, val id: Int?, val navn: String, val belop: Double, val konto: String?, val kilde: String)

data class FasteBetalinger(
    val idag: String,
    val maned: String,
    val filtre: List<Betalingsfilter>,
    val betalinger: List<Betaling>,
    val manedSum: Double,
    val arSum: Double,
    val planlagte: List<PlanlagtTrekk>,
    val planlagtSum: Double,
    val planlagtDager: Int,
) {
    fun filter(id: String): Betalingsfilter? = filtre.firstOrNull { it.id == id }

    /** Betalingene i et filter, i serverens rekkefølge. */
    fun i(filter: String): List<Betaling> = betalinger.filter { it.filter == filter }

    companion object {
        val FILTRE: List<String> = listOf("abonnementer", "faste", "planlagte")

        fun fra(tekst: String): FasteBetalinger? = runCatching { fra(JSONObject(tekst)) }.getOrNull()

        fun fra(o: JSONObject): FasteBetalinger? {
            val items: JSONArray = o.optJSONArray("items") ?: return null
            val filtre = ArrayList<Betalingsfilter>()
            val fa = o.optJSONArray("filters") ?: JSONArray()
            for (i in 0 until fa.length()) {
                val f = fa.optJSONObject(i) ?: continue
                val id = f.optString("id")
                if (id.isBlank()) continue
                filtre.add(Betalingsfilter(id, f.optString("name", id), f.optInt("count", 0), optInt(f, "active"), optNum(f, "monthly"), optNum(f, "yearly"), optNum(f, "total"), optInt(f, "days"), optInt(f, "duplicates")))
            }
            val betalinger = ArrayList<Betaling>()
            for (i in 0 until items.length()) {
                val b = items.optJSONObject(i) ?: continue
                betalinger.add(
                    Betaling(
                        key = b.optString("key"), kind = b.optString("kind"), id = b.optInt("id", 0), navn = b.optString("name"),
                        plan = optStr(b, "plan"), belop = b.optDouble("amount", 0.0), maned = b.optDouble("monthly", 0.0), ar = b.optDouble("yearly", 0.0),
                        syklus = b.optString("cycle"), syklusnavn = b.optString("cycleName"), perTekst = b.optString("perLabel"),
                        nesteDato = optStr(b, "nextDate"), nesteTekst = optStr(b, "nextLabel"), dagerIgjen = optInt(b, "daysLeft"),
                        label = b.optString("label"), aktiv = b.optBoolean("active", true), kategori = optStr(b, "category"),
                        kilde = b.optString("source"), dublettAv = optStr(b, "duplicateOf"),
                    ),
                )
            }
            val p: JSONObject = o.optJSONObject("planned") ?: JSONObject()
            val planlagte = ArrayList<PlanlagtTrekk>()
            val pa = p.optJSONArray("items") ?: JSONArray()
            for (i in 0 until pa.length()) {
                val t = pa.optJSONObject(i) ?: continue
                planlagte.add(PlanlagtTrekk(t.optString("date"), t.optString("label"), t.optString("kind"), optInt(t, "id"), t.optString("name"), t.optDouble("amount", 0.0), optStr(t, "account"), t.optString("source")))
            }
            return FasteBetalinger(
                o.optString("today"), o.optString("month"), filtre, betalinger, o.optDouble("monthly", 0.0), o.optDouble("yearly", 0.0),
                planlagte, p.optDouble("total", 0.0), p.optInt("days", 0),
            )
        }

        private fun optStr(o: JSONObject, k: String): String? = if (!o.has(k) || o.isNull(k)) null else o.optString(k).takeIf { it.isNotBlank() }

        private fun optInt(o: JSONObject, k: String): Int? = if (!o.has(k) || o.isNull(k)) null else o.optInt(k)

        private fun optNum(o: JSONObject, k: String): Double? = if (!o.has(k) || o.isNull(k)) null else o.optDouble(k)
    }
}
