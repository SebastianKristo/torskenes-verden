package no.kristo.felles

import no.kristo.felles.tid.OsloDato
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** shared/testvektorer/idag.json: «i dag» er Oslo-datoen rundt midnatt og ved bytte til og fra sommertid (Q20). */
class OsloDatoTest {
    @Test fun vektorene() {
        val liste = Repo.vektorer("idag")
        assertTrue(liste.size >= 10)
        for (v in liste) {
            val t = Instant.parse(v.getString("utc"))
            assertEquals(v.getString("id") + " (" + v.optString("merknad") + ")", v.getString("oslo"), OsloDato.iDagTekst(t))
        }
    }

    @Test fun klokkaErOsloTid() {
        // 23:30 UTC om vinteren = 00:30 i Oslo.
        assertEquals(30, OsloDato.minuttIDag(Instant.parse("2026-11-15T23:30:00Z")))
        // 22:15 UTC om sommeren = 00:15 i Oslo.
        assertEquals(15, OsloDato.minuttIDag(Instant.parse("2026-06-30T22:15:00Z")))
    }
}
