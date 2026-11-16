package no.kristo.felles.moduler

import org.json.JSONObject

/*
 * Grupperingen av integrasjonene (E-ia O8): shared/schemas/tilkoblinger.json. Serveren sender gruppenavnet som category i
 * GET /api/integrations og /api/config; appen grupperer etter det. Kopien som Gradle bygger inn i :felles, brukes når en eldre
 * server ikke sender category, så gruppene er de samme som på web.
 */
data class Tilkoblinger(
    /** Gruppenavnene i fast rekkefølge («Smarthjem», «Kalender og e-post» … «Generelt»). */
    val grupper: List<String>,
    /** Integrasjons-id → gruppenavn. */
    val integrasjoner: Map<String, String>,
) {
    /** Gruppen for en integrasjon. Ukjent id gir «Generelt» (som på serveren). */
    fun gruppe(id: String): String = integrasjoner[id.trim().lowercase()] ?: GENERELT

    /** [kategori] fra serveren når den er en av gruppene, ellers gruppen for [id]. */
    fun gruppe(id: String, kategori: String?): String = kategori?.takeIf { it in grupper } ?: gruppe(id)

    companion object {
        const val RESSURS: String = "/no/kristo/felles/moduler/tilkoblinger.json"
        const val GENERELT: String = "Generelt"

        fun fra(tekst: String): Tilkoblinger? = runCatching {
            val o = JSONObject(tekst)
            val ga = o.getJSONArray("grupper")
            val navn = LinkedHashMap<String, String>()
            for (i in 0 until ga.length()) {
                val g = ga.getJSONObject(i)
                navn[g.getString("id")] = g.optString("navn", g.getString("id"))
            }
            val io = o.getJSONObject("integrasjoner")
            val map = LinkedHashMap<String, String>()
            for (k in io.keys()) map[k.lowercase()] = navn[io.getString(k)] ?: GENERELT
            Tilkoblinger(navn.values.toList(), map)
        }.getOrNull()

        /** Kopien som er bygd inn i appen (shared/schemas/tilkoblinger.json da appen ble bygd). */
        fun innebygd(): Tilkoblinger? = runCatching {
            Tilkoblinger::class.java.getResourceAsStream(RESSURS)?.use { s -> String(s.readBytes(), Charsets.UTF_8) }
        }.getOrNull()?.let { fra(it) }
    }
}
