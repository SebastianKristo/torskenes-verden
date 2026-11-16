package no.kristo.felles.moduler

import org.json.JSONArray
import org.json.JSONObject

/*
 * Modullisten (Fase 6, E-ia §4): én liste over moduler, navn, ikoner, grupper, faste faner og innstillingssider for alle
 * plattformene. Kilden er shared/schemas/moduler.json, og serveren leverer den per bruker på GET /api/moduler?plattform=android
 * (kontrakten er shared/schemas/api/moduler.schema.json). Appene henter lista, bufrer den og bruker den sist kjente uten nett.
 * Mangler den også, brukes kopien som Gradle legger inn i :felles ved bygging ([Modulliste.innebygd]), så det finnes ingen
 * egen håndskrevet liste i appene.
 */

/** Ikonet til en modul: tegnet (web og reserve), SF Symbol (Apple) og Material-navnet (Android). */
data class ModulIkon(val tegn: String, val sf: String, val material: String)

/** En fane, visning eller et filter inne i en modul (f.eks. Kalender: År, Måned …, Familie, Bursdager). */
data class Underside(
    val id: String,
    val navn: String,
    /** Kort navn der plassen er liten (kalendervisningene: «Mnd», «3 d»). Ellers [navn]. */
    val kort: String,
    /** «fane», «visning» eller «filter». */
    val type: String,
    val rute: String,
    val aliaser: List<String>,
)

data class Modul(
    val id: String,
    val navn: String,
    val gruppe: String,
    val ikon: ModulIkon,
    val plattformer: List<String>,
    val adminOnly: Boolean,
    /** Tilgangen modulen krever («media», «bibel»), ellers null. Serveren sender bare moduler brukeren har tilgang til. */
    val tilgang: String?,
    /** «ark» når modulen åpnes som ark (Brief, Nyheter), ellers null. */
    val type: String?,
    val rute: String,
    val aliaser: List<String>,
    val undersider: List<Underside>,
) {
    fun finnesPa(plattform: String): Boolean = plattform in plattformer

    /** Undersidene av én type («visning», «filter», «fane») i listens rekkefølge. */
    fun undersider(type: String): List<Underside> = undersider.filter { it.type == type }
}

data class Modulgruppe(val id: String, val navn: String)

/** En side i Innstillinger, i fast rekkefølge (Konto og sikkerhet, Utseende, … Server). */
data class Innstillingsside(val id: String, val navn: String, val beskrivelse: String, val adminOnly: Boolean, val aliaser: List<String>)

/** Treffet for en rute: modulen og eventuelt undersiden (fane, visning eller filter). */
data class Rutetreff(val modul: Modul, val underside: Underside?)

data class Modulliste(
    val versjon: Int,
    val grupper: List<Modulgruppe>,
    val toppmeny: List<String>,
    val bunnmeny: List<String>,
    val moduler: List<Modul>,
    val innstillinger: List<Innstillingsside>,
) {
    fun modul(id: String): Modul? = moduler.firstOrNull { it.id == id }

    fun navn(id: String): String? = modul(id)?.navn

    /** Lista for én plattform (serveren gjør det samme med ?plattform=). */
    fun forPlattform(plattform: String): Modulliste = copy(moduler = moduler.filter { it.finnesPa(plattform) })

    /** Lista uten admin-moduler og admin-sider (reserven når brukeren ikke er admin). */
    fun utenAdmin(): Modulliste = copy(moduler = moduler.filterNot { it.adminOnly }, innstillinger = innstillinger.filterNot { it.adminOnly })

    /** Modulene i en gruppe, i listens rekkefølge. */
    fun iGruppe(gruppe: String): List<Modul> = moduler.filter { it.gruppe == gruppe }

    /** Innstillingssiden med [id] eller et av aliasene («sikkerhet» → Konto og sikkerhet). */
    fun innstilling(id: String): Innstillingsside? {
        val k = id.trim().lowercase()
        return innstillinger.firstOrNull { it.id == k } ?: innstillinger.firstOrNull { k in it.aliaser }
    }

    /**
     * Modulen (og eventuelt undersiden) en rute eller en gammel rute peker på. Godtar «#/gjoremal», «gjoremal», «/finans/»
     * og aliasene («#/huskeliste» → Gjøremål, «#/bursdager» → Kalender · Bursdager, «#/kart» → Reise · Kart).
     */
    fun finnRute(rute: String): Rutetreff? {
        val r = normRute(rute)
        if (r.isEmpty()) return null
        // Undersider først, så «#/kalender/bursdager» ikke treffer selve Kalender.
        for (m in moduler) for (u in m.undersider) {
            val egen = normRute(u.rute) != normRute(m.rute) && normRute(u.rute) == r
            if (egen || u.aliaser.any { normRute(it) == r }) return Rutetreff(m, u)
        }
        for (m in moduler) {
            if (normRute(m.rute) == r || m.id == r || m.aliaser.any { normRute(it) == r }) return Rutetreff(m, null)
        }
        return null
    }

    fun tilJson(): JSONObject = JSONObject()
        .put("versjon", versjon)
        .put("grupper", JSONArray().apply { grupper.forEach { put(JSONObject().put("id", it.id).put("navn", it.navn)) } })
        .put("toppmeny", JSONArray(toppmeny))
        .put("bunnmeny", JSONArray(bunnmeny))
        .put("moduler", JSONArray().apply { moduler.forEach { put(modulJson(it)) } })
        .put("innstillinger", JSONArray().apply {
            innstillinger.forEach { s ->
                put(JSONObject().put("id", s.id).put("navn", s.navn).put("beskrivelse", s.beskrivelse).put("adminOnly", s.adminOnly).put("aliaser", JSONArray(s.aliaser)))
            }
        })

    companion object {
        /** Stien til kopien av shared/schemas/moduler.json som Gradle legger inn i :felles (build.gradle.kts, processResources). */
        const val RESSURS: String = "/no/kristo/felles/moduler/moduler.json"

        /** Tolker svaret fra GET /api/moduler eller selve moduler.json. null når teksten ikke er en gyldig modulliste. */
        fun fra(tekst: String): Modulliste? = runCatching { fra(JSONObject(tekst)) }.getOrNull()

        fun fra(o: JSONObject): Modulliste? {
            val versjon: Int = o.optInt("versjon", 0)
            val mods: JSONArray = o.optJSONArray("moduler") ?: return null
            if (versjon < 1) return null
            val moduler: List<Modul> = objekter(mods).mapNotNull { lesModul(it) }
            if (moduler.isEmpty()) return null
            val grupper: List<Modulgruppe> = objekter(o.optJSONArray("grupper")).mapNotNull { g ->
                val id = g.optString("id")
                if (id.isBlank()) null else Modulgruppe(id, g.optString("navn", id))
            }
            val innstillinger: List<Innstillingsside> = objekter(o.optJSONArray("innstillinger")).mapNotNull { s ->
                val id = s.optString("id")
                if (id.isBlank()) null
                else Innstillingsside(id, s.optString("navn", id), s.optString("beskrivelse"), s.optBoolean("adminOnly", false), strenger(s.optJSONArray("aliaser")))
            }
            return Modulliste(versjon, grupper, strenger(o.optJSONArray("toppmeny")), strenger(o.optJSONArray("bunnmeny")), moduler, innstillinger)
        }

        /** Kopien som er bygd inn i appen (shared/schemas/moduler.json da appen ble bygd). */
        fun innebygd(): Modulliste? = innebygdTekst()?.let { fra(it) }

        fun innebygdTekst(): String? = runCatching {
            Modulliste::class.java.getResourceAsStream(RESSURS)?.use { s -> String(s.readBytes(), Charsets.UTF_8) }
        }.getOrNull()

        /** «#/gjoremal/» → «gjoremal», «/finans/» → «finans», «homelab://reise/kart» → «reise/kart». */
        fun normRute(rute: String): String {
            var r = rute.trim().lowercase()
            val skille = r.indexOf("://")
            if (skille >= 0) r = r.substring(skille + 3)
            r = r.removePrefix("/").removePrefix("#").removePrefix("/").removeSuffix("/")
            return r
        }

        private fun lesModul(m: JSONObject): Modul? {
            val id = m.optString("id")
            if (id.isBlank()) return null
            val ik: JSONObject = m.optJSONObject("ikon") ?: JSONObject()
            val undersider: List<Underside> = objekter(m.optJSONArray("undersider")).mapNotNull { u ->
                val uid = u.optString("id")
                if (uid.isBlank()) null
                else {
                    val navn = u.optString("navn", uid)
                    Underside(uid, navn, u.optString("kort").ifBlank { navn }, u.optString("type"), u.optString("rute"), strenger(u.optJSONArray("aliaser")))
                }
            }
            return Modul(
                id = id,
                navn = m.optString("navn", id),
                gruppe = m.optString("gruppe"),
                ikon = ModulIkon(ik.optString("tegn"), ik.optString("sf"), ik.optString("material")),
                plattformer = strenger(m.optJSONArray("plattformer")),
                adminOnly = m.optBoolean("adminOnly", false),
                tilgang = m.optString("tilgang").takeIf { it.isNotBlank() },
                type = m.optString("type").takeIf { it.isNotBlank() },
                rute = m.optString("rute"),
                aliaser = strenger(m.optJSONArray("aliaser")),
                undersider = undersider,
            )
        }

        private fun modulJson(m: Modul): JSONObject {
            val o = JSONObject()
                .put("id", m.id).put("navn", m.navn).put("gruppe", m.gruppe)
                .put("ikon", JSONObject().put("tegn", m.ikon.tegn).put("sf", m.ikon.sf).put("material", m.ikon.material))
                .put("plattformer", JSONArray(m.plattformer)).put("adminOnly", m.adminOnly)
            if (m.tilgang != null) o.put("tilgang", m.tilgang)
            if (m.type != null) o.put("type", m.type)
            val us = JSONArray()
            for (u in m.undersider) {
                us.put(JSONObject().put("id", u.id).put("navn", u.navn).put("kort", u.kort).put("type", u.type).put("rute", u.rute).put("aliaser", JSONArray(u.aliaser)))
            }
            return o.put("rute", m.rute).put("aliaser", JSONArray(m.aliaser)).put("undersider", us)
        }

        private fun objekter(a: JSONArray?): List<JSONObject> {
            if (a == null) return emptyList()
            val ut = ArrayList<JSONObject>()
            for (i in 0 until a.length()) a.optJSONObject(i)?.let { ut.add(it) }
            return ut
        }

        private fun strenger(a: JSONArray?): List<String> {
            if (a == null) return emptyList()
            val ut = ArrayList<String>()
            for (i in 0 until a.length()) {
                val s = a.optString(i)
                if (s.isNotBlank()) ut.add(s)
            }
            return ut
        }
    }
}
