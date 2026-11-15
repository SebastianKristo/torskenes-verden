package no.kristo.felles.kontrakt

import org.json.JSONObject
import java.time.Instant

/*
 * Svarene alle tre appene trenger, tolket én gang etter kontrakten i shared/schemas (Fase 2). Testene (KontraktTest) leser
 * eksemplene i shared/schemas/eksempler, så en endring i kontrakten som appene ikke tåler, stopper CI.
 */

/** Brukeren (GET /api/me, og user i innloggingssvaret). */
data class Bruker(val id: String, val username: String, val role: String, val name: String, val displayName: String) {
    val erAdmin: Boolean get() = role == "admin"

    companion object {
        fun fra(o: JSONObject): Bruker {
            val username = o.optString("username")
            val name = o.optString("name").ifBlank { username }
            return Bruker(o.optString("id"), username, o.optString("role").ifBlank { "member" }, name, o.optString("displayName").ifBlank { name })
        }
    }
}

/**
 * Innloggingssvaret (POST /finans/api/login, /finans/api/auth/token; auth-token.schema.json). Tokenet er glidende (Q23):
 * [utloper] flyttes fram hver gang det brukes, og utløper etter 180 dager uten bruk.
 */
data class Innlogging(val token: String, val bruker: Bruker?, val scopes: List<String>, val utloper: Instant?, val glidende: Boolean) {
    /** Utløpt ved [naa] (brukes for å be om ny innlogging før kallet feiler). Ukjent utløp regnes som gyldig. */
    fun utlopt(naa: Instant = Instant.now()): Boolean = utloper?.let { !naa.isBefore(it) } ?: false

    companion object {
        /** null når svaret ikke har noe token (feil adresse eller en nettside). */
        fun fra(o: JSONObject): Innlogging? {
            val token = o.optString("token").takeIf { it.isNotBlank() } ?: return null
            val scopes = o.optJSONArray("scopes")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList()
            val utloper = o.optString("expiresAt").takeIf { it.isNotBlank() }?.let { runCatching { Instant.parse(it) }.getOrNull() }
                ?: o.optLong("expires", 0L).takeIf { it > 0 }?.let { Instant.ofEpochMilli(it) }
            return Innlogging(token, o.optJSONObject("user")?.let(Bruker::fra), scopes, utloper, o.optBoolean("sliding", false))
        }
    }
}

/** GET /api/version (version.schema.json): om appen er for gammel for serveren. */
data class Serverversjon(val version: String, val minClient: String, val contract: Int, val api: Int, val features: Set<String>) {
    /** true når [appVersjon] er eldre enn minClient. */
    fun forGammelApp(appVersjon: String): Boolean = sammenlign(appVersjon, minClient) < 0

    fun har(feature: String): Boolean = feature in features

    companion object {
        fun fra(o: JSONObject): Serverversjon {
            val f = o.optJSONArray("features")?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet()
            return Serverversjon(o.optString("version"), o.optString("minClient", "0.0.0"), o.optInt("contract", 0), o.optInt("api", 0), f)
        }

        /** Semver-sammenligning av «x.y.z» (manglende ledd = 0, tekst etter tallet ignoreres). */
        fun sammenlign(a: String, b: String): Int {
            fun ledd(s: String): List<Int> = s.trim().split('.').map { p -> p.takeWhile { it.isDigit() }.toIntOrNull() ?: 0 }
            val x = ledd(a); val y = ledd(b)
            for (i in 0 until maxOf(x.size, y.size)) {
                val d = (x.getOrNull(i) ?: 0).compareTo(y.getOrNull(i) ?: 0)
                if (d != 0) return d
            }
            return 0
        }
    }
}
