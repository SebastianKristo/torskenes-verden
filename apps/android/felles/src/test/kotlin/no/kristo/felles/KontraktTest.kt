package no.kristo.felles

import no.kristo.felles.kontrakt.Bruker
import no.kristo.felles.kontrakt.Innlogging
import no.kristo.felles.kontrakt.Serverversjon
import no.kristo.felles.nett.Feilsvar
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant

/**
 * Eksemplene i shared/schemas/eksempler (Fase 2) mot kontrakten og mot tolkingen i :felles. Samme eksempler leses av
 * iOS (ContractDecodingTests). Eksemplene lages med `npm run kontrakt:eksempler`.
 */
class KontraktTest {
    private val mappe: File get() = File(Repo.rot, "shared/schemas/eksempler")

    private fun skjemaFor(navn: String): File =
        if (navn == "error") Repo.fil("shared/schemas/common/error.schema.json") else Repo.fil("shared/schemas/api/$navn.schema.json")

    /** Påkrevde felt og grunntype for feltene på øverste nivå (ingen full JSON Schema-validering; den gjør npm test). */
    @Test fun alleEksemplerHarSkjemaOgPakrevdeFelt() {
        val filer = mappe.listFiles { f -> f.name.endsWith(".json") }!!.sortedBy { it.name }
        assertTrue("fant eksempler", filer.size >= 10)
        for (f in filer) {
            val navn = f.name.removeSuffix(".json")
            val skjema = JSONObject(skjemaFor(navn).readText())
            val tekst = f.readText().trim()
            if (skjema.optString("type") == "array" || tekst.startsWith("[")) { JSONArray(tekst); continue }
            val o = JSONObject(tekst)
            val req = skjema.optJSONArray("required") ?: JSONArray()
            for (i in 0 until req.length()) assertTrue("$navn: mangler ${req.getString(i)}", o.has(req.getString(i)))
            val props = skjema.optJSONObject("properties") ?: continue
            for (k in o.keys()) {
                val p = props.optJSONObject(k) ?: continue
                val v = o.get(k)
                val typer: List<String> = when (val t = p.opt("type")) {
                    is String -> listOf(t)
                    is JSONArray -> (0 until t.length()).map { t.getString(it) }
                    else -> continue
                }
                val ok = typer.any { t ->
                    when (t) {
                        "string" -> v is String
                        "integer" -> v is Int || v is Long
                        "number" -> v is Number
                        "boolean" -> v is Boolean
                        "array" -> v is JSONArray
                        "object" -> v is JSONObject
                        "null" -> v == JSONObject.NULL
                        else -> true
                    }
                }
                assertTrue("$navn.$k: ventet $typer, fikk ${v.javaClass.simpleName}", ok)
            }
        }
    }

    @Test fun feilsvar() {
        val f = Feilsvar.fra(Repo.fil("shared/schemas/eksempler/error.json").readText(), 401)
        assertEquals("Ikke innlogget", f.error)
        assertEquals(Feilsvar.HOMELAB_AUTH, f.code)
        assertEquals("invalid", f.reason)
        assertTrue("401 HOMELAB_AUTH logger ut", f.tokenUgyldig(401))
        assertFalse(f.tokenUgyldig(403))
        assertFalse(f.utlopt)
        val utlopt = Feilsvar.fra("""{"error":"Innloggingen er utløpt","code":"TOKEN_EXPIRED","reason":"expired"}""", 401)
        assertTrue(utlopt.tokenUgyldig(401))
        assertTrue(utlopt.utlopt)
        assertFalse(Feilsvar.fra("""{"error":"Feil passord","code":"LOGIN_FAILED"}""", 401).tokenUgyldig(401))
        // Eldre svar: norsk «kode», og ingen JSON i det hele tatt.
        assertEquals("modell_utilgjengelig", Feilsvar.fra("""{"error":"x","kode":"modell_utilgjengelig"}""", 503).code)
        val html = Feilsvar.fra("<html>", 502)
        assertEquals("Feil 502", html.error)
        assertEquals("", html.code)
    }

    @Test fun innlogging() {
        val i = Innlogging.fra(Repo.json("shared/schemas/eksempler/auth-token.json"))
        assertNotNull(i)
        assertTrue(i!!.token.isNotBlank())
        assertEquals("sebastian", i.bruker?.username)
        assertTrue(i.bruker!!.erAdmin)
        assertTrue(i.glidende)
        assertTrue("finance:read" in i.scopes)
        assertEquals(Instant.parse("2027-05-14T17:00:26.770Z"), i.utloper)
        assertFalse(i.utlopt(Instant.parse("2026-11-16T10:00:00Z")))
        assertTrue(i.utlopt(Instant.parse("2027-05-14T17:00:26.770Z")))
        assertEquals(null, Innlogging.fra(JSONObject("""{"user":{"username":"x"}}""")))
    }

    @Test fun bruker() {
        val b = Bruker.fra(Repo.json("shared/schemas/eksempler/me.json"))
        assertEquals("owner", b.id)
        assertEquals("Sebastian", b.displayName)
        assertTrue(b.erAdmin)
    }

    @Test fun serverversjon() {
        val v = Serverversjon.fra(Repo.json("shared/schemas/eksempler/version.json"))
        assertTrue(v.version.isNotBlank())
        assertTrue(v.contract >= 1)
        assertFalse(v.forGammelApp(v.minClient))
        assertTrue(v.forGammelApp("0.9"))
        assertEquals(0, Serverversjon.sammenlign("4.0", "4.0.0"))
        assertTrue(Serverversjon.sammenlign("4.10.0", "4.9.9") > 0)
    }
}
